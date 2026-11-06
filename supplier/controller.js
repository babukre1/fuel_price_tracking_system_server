const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Supplier = require("./model");
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
const Station = require("../station/model");
const { deleteFileFromR2, uploadImageToR2 } = require("../config/r2");
const { sendPushToSupplier } = require("../utils/sendPushNotification");

// Generate JWT token
const generateToken = (id, tokenVersion = 0) => {
  return jwt.sign(
    { id, role: "supplier", tokenVersion },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    },
  );
};

const formatSupplier = (supplier) => ({
  id: supplier._id,
  fullName: supplier.fullName,
  companyName: supplier.companyName,
  email: supplier.email,
  phone: supplier.phone,
  businessLicenseNumber: supplier.businessLicenseNumber,
  address: supplier.address,
  city: supplier.city,
  logo: supplier.logo,
  image: supplier.profileImage || supplier.image,
  profileImage: supplier.profileImage || supplier.image,
  businessDocument: supplier.businessDocument,
  description: supplier.description,
  status: supplier.status,
  isVerified: supplier.isVerified,
  isActive: supplier.isActive,
  createdAt: supplier.createdAt,
  updatedAt: supplier.updatedAt,
});

const uploadSupplierFile = async (file, folder) => {
  try {
    return await uploadImageToR2(file, folder);
  } catch (error) {
    error.statusCode = 502;
    error.message = `Supplier file upload failed: ${error.message}`;
    throw error;
  }
};

const getUploadedFile = (req, fieldName) => {
  if (req.files?.[fieldName]?.[0]) {
    return req.files[fieldName][0];
  }

  if (fieldName === "profileImage" && req.files?.image?.[0]) {
    return req.files.image[0];
  }

  if (fieldName === "profileImage" && req.file) {
    return req.file;
  }

  return null;
};

const cleanupDeletedFiles = async (files) => {
  await Promise.all(
    files
      .filter((file) => file?.key || file?.url)
      .map((file) => deleteFileFromR2(file).catch((error) => {
        console.error("R2 delete failed:", error.message);
      })),
  );
};

const applySupplierFiles = async (supplier, req) => {
  const filesToDelete = [];
  const profileFile = getUploadedFile(req, "profileImage");
  const documentFile = getUploadedFile(req, "businessDocument");

  if (profileFile) {
    const previousProfile = {
      key: supplier.profileImageKey,
      url: supplier.profileImage || supplier.image,
    };
    const uploaded = await uploadSupplierFile(profileFile, "suppliers/profile-images");
    supplier.profileImage = uploaded.url;
    supplier.profileImageKey = uploaded.key;
    supplier.image = uploaded.url;
    filesToDelete.push(previousProfile);
  } else if (req.body.profileImage !== undefined || req.body.image !== undefined) {
    const nextProfile = req.body.profileImage !== undefined ? req.body.profileImage : req.body.image;
    if (!nextProfile && (supplier.profileImage || supplier.image)) {
      filesToDelete.push({
        key: supplier.profileImageKey,
        url: supplier.profileImage || supplier.image,
      });
      supplier.profileImageKey = undefined;
    }
    supplier.profileImage = nextProfile || undefined;
    supplier.image = nextProfile || undefined;
  }

  if (documentFile) {
    const previousDocument = {
      key: supplier.businessDocumentKey,
      url: supplier.businessDocument,
    };
    const uploaded = await uploadSupplierFile(documentFile, "suppliers/business-documents");
    supplier.businessDocument = uploaded.url;
    supplier.businessDocumentKey = uploaded.key;
    filesToDelete.push(previousDocument);
  } else if (req.body.businessDocument !== undefined) {
    if (!req.body.businessDocument && supplier.businessDocument) {
      filesToDelete.push({
        key: supplier.businessDocumentKey,
        url: supplier.businessDocument,
      });
      supplier.businessDocumentKey = undefined;
    }
    supplier.businessDocument = req.body.businessDocument || undefined;
  }

  return filesToDelete;
};

const parseBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
};

const isAdmin = (req) => req.user.role === "admin";

