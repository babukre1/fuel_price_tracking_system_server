const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("./model");
const Station = require("../station/model");
const UserStationFollow = require("./stationFollow.model");
const {
  prepareCode,
  sendCode,
  mayResend,
  verifyCode,
  preparePasswordResetCode,
  sendPasswordResetCode,
  maySendPasswordReset,
  verifyPasswordResetCode,
} = require("../utils/emailVerification");

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const hashRefreshToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const issueSession = async (user) => {
  const refreshToken = crypto.randomBytes(48).toString("hex");
  const now = new Date();
  const activeTokens = (user.refreshTokens ?? [])
    .filter((entry) => entry.expiresAt > now)
    .slice(-4);

  activeTokens.push({
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  user.refreshTokens = activeTokens;
  await user.save();

  return {
    token: jwt.sign(
      { id: user._id, role: "user", tokenVersion: user.tokenVersion ?? 0 },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_TTL },
    ),
    refreshToken,
  };
};

const formatUser = (user) => ({
  id: user._id,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone,
  location: user.location,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const getId = (value) => value?._id || value;

const formatFollow = (follow) => ({
  id: follow._id,
  user: getId(follow.user),
  station: follow.station,
  createdByAdmin: follow.createdByAdmin,
  createdAt: follow.createdAt,
  updatedAt: follow.updatedAt,
});

const loadFollowStation = (query) =>
  query.populate({
    path: "station",
    select: "name phone address city status isActive fuelTypes supplier location",
    populate: { path: "supplier", select: "companyName email phone" },
  });

const findFollowableStation = (stationId) =>
  Station.findOne({
    _id: stationId,
    isActive: true,
    status: "APPROVED",
  });

// ─── Register ────────────────────────────────────────────────────────────────

const register = async (req, res) => {
  try {
    const { fullName, email, phone, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email already in use",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const verification = {};
    const code = prepareCode(verification);
    const user = await User.create({
      fullName,
      email,
      phone: phone || undefined,
      password: hashedPassword,
      emailVerified: false,
      ...verification,
    });
    let emailSent = true;
    try {
      await sendCode(user.email, code);
    } catch (error) {
      emailSent = false;
      console.error("Customer verification email failed:", error);
    }

    return res.status(201).json({
      success: true,
      message: emailSent
        ? "Check your email for a verification code"
        : "Account created, but email could not be sent. Please request a new code.",
      data: formatUser(user),
      emailSent,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: error.keyPattern?.phone
          ? "Phone number already in use"
          : "Email already in use",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Registration failed",
    });
  }
};

// ─── Login ───────────────────────────────────────────────────────────────────

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select(
      "+tokenVersion +refreshTokens",
    );
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is deactivated",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (user.emailVerified === false) {
      return res.status(403).json({
        success: false,
        message: "Verify your email before signing in",
        code: "EMAIL_NOT_VERIFIED",
      });
    }

    const session = await issueSession(user);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      ...session,
      data: formatUser(user),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};

const refreshSession = async (req, res) => {
  try {
    const tokenHash = hashRefreshToken(req.body.refreshToken);
    const user = await User.findOne({
      "refreshTokens.tokenHash": tokenHash,
    }).select("+refreshTokens +tokenVersion");

    const storedToken = user?.refreshTokens.find(
      (entry) => entry.tokenHash === tokenHash,
    );
    if (!user || !user.isActive || user.emailVerified === false || !storedToken || storedToken.expiresAt <= new Date()) {
      if (user) {
        user.refreshTokens = user.refreshTokens.filter(
          (entry) => entry.tokenHash !== tokenHash,
        );
        await user.save();
      }
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token",
      });
    }

    user.refreshTokens = user.refreshTokens.filter(
      (entry) => entry.tokenHash !== tokenHash,
    );
    const session = await issueSession(user);
    return res.status(200).json({ success: true, ...session });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Session refresh failed",
    });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email }).select(
      "+emailVerificationCodeHash +emailVerificationExpiresAt +emailVerificationSentAt +emailVerificationAttempts",
    );
    if (!user || user.emailVerified !== false) {
      return res.status(400).json({ success: false, message: "Invalid verification request" });
    }
    const valid = verifyCode(user, req.body.code);
    await user.save();
    if (!valid) {
      return res.status(400).json({ success: false, message: "Invalid or expired code" });
    }
    return res.json({ success: true, message: "Email verified. You can now sign in." });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Email verification failed" });
  }
};

