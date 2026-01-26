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
    console.log("\n🔍 [Document Upload Validation]");
    console.log("   Driver ID:", req.params.driverId);
    console.log("   User ID:", req.user?.id);
    console.log("   User Role:", req.user?.role);
    
    const driverId = req.params.driverId;
    const userId = req.user.id;

    // Validate driverId format
    if (!driverId || !/^[0-9a-fA-F]{24}$/.test(driverId)) {
      console.log("   ❌ Invalid driver ID format");
      return sendError(res, "Invalid driver ID format", 400);
    }

    // Find driver profile
    const driver = await Driver.findById(driverId);
    if (!driver) {
      console.log("   ❌ Driver not found");
      return sendError(res, "Driver not found", 404);
    }

    // Check if user is admin/superadmin or owns this driver profile
    const isOwner = driver.user.toString() === userId;
    const isAdmin = req.user.role === "admin" || req.user.role === "superadmin";

    console.log("   Is Owner:", isOwner);
    console.log("   Is Admin:", isAdmin);

    if (!isOwner && !isAdmin) {
      console.log("   ❌ Permission denied");
      return sendError(
        res,
        "You can only upload documents for your own account",
        403
      );
    }

    console.log("   ✅ Validation passed");
    
    // Attach driver to req for later use
    req.driver = driver;
    req.isOwner = isOwner;
    req.isAdmin = isAdmin;

    next();
  } catch (error) {
    console.error("❌ Document upload validation error:", error);
    return sendError(res, "Server error during validation", 500);
  }
};

