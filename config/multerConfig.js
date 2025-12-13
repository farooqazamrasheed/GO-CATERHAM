const multer = require("multer");
const path = require("path");
const fs = require("fs");

/**
 * Creates a multer storage configuration
 * @param {string} uploadDir - The upload directory relative to the project root
 * @param {function} filenameGenerator - Optional custom filename generator function
 * @returns {multer.StorageEngine} Multer storage engine
 */
const createStorage = (uploadDir, filenameGenerator = null) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const fullUploadDir = path.join(__dirname, "../uploads", uploadDir);
      // Create directory if it doesn't exist
      if (!fs.existsSync(fullUploadDir)) {
        fs.mkdirSync(fullUploadDir, { recursive: true });
      }
      cb(null, fullUploadDir);
    },
    filename:
      filenameGenerator ||
      ((req, file, cb) => {
        // Generate unique filename with timestamp
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(
          null,
          file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
        );
      }),
  });
};

/**
 * Creates a file filter function
 * @param {string[]} allowedTypes - Array of allowed MIME types
 * @param {string} errorMessage - Error message for invalid file types
 * @returns {function} Multer file filter function
 */
const createFileFilter = (allowedTypes, errorMessage) => {
  return (req, file, cb) => {
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(errorMessage), false);
    }
  };
};

/**
 * Creates a multer upload configuration
 * @param {Object} options - Configuration options
 * @param {string} options.uploadDir - Upload directory
 * @param {string[]} options.allowedTypes - Allowed MIME types
 * @param {string} options.errorMessage - Error message for invalid types
 * @param {number} options.fileSize - Max file size in bytes (default: 5MB)
 * @param {function} options.filenameGenerator - Custom filename generator
 * @returns {multer.Multer} Configured multer instance
 */
const createUploadConfig = (options) => {
  const {
    uploadDir,
    allowedTypes,
    errorMessage,
    fileSize = 5 * 1024 * 1024, // 5MB default
    filenameGenerator,
  } = options;

  const storage = createStorage(uploadDir, filenameGenerator);
  const fileFilter = createFileFilter(allowedTypes, errorMessage);

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize,
    },
  });
};

// Pre-configured upload configurations

// Document uploads (multiple fields for driver documents)
const documentUpload = createUploadConfig({
  uploadDir: "documents",
  allowedTypes: ["image/jpeg", "image/jpg", "image/png", "application/pdf"],
  errorMessage: "Invalid file type. Only JPEG, PNG, and PDF files are allowed.",
});

// Profile picture uploads (single field)
const profilePictureUpload = createUploadConfig({
  uploadDir: "profiles",
  allowedTypes: ["image/jpeg", "image/jpg", "image/png"],
  errorMessage: "Only JPEG and PNG files are allowed",
  filenameGenerator: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      "profile-" +
        req.user.id +
        "-" +
        uniqueSuffix +
        path.extname(file.originalname)
    );
  },
});

// Driver photo uploads (single field)
const driverPhotoUpload = createUploadConfig({
  uploadDir: "drivers",
  allowedTypes: ["image/jpeg", "image/jpg", "image/png"],
  errorMessage: "Invalid file type. Only JPEG, JPG, and PNG are allowed",
  filenameGenerator: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      "driver-" +
        req.user.id +
        "-" +
        uniqueSuffix +
        path.extname(file.originalname)
    );
  },
});

// Document fields configuration for driver documents
const documentFields = [
  { name: "drivingLicenseFront", maxCount: 1 },
  { name: "drivingLicenseBack", maxCount: 1 },
  { name: "cnicFront", maxCount: 1 },
  { name: "cnicBack", maxCount: 1 },
  { name: "vehicleRegistration", maxCount: 1 },
  { name: "insuranceCertificate", maxCount: 1 },
  { name: "vehiclePhotoFront", maxCount: 1 },
  { name: "vehiclePhotoSide", maxCount: 1 },
];

module.exports = {
  createStorage,
  createFileFilter,
  createUploadConfig,
  documentUpload,
  profilePictureUpload,
  driverPhotoUpload,
  documentFields,
};
