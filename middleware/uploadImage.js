const multer = require("multer");
const path = require("path");

const allowedImageTypes = [
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
];

const allowedImageExtensions = [".jpg", ".jpeg", ".png", ".webp"];

const allowedDocumentTypes = [
  ...allowedImageTypes,
  "application/pdf",
  "application/x-pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const allowedDocumentExtensions = [...allowedImageExtensions, ".pdf", ".doc", ".docx"];
const maxUploadSizeMb = Number(process.env.SUPPLIER_UPLOAD_MAX_SIZE_MB || 2);

const isAllowedFile = (file) => {
  const extension = path.extname(file.originalname || "").toLowerCase();

  if (file.fieldname === "profileImage" || file.fieldname === "image") {
    return (
      allowedImageTypes.includes(file.mimetype) &&
      allowedImageExtensions.includes(extension)
    );
  }

  if (file.fieldname === "businessDocument") {
    return (
      allowedDocumentTypes.includes(file.mimetype) &&
      allowedDocumentExtensions.includes(extension)
    );
  }

  return false;
};

const uploadErrorMessage = (fieldName) => {
  if (fieldName === "businessDocument") {
    return "Business document must be a JPG, PNG, WEBP, PDF, DOC, or DOCX file";
  }

  return "Profile image must be a JPG, PNG, or WEBP file";
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxUploadSizeMb * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!isAllowedFile(file)) {
      return cb(new Error(uploadErrorMessage(file.fieldname)));
    }

    cb(null, true);
  },
});

const handleSingleImageUpload = (fieldName) => (req, res, next) => {
  upload.single(fieldName)(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: `File size must be ${maxUploadSizeMb}MB or less`,
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message || "Image upload failed",
    });
  });
};

const handleSupplierFilesUpload = (req, res, next) => {
  upload.fields([
    { name: "profileImage", maxCount: 1 },
    { name: "businessDocument", maxCount: 1 },
    { name: "image", maxCount: 1 },
  ])(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: `File size must be ${maxUploadSizeMb}MB or less`,
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message || "File upload failed",
    });
  });
};

module.exports = {
  handleSingleImageUpload,
  handleSupplierFilesUpload,
};
