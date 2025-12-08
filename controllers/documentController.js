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
  { name: "drivingLicense", maxCount: 1 },
  { name: "vehicleInsurance", maxCount: 1 },
  { name: "vehicleRegistration", maxCount: 1 },
  { name: "motCertificate", maxCount: 1 },
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
        "drivingLicense",
        "vehicleInsurance",
        "vehicleRegistration",
        "motCertificate",
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

      // Handle additional data (like expiry dates for insurance/MOT)
      if (req.body.vehicleInsuranceExpiry) {
        if (driver.documents.vehicleInsurance) {
          driver.documents.vehicleInsurance.expiryDate = new Date(
            req.body.vehicleInsuranceExpiry
          );
        }
      }

      if (req.body.motCertificateExpiry) {
        if (driver.documents.motCertificate) {
          driver.documents.motCertificate.expiryDate = new Date(
            req.body.motCertificateExpiry
          );
        }
      }

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
      drivingLicense: {
        uploaded: !!documents.drivingLicense,
        verified: documents.drivingLicense?.verified || false,
        url: documents.drivingLicense?.url,
        uploadedAt: documents.drivingLicense?.uploadedAt,
      },
      vehicleInsurance: {
        uploaded: !!documents.vehicleInsurance,
        verified: documents.vehicleInsurance?.verified || false,
        url: documents.vehicleInsurance?.url,
        uploadedAt: documents.vehicleInsurance?.uploadedAt,
        expiryDate: documents.vehicleInsurance?.expiryDate,
      },
      vehicleRegistration: {
        uploaded: !!documents.vehicleRegistration,
        verified: documents.vehicleRegistration?.verified || false,
        url: documents.vehicleRegistration?.url,
        uploadedAt: documents.vehicleRegistration?.uploadedAt,
      },
      motCertificate: {
        uploaded: !!documents.motCertificate,
        verified: documents.motCertificate?.verified || false,
        url: documents.motCertificate?.url,
        uploadedAt: documents.motCertificate?.uploadedAt,
        expiryDate: documents.motCertificate?.expiryDate,
      },
    };

    sendSuccess(
      res,
      {
        driverId: driver._id,
        documents: documentStatus,
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
      "drivingLicense",
      "vehicleInsurance",
      "vehicleRegistration",
      "motCertificate",
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