// Upload driver documents
exports.uploadDriverDocuments = [
  validateDocumentUpload,
  uploadDocuments,
  async (req, res) => {
    try {
      console.log("\n📤 [Document Upload Processing]");
      console.log("   Files received:", Object.keys(req.files || {}).length);
      console.log("   File fields:", Object.keys(req.files || {}).join(", "));
      
      // Validate that files were uploaded
      if (!req.files || Object.keys(req.files).length === 0) {
        console.log("   ❌ No files received in request");
        return sendError(res, "No files uploaded. Please select documents to upload.", 400);
      }
      
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
          
          console.log(`   Processing ${field}:`, {
            originalName: file.originalname,
            filename: file.filename,
            size: file.size,
            mimetype: file.mimetype
          });

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
            status: 'pending_verification', // Set status when document is uploaded
          };

          uploadedDocuments.push({
            type: field,
            filename: file.originalname,
            url: fileUrl,
            uploadedAt: new Date(),
          });
        }
      });

      // Fix legacy status issue - change 'pending' to 'offline' if present
      if (driver.status === "pending") {
        driver.status = "offline";
      }

      // Check if any documents were actually uploaded
      if (uploadedDocuments.length === 0) {
        console.log("   ⚠️ No valid documents found in request");
        return sendError(res, "No valid documents were uploaded. Please check file types and sizes.", 400);
      }

      await driver.save();

      console.log("   ✅ Documents saved successfully");
      console.log("   Uploaded count:", uploadedDocuments.length);
      console.log("   Document types:", uploadedDocuments.map(d => d.type).join(", "));

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
      console.error("❌ Document upload error:", error);
      console.error("   Error stack:", error.stack);
      console.error("   Error name:", error.name);
      console.error("   Error message:", error.message);

      // Handle multer errors
      if (error instanceof multer.MulterError) {
        console.error("   Multer error code:", error.code);
        if (error.code === "LIMIT_FILE_SIZE") {
          return sendError(res, "File too large. Maximum size is 5MB per file.", 400);
        }
        if (error.code === "LIMIT_UNEXPECTED_FILE") {
          return sendError(res, "Invalid file field. Please check document field names.", 400);
        }
        if (error.code === "LIMIT_FILE_COUNT") {
          return sendError(res, "Too many files. Maximum 8 documents allowed.", 400);
        }
        return sendError(res, `Upload error: ${error.message}`, 400);
      }

      if (error.message.includes("Invalid file type")) {
        return sendError(res, error.message, 400);
      }

      sendError(res, "Failed to upload documents. Please try again.", 500);
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
        uploaded: !!documents.drivingLicenseFront?.url,
        verified: documents.drivingLicenseFront?.verified || false,
        url: documents.drivingLicenseFront?.url,
        uploadedAt: documents.drivingLicenseFront?.uploadedAt,
        status: documents.drivingLicenseFront?.status || 'not_uploaded',
        rejected: documents.drivingLicenseFront?.rejected || false,
        rejectionReason: documents.drivingLicenseFront?.rejectionReason,
        rejectionCount: documents.drivingLicenseFront?.rejectionCount || 0,
        currentVersion: documents.drivingLicenseFront?.currentVersion || 1,
      },
      drivingLicenseBack: {
        uploaded: !!documents.drivingLicenseBack?.url,
        verified: documents.drivingLicenseBack?.verified || false,
        url: documents.drivingLicenseBack?.url,
        uploadedAt: documents.drivingLicenseBack?.uploadedAt,
        status: documents.drivingLicenseBack?.status || 'not_uploaded',
        rejected: documents.drivingLicenseBack?.rejected || false,
        rejectionReason: documents.drivingLicenseBack?.rejectionReason,
        rejectionCount: documents.drivingLicenseBack?.rejectionCount || 0,
        currentVersion: documents.drivingLicenseBack?.currentVersion || 1,
      },
      cnicFront: {
        uploaded: !!documents.cnicFront?.url,
        verified: documents.cnicFront?.verified || false,
        url: documents.cnicFront?.url,
        uploadedAt: documents.cnicFront?.uploadedAt,
        status: documents.cnicFront?.status || 'not_uploaded',
        rejected: documents.cnicFront?.rejected || false,
        rejectionReason: documents.cnicFront?.rejectionReason,
        rejectionCount: documents.cnicFront?.rejectionCount || 0,
        currentVersion: documents.cnicFront?.currentVersion || 1,
      },
      cnicBack: {
        uploaded: !!documents.cnicBack?.url,
        verified: documents.cnicBack?.verified || false,
        url: documents.cnicBack?.url,
        uploadedAt: documents.cnicBack?.uploadedAt,
        status: documents.cnicBack?.status || 'not_uploaded',
        rejected: documents.cnicBack?.rejected || false,
        rejectionReason: documents.cnicBack?.rejectionReason,
        rejectionCount: documents.cnicBack?.rejectionCount || 0,
        currentVersion: documents.cnicBack?.currentVersion || 1,
      },
      vehicleRegistration: {
        uploaded: !!documents.vehicleRegistration?.url,
        verified: documents.vehicleRegistration?.verified || false,
        url: documents.vehicleRegistration?.url,
        uploadedAt: documents.vehicleRegistration?.uploadedAt,
        status: documents.vehicleRegistration?.status || 'not_uploaded',
        rejected: documents.vehicleRegistration?.rejected || false,
        rejectionReason: documents.vehicleRegistration?.rejectionReason,
        rejectionCount: documents.vehicleRegistration?.rejectionCount || 0,
        currentVersion: documents.vehicleRegistration?.currentVersion || 1,
      },
      insuranceCertificate: {
        uploaded: !!documents.insuranceCertificate?.url,
        verified: documents.insuranceCertificate?.verified || false,
        url: documents.insuranceCertificate?.url,
        uploadedAt: documents.insuranceCertificate?.uploadedAt,
        status: documents.insuranceCertificate?.status || 'not_uploaded',
        rejected: documents.insuranceCertificate?.rejected || false,
        rejectionReason: documents.insuranceCertificate?.rejectionReason,
        rejectionCount: documents.insuranceCertificate?.rejectionCount || 0,
        currentVersion: documents.insuranceCertificate?.currentVersion || 1,
      },
      vehiclePhotoFront: {
        uploaded: !!documents.vehiclePhotoFront?.url,
        verified: documents.vehiclePhotoFront?.verified || false,
        url: documents.vehiclePhotoFront?.url,
        uploadedAt: documents.vehiclePhotoFront?.uploadedAt,
        status: documents.vehiclePhotoFront?.status || 'not_uploaded',
        rejected: documents.vehiclePhotoFront?.rejected || false,
        rejectionReason: documents.vehiclePhotoFront?.rejectionReason,
        rejectionCount: documents.vehiclePhotoFront?.rejectionCount || 0,
        currentVersion: documents.vehiclePhotoFront?.currentVersion || 1,
      },
      vehiclePhotoSide: {
        uploaded: !!documents.vehiclePhotoSide?.url,
        verified: documents.vehiclePhotoSide?.verified || false,
        url: documents.vehiclePhotoSide?.url,
        uploadedAt: documents.vehiclePhotoSide?.uploadedAt,
        status: documents.vehiclePhotoSide?.status || 'not_uploaded',
        rejected: documents.vehiclePhotoSide?.rejected || false,
        rejectionReason: documents.vehiclePhotoSide?.rejectionReason,
        rejectionCount: documents.vehiclePhotoSide?.rejectionCount || 0,
        currentVersion: documents.vehiclePhotoSide?.currentVersion || 1,
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
