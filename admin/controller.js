const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const userAdmin = require("./model");

const MAX_LOGIN_ATTEMPTS = 3;
const LOCK_TIME_MS = 1 * 60 * 1000;

// Generate JWT token..
const generateToken = (id) => {
  return jwt.sign(
    { id, role: "admin" },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    },
  );
};

const getLockMinutesRemaining = (lockUntil) => {
  if (!lockUntil) return 0;

  return Math.ceil((lockUntil.getTime() - Date.now()) / (60 * 1000));
};

const formatAdmin = (admin) => ({
  id: admin._id,
  fullName: admin.fullName,
  email: admin.email,
  phone: admin.phone,
  isApproved: admin.isApproved,
  isActive: admin.isActive,
  createdAt: admin.createdAt,
  updatedAt: admin.updatedAt,
});

// SIGNUP
exports.signup = async (req, res) => {
  try {
    const { fullName, email, phone, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const emailExists = await userAdmin.findOne({ email });

    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    if (phone) {
      const phoneExists = await userAdmin.findOne({ phone });

      if (phoneExists) {
        return res.status(400).json({
          success: false,
          message: "Phone number already exists",
        });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = await userAdmin.create({
      fullName,
      email,
      phone,
      password: hashedPassword,
    });

    res.status(201).json({
      success: true,
      message: "Admin registered successfully",
      data: {
        id: newAdmin._id,
        fullName: newAdmin.fullName,
        email: newAdmin.email,
        phone: newAdmin.phone,
        isApproved: newAdmin.isApproved,
        isActive: newAdmin.isActive,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Signup failed",
      error: error.message,
    });
  }
};

// LOGIN
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const admin = await userAdmin.findOne({ email });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (admin.lockUntil && admin.lockUntil > Date.now()) {
      return res.status(429).json({
        success: false,
        message: `Too many failed login attempts. Try again in ${getLockMinutesRemaining(
          admin.lockUntil,
        )} minutes.`,
      });
    }

    if (admin.lockUntil && admin.lockUntil <= Date.now()) {
      admin.loginAttempts = 0;
      admin.lockUntil = null;
      await admin.save();
    }

    const isPasswordMatch = await bcrypt.compare(password, admin.password);

    if (!isPasswordMatch) {
      admin.loginAttempts = (admin.loginAttempts || 0) + 1;

      if (admin.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        admin.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
        await admin.save();

        return res.status(429).json({
          success: false,
          message:
            "Too many failed login attempts. Login is locked for 30 minutes.",
        });
      }

      await admin.save();

      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive",
      });
    }

    if (!admin.isApproved) {
      return res.status(403).json({
        success: false,
        message: "Your account is not approved yet",
      });
    }

    if (admin.loginAttempts || admin.lockUntil) {
      admin.loginAttempts = 0;
      admin.lockUntil = null;
      await admin.save();
    }

    const token = generateToken(admin._id);

    res.status(200).json({
      success: true,
      message: `Login successful`,
      token,
      data: {
        id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
        phone: admin.phone,
        isApproved: admin.isApproved,
        isActive: admin.isActive,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Login failed",
      error: error.message,
    });
  }
};

// FORGOT PASSWORD
exports.forgotPassword = async (req, res) => {
  try {
    const { email, newPassword, confirmPassword } = req.body;

    if (!email || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, new password, and confirm password are required",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const admin = await userAdmin.findOne({ email });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin with this email does not exist",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    admin.password = hashedPassword;
    admin.loginAttempts = 0;
    admin.lockUntil = null;
    await admin.save();

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Forgot password failed",
      error: error.message,
    });
  }
};

// GET ADMIN USERS
exports.getAdminUsers = async (req, res) => {
  try {
    const admins = await userAdmin.find().select("-password");

    res.status(200).json({
      success: true,
      message: "Admin users loaded",
      data: admins.map(formatAdmin),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load admin users",
    });
  }
};

// CREATE ADMIN USER
exports.createAdminUser = async (req, res) => {
  try {
    const { fullName, email, phone, password, isApproved, isActive } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const emailExists = await userAdmin.findOne({ email });

    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    if (phone) {
      const phoneExists = await userAdmin.findOne({ phone });

      if (phoneExists) {
        return res.status(400).json({
          success: false,
          message: "Phone number already exists",
        });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = await userAdmin.create({
      fullName,
      email,
      phone,
      password: hashedPassword,
      isApproved,
      isActive,
    });

    res.status(201).json({
      success: true,
      message: "Admin user created successfully",
      data: formatAdmin(newAdmin),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create admin user",
    });
  }
};

// UPDATE ADMIN USER
exports.updateAdminUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, email, phone, isApproved, isActive } = req.body;

    if (req.user.id === id && (isActive === false || isApproved === false)) {
      return res.status(400).json({
        success: false,
        message: "You cannot deactivate or disapprove your own account",
      });
    }

    const admin = await userAdmin.findById(id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin user not found",
      });
    }

    if (email) {
      const emailExists = await userAdmin.findOne({
        email,
        _id: { $ne: id },
      });

      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Email already exists",
        });
      }
    }

    if (phone) {
      const phoneExists = await userAdmin.findOne({
        phone,
        _id: { $ne: id },
      });

      if (phoneExists) {
        return res.status(400).json({
          success: false,
          message: "Phone number already exists",
        });
      }
    }

    if (fullName !== undefined) admin.fullName = fullName;
    if (email !== undefined) admin.email = email;
    if (phone !== undefined) admin.phone = phone;
    if (isApproved !== undefined) admin.isApproved = isApproved;
    if (isActive !== undefined) admin.isActive = isActive;

    await admin.save();

    res.status(200).json({
      success: true,
      message: "Admin user updated successfully",
      data: formatAdmin(admin),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update admin user",
    });
  }
};

// CHANGE ADMIN PASSWORD
exports.changeAdminPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password, confirmPassword, currentPassword } = req.body;
    const isChangingOwnPassword = req.user.id === id;

    if (!password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Password and confirm password are required",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const admin = await userAdmin.findById(id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin user not found",
      });
    }

    if (!isChangingOwnPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: "Your password is required to change another admin password",
        });
      }

      const currentAdmin = await userAdmin.findById(req.user.id);
      if (!currentAdmin) {
        return res.status(404).json({
          success: false,
          message: "Current admin user not found",
        });
      }

      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        currentAdmin.password,
      );

      if (!isCurrentPasswordValid) {
        return res.status(401).json({
          success: false,
          message: "Your password is incorrect",
        });
      }
    }

    admin.password = await bcrypt.hash(password, 10);
    await admin.save();

    res.status(200).json({
      success: true,
      message: "Admin password changed successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to change admin password",
    });
  }
};
