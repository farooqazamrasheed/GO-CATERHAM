const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Driver = require("../models/Driver");
const { sendSuccess, sendError } = require("../utils/responseHelper");

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads/documents");
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

// File filter for document types
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "application/pdf",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only JPEG, PNG, and PDF files are allowed."
      ),
      false
    );
  }
};

// Configure multer upload
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Upload document fields
const uploadDocuments = upload.fields([
  { name: "drivingLicenseFront", maxCount: 1 },
  { name: "drivingLicenseBack", maxCount: 1 },
  { name: "cnicFront", maxCount: 1 },
  { name: "cnicBack", maxCount: 1 },
  { name: "vehicleRegistration", maxCount: 1 },
  { name: "insuranceCertificate", maxCount: 1 },
  { name: "vehiclePhotoFront", maxCount: 1 },
  { name: "vehiclePhotoSide", maxCount: 1 },
]);

// Upload driver documents
exports.uploadDriverDocuments = [
  uploadDocuments,
  async (req, res) => {
    try {
      const driverId = req.params.driverId;
      const userId = req.user.id;

      // Find driver profile
      const driver = await Driver.findOne({ user: userId });
      if (!driver) {
        return sendError(res, "Driver profile not found", 404);
      }

      // Check if driver owns this profile or is admin
      if (
        driver._id.toString() !== driverId &&
        req.user.role !== "admin" &&
        req.user.role !== "superadmin"
      ) {
        return sendError(
          res,
          "You can only upload documents for your own account",
          403
        );
      }

      const uploadedDocuments = [];
      const documentFields = [
        "drivingLicenseFront",
        "drivingLicenseBack",
        "cnicFront",
        "cnicBack",
        "vehicleRegistration",
        "insuranceCertificate",
        "vehiclePhotoFront",
        "vehiclePhotoSide",
      ];

      // Process uploaded files
      documentFields.forEach((field) => {
        if (req.files && req.files[field] && req.files[field][0]) {
          const file = req.files[field][0];
          const fileUrl = `/uploads/documents/${file.filename}`;

          // Update driver document info
          if (!driver.documents) {
            driver.documents = {};
          }

          driver.documents[field] = {
            url: fileUrl,
            uploadedAt: new Date(),
            verified: false,
          };

          uploadedDocuments.push({
            type: field,
            filename: file.originalname,
            url: fileUrl,
            uploadedAt: new Date(),
          });
        }
      });

      // No additional data handling needed for documents

      await driver.save();

      sendSuccess(
        res,
        {
          driverId: driver._id,
          uploadedDocuments,
          message:
            "Documents uploaded successfully. They will be reviewed by our admin team.",
        },
        "Documents uploaded successfully",
        200
      );
    } catch (error) {
      console.error("Document upload error:", error);

      // Handle multer errors
      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          return sendError(res, "File too large. Maximum size is 5MB.", 400);
        }
      }

      if (error.message.includes("Invalid file type")) {
        return sendError(res, error.message, 400);
      }

      sendError(res, "Failed to upload documents", 500);
    }
  },
];