// SIGNUP
exports.signup = async (req, res) => {
  try {
    const {
      fullName,
      companyName,
      email,
      phone,
      password,
      businessLicenseNumber,
      address,
      city,
      country,
      image,
      profileImage,
      businessDocument,
      description,
    } = req.body;

    if (!fullName || !companyName || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Full name, company name, email, phone, and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const emailExists = await Supplier.findOne({ email });

    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    const phoneExists = await Supplier.findOne({ phone });

    if (phoneExists) {
      return res.status(400).json({
        success: false,
        message: "Phone number already exists",
      });
    }

    const uploadedProfileImage = await uploadSupplierFile(
      getUploadedFile(req, "profileImage"),
      "suppliers/profile-images",
    );
    const uploadedBusinessDocument = await uploadSupplierFile(
      getUploadedFile(req, "businessDocument"),
      "suppliers/business-documents",
    );
    const hashedPassword = await bcrypt.hash(password, 10);
    const profileImageUrl = uploadedProfileImage?.url || profileImage || image;

    const verification = {};
    const code = prepareCode(verification);
    const newSupplier = await Supplier.create({
      fullName,
      companyName,
      email,
      phone,
      password: hashedPassword,
      emailVerified: false,
      ...verification,
      businessLicenseNumber,
      address,
      city,
      country,
      image: profileImageUrl,
      profileImage: profileImageUrl,
      profileImageKey: uploadedProfileImage?.key,
      businessDocument: uploadedBusinessDocument?.url || businessDocument,
      businessDocumentKey: uploadedBusinessDocument?.key,
      description,
    });
    let emailSent = true;
    try {
      await sendCode(newSupplier.email, code);
    } catch (error) {
      emailSent = false;
      console.error("Supplier verification email failed:", error);
    }

    res.status(201).json({
      success: true,
      message: emailSent
        ? "Check your email for a verification code"
        : "Account created, but email could not be sent. Please request a new code.",
      emailSent,
      data: {
        id: newSupplier._id,
        fullName: newSupplier.fullName,
        companyName: newSupplier.companyName,
        email: newSupplier.email,
        phone: newSupplier.phone,
        image: newSupplier.profileImage || newSupplier.image,
        profileImage: newSupplier.profileImage || newSupplier.image,
        businessDocument: newSupplier.businessDocument,
        status: newSupplier.status,
        isVerified: newSupplier.isVerified,
        isActive: newSupplier.isActive,
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

exports.verifyEmail = async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ email: req.body.email }).select(
      "+emailVerificationCodeHash +emailVerificationExpiresAt +emailVerificationSentAt +emailVerificationAttempts",
    );
    if (!supplier || supplier.emailVerified !== false) {
      return res.status(400).json({ success: false, message: "Invalid verification request" });
    }
    const valid = verifyCode(supplier, req.body.code);
    await supplier.save();
    if (!valid) {
      return res.status(400).json({ success: false, message: "Invalid or expired code" });
    }
    return res.json({ success: true, message: "Email verified. Your account is pending administrator approval." });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Email verification failed" });
  }
};

exports.resendVerification = async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ email: req.body.email }).select(
      "+emailVerificationCodeHash +emailVerificationExpiresAt +emailVerificationSentAt +emailVerificationAttempts",
    );
    if (!supplier || supplier.emailVerified !== false) {
      return res.json({ success: true, message: "If the account needs verification, a code will be sent." });
    }
    if (!mayResend(supplier)) {
      return res.status(429).json({ success: false, message: "Please wait a minute before requesting another code" });
    }
    const code = prepareCode(supplier);
    await supplier.save();
    await sendCode(supplier.email, code);
    return res.json({ success: true, message: "Verification code sent" });
  } catch (error) {
    console.error("Supplier verification resend failed:", error);
    return res.status(502).json({ success: false, message: "Could not send verification email. Try again later." });
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

    const supplier = await Supplier.findOne({ email }).select("+tokenVersion");

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isPasswordMatch = await bcrypt.compare(password, supplier.password);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (supplier.emailVerified === false) {
      return res.status(403).json({
        success: false,
        message: "Verify your email before signing in",
        code: "EMAIL_NOT_VERIFIED",
      });
    }

    if (!supplier.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive",
      });
    }

    if (supplier.status !== "APPROVED") {
      return res.status(403).json({
        success: false,
        message: "Your account is not approved yet",
      });
    }

    const token = generateToken(supplier._id, supplier.tokenVersion ?? 0);

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      data: {
        id: supplier._id,
        fullName: supplier.fullName,
        companyName: supplier.companyName,
        email: supplier.email,
        phone: supplier.phone,
        image: supplier.profileImage || supplier.image,
        profileImage: supplier.profileImage || supplier.image,
        businessDocument: supplier.businessDocument,
        status: supplier.status,
        isVerified: supplier.isVerified,
        isActive: supplier.isActive,
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

exports.forgotPassword = async (req, res) => {
  const message = "If an account exists for that email, a reset code has been sent.";
  try {
    const supplier = await Supplier.findOne({ email: req.body.email }).select(
      "+passwordResetCodeHash +passwordResetExpiresAt +passwordResetSentAt +passwordResetAttempts",
    );
    if (!supplier || !supplier.isActive || !maySendPasswordReset(supplier)) {
      return res.json({ success: true, message });
    }
    const code = preparePasswordResetCode(supplier);
    await supplier.save();
    await sendPasswordResetCode(supplier.email, code);
    return res.json({ success: true, message });
  } catch (error) {
    console.error("Supplier password reset email failed:", error);
    return res.json({ success: true, message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ email: req.body.email }).select(
      "+passwordResetCodeHash +passwordResetExpiresAt +passwordResetSentAt +passwordResetAttempts +tokenVersion",
    );
    if (!supplier || !verifyPasswordResetCode(supplier, req.body.code)) {
      if (supplier) await supplier.save();
      return res.status(400).json({ success: false, message: "Invalid or expired reset code" });
    }
    supplier.password = await bcrypt.hash(req.body.newPassword, 10);
    supplier.tokenVersion = (supplier.tokenVersion ?? 0) + 1;
    await supplier.save();
    return res.json({ success: true, message: "Password reset successfully. Please sign in." });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Password reset failed" });
  }
};

// ADMIN: CREATE SUPPLIER
exports.createSupplier = async (req, res) => {
  try {
    const {
      fullName,
      companyName,
      email,
      phone,
      password,
      businessLicenseNumber,
      address,
      city,
      country,
      image,
      profileImage,
      businessDocument,
      description,
      status,
      isVerified,
      isActive,
    } = req.body;

    if (!fullName || !companyName || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Full name, company name, email, phone, and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const emailExists = await Supplier.findOne({ email });

    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    const phoneExists = await Supplier.findOne({ phone });

    if (phoneExists) {
      return res.status(400).json({
        success: false,
        message: "Phone number already exists",
      });
    }

    const uploadedProfileImage = await uploadSupplierFile(
      getUploadedFile(req, "profileImage"),
      "suppliers/profile-images",
    );
    const uploadedBusinessDocument = await uploadSupplierFile(
      getUploadedFile(req, "businessDocument"),
      "suppliers/business-documents",
    );
    const hashedPassword = await bcrypt.hash(password, 10);
    const profileImageUrl = uploadedProfileImage?.url || profileImage || image;

    const supplier = await Supplier.create({
      fullName,
      companyName,
      email,
      phone,
      password: hashedPassword,
      businessLicenseNumber,
      address,
      city,
      country,
      image: profileImageUrl,
      profileImage: profileImageUrl,
      profileImageKey: uploadedProfileImage?.key,
      businessDocument: uploadedBusinessDocument?.url || businessDocument,
      businessDocumentKey: uploadedBusinessDocument?.key,
      description,
      status: status || "APPROVED",
      isVerified: isVerified !== undefined ? isVerified : true,
      isActive: isActive !== undefined ? parseBoolean(isActive) : true,
    });

    res.status(201).json({
      success: true,
      message: "Supplier created successfully",
      data: formatSupplier(supplier),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create supplier",
      error: error.message,
    });
  }
};

// SUPPLIER: UPDATE OWN PROFILE
exports.updateMyProfile = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.user.id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    const {
      fullName,
      companyName,
      email,
      phone,
      businessLicenseNumber,
      address,
      city,
      logo,
      image,
      profileImage,
      businessDocument,
      currentPassword,
      description,
    } = req.body;

    if (email && email !== supplier.email) {
      const emailExists = await Supplier.findOne({
        email,
        _id: { $ne: supplier._id },
      });

      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Email already exists",
        });
      }
    }

    if (phone && phone !== supplier.phone) {
      const phoneExists = await Supplier.findOne({
        phone,
        _id: { $ne: supplier._id },
      });

      if (phoneExists) {
        return res.status(400).json({
          success: false,
          message: "Phone number already exists",
        });
      }
    }

    const businessDocumentFile = getUploadedFile(req, "businessDocument");
    const isBusinessDocumentChange =
      Boolean(businessDocumentFile) ||
      (
        businessDocument !== undefined &&
        businessDocument !== supplier.businessDocument
      );

    if (isBusinessDocumentChange) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password is required to change business document",
        });
      }

      const isPasswordMatch = await bcrypt.compare(currentPassword, supplier.password);
      if (!isPasswordMatch) {
        return res.status(401).json({
          success: false,
          message: "Current password is incorrect",
        });
      }
    }

    const filesToDelete = await applySupplierFiles(supplier, req);

    if (fullName !== undefined) supplier.fullName = fullName;
    if (companyName !== undefined) supplier.companyName = companyName;
    if (email !== undefined) supplier.email = email;
    if (phone !== undefined) supplier.phone = phone;
    if (businessLicenseNumber !== undefined) {
      supplier.businessLicenseNumber = businessLicenseNumber;
    }
    if (address !== undefined) supplier.address = address;
    if (city !== undefined) supplier.city = city;
    if (logo !== undefined) supplier.logo = logo;
    if (description !== undefined) supplier.description = description;

    await supplier.save();
    await cleanupDeletedFiles(filesToDelete);

    res.status(200).json({
      success: true,
      message: "Supplier profile updated successfully",
      data: formatSupplier(supplier),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update supplier profile",
      error: error.message,
    });
  }
};