const resendVerification = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email }).select(
      "+emailVerificationCodeHash +emailVerificationExpiresAt +emailVerificationSentAt +emailVerificationAttempts",
    );
    if (!user || user.emailVerified !== false) {
      return res.json({ success: true, message: "If the account needs verification, a code will be sent." });
    }
    if (!mayResend(user)) {
      return res.status(429).json({ success: false, message: "Please wait a minute before requesting another code" });
    }
    const code = prepareCode(user);
    await user.save();
    await sendCode(user.email, code);
    return res.json({ success: true, message: "Verification code sent" });
  } catch (error) {
    console.error("Customer verification resend failed:", error);
    return res.status(502).json({ success: false, message: "Could not send verification email. Try again later." });
  }
};

const forgotPassword = async (req, res) => {
  const message = "If an account exists for that email, a reset code has been sent.";
  try {
    const user = await User.findOne({ email: req.body.email }).select(
      "+passwordResetCodeHash +passwordResetExpiresAt +passwordResetSentAt +passwordResetAttempts",
    );
    if (!user || !user.isActive || !maySendPasswordReset(user)) {
      return res.json({ success: true, message });
    }

    const code = preparePasswordResetCode(user);
    await user.save();
    await sendPasswordResetCode(user.email, code);
    return res.json({ success: true, message });
  } catch (error) {
    console.error("Customer password reset email failed:", error);
    return res.json({ success: true, message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email }).select(
      "+passwordResetCodeHash +passwordResetExpiresAt +passwordResetSentAt +passwordResetAttempts +tokenVersion +refreshTokens",
    );
    if (!user || !verifyPasswordResetCode(user, req.body.code)) {
      if (user) await user.save();
      return res.status(400).json({ success: false, message: "Invalid or expired reset code" });
    }

    user.password = await bcrypt.hash(req.body.newPassword, 10);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    user.refreshTokens = [];
    await user.save();
    return res.json({ success: true, message: "Password reset successfully. Please sign in." });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Password reset failed" });
  }
};

const logout = async (req, res) => {
  try {
    const tokenHash = hashRefreshToken(req.body.refreshToken);
    await User.updateOne(
      { "refreshTokens.tokenHash": tokenHash },
      { $pull: { refreshTokens: { tokenHash } } },
    );
    return res.status(200).json({ success: true, message: "Logged out" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Logout failed" });
  }
};

// ─── Get Profile ─────────────────────────────────────────────────────────────

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
      error: error.message,
    });
  }
};

// ─── Update Profile ───────────────────────────────────────────────────────────

const updateProfile = async (req, res) => {
  try {
    const { fullName, phone } = req.body;

    const updated = await User.findByIdAndUpdate(
      req.user.id,
      { fullName, phone },
      { new: true, runValidators: true },
    ).select("-password");

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated",
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Update failed",
      error: error.message,
    });
  }
};

// ─── Update Location ──────────────────────────────────────────────────────────

const updateLocation = async (req, res) => {
  try {
    const { longitude, latitude } = req.body;

    if (longitude === undefined || latitude === undefined) {
      return res.status(400).json({
        success: false,
        message: "longitude and latitude are required",
      });
    }

    const updated = await User.findByIdAndUpdate(
      req.user.id,
      {
        location: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
      },
      { new: true },
    ).select("-password");

    return res.status(200).json({
      success: true,
      message: "Location updated",
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update location",
      error: error.message,
    });
  }
};

// ─── Change Password ──────────────────────────────────────────────────────────

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id).select(
      "+tokenVersion +refreshTokens",
    );
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    user.refreshTokens = [];
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to change password",
      error: error.message,
    });
  }
};

// ─── Deactivate Account ───────────────────────────────────────────────────────

const deactivateAccount = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { isActive: false });

    return res.status(200).json({
      success: true,
      message: "Account deactivated",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to deactivate account",
      error: error.message,
    });
  }
};

const getMyStationFollows = async (req, res) => {
  try {
    const follows = await loadFollowStation(
      UserStationFollow.find({ user: req.user.id }).sort({ createdAt: -1 }),
    );

    return res.status(200).json({
      success: true,
      message: "Followed stations loaded",
      data: follows.map(formatFollow),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load followed stations",
      error: error.message,
    });
  }
};

const followStation = async (req, res) => {
  try {
    const station = await findFollowableStation(req.params.stationId);
    if (!station) {
      return res.status(404).json({
        success: false,
        message: "Station not found or unavailable to follow",
      });
    }

    const follow = await UserStationFollow.findOneAndUpdate(
      { user: req.user.id, station: station._id },
      { $setOnInsert: { user: req.user.id, station: station._id } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    const populated = await loadFollowStation(
      UserStationFollow.findById(follow._id),
    );

    return res.status(200).json({
      success: true,
      message: "Station followed",
      data: formatFollow(populated),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to follow station",
      error: error.message,
    });
  }
};

const unfollowStation = async (req, res) => {
  try {
    await UserStationFollow.deleteOne({
      user: req.user.id,
      station: req.params.stationId,
    });

    return res.status(200).json({
      success: true,
      message: "Station unfollowed",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to unfollow station",
      error: error.message,
    });
  }
};

const registerDeviceToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({
        success: false,
        message: "token is required",
      });
    }

    await User.updateOne(
      { _id: req.user.id },
      { $addToSet: { deviceTokens: token } },
    );

    return res.status(200).json({
      success: true,
      message: "Device token registered",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to register device token",
      error: error.message,
    });
  }
};

const removeDeviceToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({
        success: false,
        message: "token is required",
      });
    }

    await User.updateOne(
      { _id: req.user.id },
      { $pull: { deviceTokens: token } },
    );

    return res.status(200).json({
      success: true,
      message: "Device token removed",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to remove device token",
      error: error.message,
    });
  }
};

const getUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Customer users loaded",
      data: users.map(formatUser),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load customer users",
      error: error.message,
    });
  }
};

const createUser = async (req, res) => {
  try {
    const { fullName, email, phone, password, isActive } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "fullName, email, and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email already in use",
      });
    }

    if (phone) {
      const phoneExists = await User.findOne({ phone });
      if (phoneExists) {
        return res.status(409).json({
          success: false,
          message: "Phone number already in use",
        });
      }
    }

    const user = await User.create({
      fullName,
      email,
      phone: phone || undefined,
      password: await bcrypt.hash(password, 10),
      isActive: isActive !== undefined ? isActive : true,
    });

    return res.status(201).json({
      success: true,
      message: "Customer user created successfully",
      data: formatUser(user),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create customer user",
      error: error.message,
    });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer user not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Customer user loaded",
      data: formatUser(user),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load customer user",
      error: error.message,
    });
  }
};

const updateUser = async (req, res) => {
  try {
    const { fullName, email, phone, isActive } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer user not found",
      });
    }

    if (email && email !== user.email) {
      const emailExists = await User.findOne({
        email,
        _id: { $ne: user._id },
      });

      if (emailExists) {
        return res.status(409).json({
          success: false,
          message: "Email already in use",
        });
      }
    }

    if (phone && phone !== user.phone) {
      const phoneExists = await User.findOne({
        phone,
        _id: { $ne: user._id },
      });

      if (phoneExists) {
        return res.status(409).json({
          success: false,
          message: "Phone number already in use",
        });
      }
    }

    if (fullName !== undefined) user.fullName = fullName;
    if (email !== undefined) user.email = email;
    if (phone !== undefined) user.phone = phone || undefined;
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Customer user updated successfully",
      data: formatUser(user),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update customer user",
      error: error.message,
    });
  }
};

const deactivateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer user not found",
      });
    }

    user.isActive = false;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Customer user deactivated successfully",
      data: formatUser(user),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to deactivate customer user",
      error: error.message,
    });
  }
};

const getUserStationFollows = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("_id");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer user not found",
      });
    }

    const follows = await loadFollowStation(
      UserStationFollow.find({ user: user._id }).sort({ createdAt: -1 }),
    );

    return res.status(200).json({
      success: true,
      message: "Customer followed stations loaded",
      data: follows.map(formatFollow),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to load customer followed stations",
      error: error.message,
    });
  }
};

const followStationForUser = async (req, res) => {
  try {
    const [user, station] = await Promise.all([
      User.findById(req.params.id).select("_id"),
      findFollowableStation(req.params.stationId),
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer user not found",
      });
    }

    if (!station) {
      return res.status(404).json({
        success: false,
        message: "Station not found or unavailable to follow",
      });
    }

    const follow = await UserStationFollow.findOneAndUpdate(
      { user: user._id, station: station._id },
      {
        $setOnInsert: {
          user: user._id,
          station: station._id,
          createdByAdmin: req.user.id,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    const populated = await loadFollowStation(
      UserStationFollow.findById(follow._id),
    );

    return res.status(200).json({
      success: true,
      message: "Station followed for customer",
      data: formatFollow(populated),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to follow station for customer",
      error: error.message,
    });
  }
};

const unfollowStationForUser = async (req, res) => {
  try {
    await UserStationFollow.deleteOne({
      user: req.params.id,
      station: req.params.stationId,
    });

    return res.status(200).json({
      success: true,
      message: "Station unfollowed for customer",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to unfollow station for customer",
      error: error.message,
    });
  }
};

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  login,
  refreshSession,
  logout,
  getProfile,
  updateProfile,
  updateLocation,
  changePassword,
  deactivateAccount,
  getMyStationFollows,
  followStation,
  unfollowStation,
  registerDeviceToken,
  removeDeviceToken,
  getUsers,
  createUser,
  getUserById,
  updateUser,
  deactivateUser,
  getUserStationFollows,
  followStationForUser,
  unfollowStationForUser,
};
