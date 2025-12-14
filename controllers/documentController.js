const Driver = require("../models/Driver");
const { sendSuccess, sendError } = require("../utils/responseHelper");
const { documentUpload, documentFields } = require("../config/multerConfig");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Upload document fields
const uploadDocuments = documentUpload.fields(documentFields);

// Validation middleware for document upload
const validateDocumentUpload = async (req, res, next) => {
  try {
    const driverId = req.params.driverId;
    const userId = req.user.id;

    // Validate driverId format
    if (!driverId || !/^[0-9a-fA-F]{24}$/.test(driverId)) {
      return sendError(res, "Invalid driver ID format", 400);
    }

    // Find driver profile
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return sendError(res, "Driver not found", 404);
    }

    // Check if user is admin/superadmin or owns this driver profile
    const isOwner = driver.user.toString() === userId;
    const isAdmin = req.user.role === "admin" || req.user.role === "superadmin";

    if (!isOwner && !isAdmin) {
      return sendError(
        res,
        "You can only upload documents for your own account",
        403
      );
    }

    // Attach driver to req for later use
    req.driver = driver;
    req.isOwner = isOwner;
    req.isAdmin = isAdmin;

    next();
  } catch (error) {
    console.error("Document upload validation error:", error);
    return sendError(res, "Server error during validation", 500);
  }
};

// Upload driver documents
exports.uploadDriverDocuments = [
  validateDocumentUpload,
  uploadDocuments,
  async (req, res) => {
    try {
      const driver = req.driver;

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

          // Delete old file if exists
          if (
            driver.documents &&
            driver.documents[field] &&
            driver.documents[field].url
          ) {
            const oldFilePath = path.join(
              __dirname,
              "../uploads/documents",
              path.basename(driver.documents[field].url)
            );
            if (fs.existsSync(oldFilePath)) {
              try {
                fs.unlinkSync(oldFilePath);
                console.log(`Deleted old document: ${oldFilePath}`);
              } catch (error) {
                console.error(
                  `Failed to delete old document ${oldFilePath}:`,
                  error
                );
              }
            }
          }

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

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return sendError(res, "Driver not found", 404);
    }

    // Check permissions
    const isOwner = driver.user.toString() === userId;
    const isAdmin = req.user.role === "admin" || req.user.role === "superadmin";

    if (!isOwner && !isAdmin) {
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

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return sendError(res, "Driver not found", 404);
    }

    // Check permissions
    const isOwner = driver.user.toString() === userId;
    const isAdmin = req.user.role === "admin" || req.user.role === "superadmin";

    if (!isOwner && !isAdmin) {
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