// SUPPLIER: GET OWN PROFILE
exports.getMyProfile = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.user.id).select("-password");

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Profile loaded successfully",
      data: formatSupplier(supplier),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load profile",
      error: error.message,
    });
  }
};

// SUPPLIER: CHANGE OWN PASSWORD
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "currentPassword and newPassword are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const supplier = await Supplier.findById(req.user.id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, supplier.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    supplier.password = await bcrypt.hash(newPassword, 10);
    await supplier.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to change password",
      error: error.message,
    });
  }
};

// ADMIN: GET ALL SUPPLIERS
exports.getSuppliers = async (req, res) => {
  try {
    const suppliers = await Supplier.find().select("-password").sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      message: "Suppliers loaded successfully",
      data: suppliers.map(formatSupplier),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load suppliers",
      error: error.message,
    });
  }
};

// ADMIN: GET ONE SUPPLIER
exports.getSupplierById = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id).select("-password");

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Supplier loaded successfully",
      data: formatSupplier(supplier),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load supplier",
      error: error.message,
    });
  }
};

// ADMIN: UPDATE SUPPLIER
exports.updateSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    const {
      fullName,
      companyName,
      email,
      phone,
      password,
      businessLicenseNumber,
      address,
      city,
      logo,
      image,
      profileImage,
      businessDocument,
      description,
      status,
      isVerified,
      isActive,
    } = req.body;

    if (email && email !== supplier.email) {
      const emailExists = await Supplier.findOne({
        email,
        _id: { $ne: supplier._id },
      });

      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Email already exists",
        });
      }
    }

    if (phone && phone !== supplier.phone) {
      const phoneExists = await Supplier.findOne({
        phone,
        _id: { $ne: supplier._id },
      });

      if (phoneExists) {
        return res.status(400).json({
          success: false,
          message: "Phone number already exists",
        });
      }
    }

    if (password !== undefined) {
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 6 characters",
        });
      }

      supplier.password = await bcrypt.hash(password, 10);
    }

    const filesToDelete = await applySupplierFiles(supplier, req);

    if (fullName !== undefined) supplier.fullName = fullName;
    if (companyName !== undefined) supplier.companyName = companyName;
    if (email !== undefined) supplier.email = email;
    if (phone !== undefined) supplier.phone = phone;
    if (businessLicenseNumber !== undefined) {
      supplier.businessLicenseNumber = businessLicenseNumber;
    }
    if (address !== undefined) supplier.address = address;
    if (city !== undefined) supplier.city = city;
    if (logo !== undefined) supplier.logo = logo;
    if (description !== undefined) supplier.description = description;
    const previousStatus   = supplier.status;
    const previousIsActive = supplier.isActive;
    if (status !== undefined) supplier.status = status;
    if (isVerified !== undefined) supplier.isVerified = parseBoolean(isVerified);
    if (isActive !== undefined) supplier.isActive = parseBoolean(isActive);

    await supplier.save();
    await cleanupDeletedFiles(filesToDelete);

    if (status === "APPROVED" && previousStatus !== "APPROVED") {
      sendPushToSupplier(supplier._id, {
        title: "Account Approved",
        body: "Your supplier account has been approved. You can now sign in.",
      }).catch(() => {});
    }

    if (status === "REJECTED" && previousStatus !== "REJECTED") {
      sendPushToSupplier(supplier._id, {
        title: "Account Update",
        body: "Your supplier account was not approved. Contact your administrator for details.",
      }).catch(() => {});
    }

    if (status === "SUSPENDED" && previousStatus !== "SUSPENDED") {
      sendPushToSupplier(supplier._id, {
        title: "Account Suspended",
        body: "Your supplier account has been suspended. Contact your administrator.",
      }).catch(() => {});
    }

    if (isAdmin(req) && isActive !== undefined) {
      const newIsActive = parseBoolean(isActive);
      if (newIsActive === false && previousIsActive === true) {
        sendPushToSupplier(supplier._id, {
          title: "Account Deactivated",
          body: "Your supplier account has been deactivated. Contact your administrator.",
        }).catch(() => {});
      } else if (newIsActive === true && previousIsActive === false) {
        sendPushToSupplier(supplier._id, {
          title: "Account Reactivated",
          body: "Your supplier account is active again. You can sign in.",
        }).catch(() => {});
      }
    }

    res.status(200).json({
      success: true,
      message: "Supplier updated successfully",
      data: formatSupplier(supplier),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: "Failed to update supplier",
      error: error.message,
    });
  }
};

// SUPPLIER: REGISTER DEVICE TOKEN
exports.registerDeviceToken = async (req, res) => {
  try {
    const { token } = req.body;
    await Supplier.updateOne(
      { _id: req.user.id },
      { $addToSet: { deviceTokens: token } },
    );
    res.status(200).json({ success: true, message: "Device token registered" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to register device token",
      error: error.message,
    });
  }
};

// SUPPLIER: REMOVE DEVICE TOKEN
exports.removeDeviceToken = async (req, res) => {
  try {
    const { token } = req.body;
    await Supplier.updateOne(
      { _id: req.user.id },
      { $pull: { deviceTokens: token } },
    );
    res.status(200).json({ success: true, message: "Device token removed" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to remove device token",
      error: error.message,
    });
  }
};

// ADMIN: SOFT DELETE SUPPLIER
exports.deleteSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    supplier.isActive = false;
    supplier.status = "SUSPENDED";
    await supplier.save();

    await Station.updateMany(
      { supplier: supplier._id },
      {
        isActive: false,
        status: "SUSPENDED",
      },
    );

    res.status(200).json({
      success: true,
      message: "Supplier deactivated successfully",
      data: formatSupplier(supplier),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to deactivate supplier",
      error: error.message,
    });
  }
};