// Get driver's documents status
exports.getDriverDocuments = async (req, res) => {
  try {
    const driverId = req.params.driverId;
    const userId = req.user.id;

    const driver = await Driver.findOne({ user: userId });
    if (!driver) {
      return sendError(res, "Driver profile not found", 404);
    }

    // Check permissions
    if (
      driver._id.toString() !== driverId &&
      req.user.role !== "admin" &&
      req.user.role !== "superadmin"
    ) {
      return sendError(res, "You can only view your own documents", 403);
    }

    const documents = driver.documents || {};
    const documentStatus = {
      drivingLicenseFront: {
        uploaded: !!documents.drivingLicenseFront,
        verified: documents.drivingLicenseFront?.verified || false,
        url: documents.drivingLicenseFront?.url,
        uploadedAt: documents.drivingLicenseFront?.uploadedAt,
      },
      drivingLicenseBack: {
        uploaded: !!documents.drivingLicenseBack,
        verified: documents.drivingLicenseBack?.verified || false,
        url: documents.drivingLicenseBack?.url,
        uploadedAt: documents.drivingLicenseBack?.uploadedAt,
      },
      cnicFront: {
        uploaded: !!documents.cnicFront,
        verified: documents.cnicFront?.verified || false,
        url: documents.cnicFront?.url,
        uploadedAt: documents.cnicFront?.uploadedAt,
      },
      cnicBack: {
        uploaded: !!documents.cnicBack,
        verified: documents.cnicBack?.verified || false,
        url: documents.cnicBack?.url,
        uploadedAt: documents.cnicBack?.uploadedAt,
      },
      vehicleRegistration: {
        uploaded: !!documents.vehicleRegistration,
        verified: documents.vehicleRegistration?.verified || false,
        url: documents.vehicleRegistration?.url,
        uploadedAt: documents.vehicleRegistration?.uploadedAt,
      },
      insuranceCertificate: {
        uploaded: !!documents.insuranceCertificate,
        verified: documents.insuranceCertificate?.verified || false,
        url: documents.insuranceCertificate?.url,
        uploadedAt: documents.insuranceCertificate?.uploadedAt,
      },
      vehiclePhotoFront: {
        uploaded: !!documents.vehiclePhotoFront,
        verified: documents.vehiclePhotoFront?.verified || false,
        url: documents.vehiclePhotoFront?.url,
        uploadedAt: documents.vehiclePhotoFront?.uploadedAt,
      },
      vehiclePhotoSide: {
        uploaded: !!documents.vehiclePhotoSide,
        verified: documents.vehiclePhotoSide?.verified || false,
        url: documents.vehiclePhotoSide?.url,
        uploadedAt: documents.vehiclePhotoSide?.uploadedAt,
      },
    };

    // Count uploaded documents
    const uploadedCount = Object.values(documentStatus).filter(
      (doc) => doc.uploaded
    ).length;

    sendSuccess(
      res,
      {
        driverId: driver._id,
        documents: documentStatus,
        uploadedDocumentsCount: uploadedCount,
        totalDocumentsRequired: 8,
        allDocumentsUploaded: Object.values(documentStatus).every(
          (doc) => doc.uploaded
        ),
        allDocumentsVerified: Object.values(documentStatus).every(
          (doc) => doc.verified
        ),
      },
      "Document status retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Get documents error:", error);
    sendError(res, "Failed to retrieve document status", 500);
  }
};

// Delete a specific document
exports.deleteDriverDocument = async (req, res) => {
  try {
    const { driverId, documentType } = req.params;
    const userId = req.user.id;

    const driver = await Driver.findOne({ user: userId });
    if (!driver) {
      return sendError(res, "Driver profile not found", 404);
    }

    // Check permissions
    if (
      driver._id.toString() !== driverId &&
      req.user.role !== "admin" &&
      req.user.role !== "superadmin"
    ) {
      return sendError(res, "You can only manage your own documents", 403);
    }

    const validDocumentTypes = [
      "drivingLicenseFront",
      "drivingLicenseBack",
      "cnicFront",
      "cnicBack",
      "vehicleRegistration",
      "insuranceCertificate",
      "vehiclePhotoFront",
      "vehiclePhotoSide",
    ];
    if (!validDocumentTypes.includes(documentType)) {
      return sendError(res, "Invalid document type", 400);
    }

    if (!driver.documents || !driver.documents[documentType]) {
      return sendError(res, "Document not found", 404);
    }

    // Delete file from filesystem
    const filePath = path.join(
      __dirname,
      "../uploads/documents",
      path.basename(driver.documents[documentType].url)
    );
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Remove from database
    driver.documents[documentType] = undefined;
    await driver.save();

    sendSuccess(res, null, `${documentType} deleted successfully`, 200);
  } catch (error) {
    console.error("Delete document error:", error);
    sendError(res, "Failed to delete document", 500);
  }
};
