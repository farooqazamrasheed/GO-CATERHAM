const Driver = require("../models/Driver");
const User = require("../models/User");
const Admin = require("../models/Admin");
const Role = require("../models/Role");
const Permission = require("../models/Permission");
const Rider = require("../models/Rider");
const Ride = require("../models/Ride");
const Payment = require("../models/Payment");
const ActiveStatusHistory = require("../models/ActiveStatusHistory");
const PaymentMethod = require("../models/PaymentMethod");
const SavedLocation = require("../models/SavedLocation");
const RewardTransaction = require("../models/RewardTransaction");
const Wallet = require("../models/Wallet");
const { sendSuccess, sendError } = require("../utils/responseHelper");
const { auditLoggers } = require("../middlewares/audit");
const { driverPhotoUpload } = require("../config/multerConfig");
const bcrypt = require("bcryptjs");
const notificationService = require("../services/notificationService");
const socketService = require("../services/socketService");

// Document Status Transition Validation Helper
const validateStatusTransition = (currentStatus, action, document) => {
  // Define valid transitions
  const validTransitions = {
    verify: ['not_uploaded', 'uploaded', 'pending_verification', 'rejected'],
    reject: ['uploaded', 'pending_verification'],
    mark_missing: ['not_uploaded'],
    reupload: ['rejected', 'not_uploaded']
  };

  // Check if document exists for certain actions
  if ((action === 'verify' || action === 'reject') && !document.url) {
    return {
      valid: false,
      message: `Cannot ${action} a document that hasn't been uploaded`
    };
  }

  // Check if document is already verified
  if (action === 'verify' && currentStatus === 'verified') {
    return {
      valid: false,
      message: 'Document is already verified. No need to verify again.'
    };
  }

  // Cannot reject verified documents
  if (action === 'reject' && currentStatus === 'verified') {
    return {
      valid: false,
      message: 'Cannot reject a verified document. Please unverify it first or contact support.'
    };
  }

  // Cannot mark uploaded document as missing
  if (action === 'mark_missing' && document.url) {
    return {
      valid: false,
      message: 'Cannot mark an uploaded document as missing. The document exists in the system.'
    };
  }

  // Check if current status allows this action
  if (validTransitions[action] && !validTransitions[action].includes(currentStatus)) {
    const statusMap = {
      not_uploaded: 'not uploaded',
      uploaded: 'uploaded',
      pending_verification: 'pending verification',
      verified: 'verified',
      rejected: 'rejected'
    };
    return {
      valid: false,
      message: `Cannot ${action} a document with status "${statusMap[currentStatus] || currentStatus}"`
    };
  }

  return { valid: true };
};

// Approve or reject driver
exports.approveDriver = async (req, res, next) => {
  try {
    // Try to find by driver ID first, then by user ID
    let driver = await Driver.findById(req.params.driverId);

    if (!driver) {
      // If not found by driver ID, try to find by user ID
      driver = await Driver.findOne({ user: req.params.driverId });
    }

    if (!driver) {
      return sendError(res, "Driver not found", 404);
    }

    // Check if driver has uploaded and verified all required documents before approval
    const requiredDocuments = [
      "drivingLicenseFront",
      "drivingLicenseBack",
      "cnicFront",
      "cnicBack",
      "vehicleRegistration",
      "insuranceCertificate",
      "vehiclePhotoFront",
      "vehiclePhotoSide",
    ];

    const uploadedDocuments = requiredDocuments.filter(
      (doc) =>
        driver.documents && driver.documents[doc] && driver.documents[doc].url
    );

    if (uploadedDocuments.length < requiredDocuments.length) {
      return sendError(
        res,
        `Driver must upload all required documents before approval. Uploaded: ${uploadedDocuments.length}/${requiredDocuments.length}`,
        400
      );
    }

    const verifiedDocuments = requiredDocuments.filter(
      (doc) =>
        driver.documents &&
        driver.documents[doc] &&
        driver.documents[doc].verified
    );

    if (verifiedDocuments.length < requiredDocuments.length) {
      return sendError(
        res,
        `All documents must be verified by admin before approval. Verified: ${verifiedDocuments.length}/${requiredDocuments.length}`,
        400
      );
    }

    driver.isApproved = "approved";
    driver.verificationStatus = "verified";
    driver.status = "online"; // Set to online when approved

    // Clear rejection data on approval
    driver.rejectionMessage = undefined;
    driver.lastRejectedAt = undefined;
    driver.rejectedBy = undefined;

    await driver.save();

    // Set user isVerified to true for admin verification
    const user = await User.findByIdAndUpdate(driver.user, {
      isVerified: true,
    });

    // Send approval notification
    try {
      await notificationService.sendDriverApprovedNotification(user);
    } catch (notificationError) {
      console.error(
        "Driver approval notification failed:",
        notificationError.message
      );
      // Continue without failing the approval
    }

    // Real-time WebSocket notifications for driver approval
    
    // 1. Notify driver about approval
    socketService.notifyUser(driver.user.toString(), "driver_approved", {
      driverId: driver._id,
      status: "approved",
      message: "Congratulations! Your driver account has been approved. You can now go online and start accepting rides.",
      canGoOnline: true,
      timestamp: new Date()
    });

    // 2. Update driver dashboard
    socketService.notifyDriverDashboardUpdate(driver._id.toString(), {
      verificationStatus: "verified",
      isApproved: "approved",
      canGoOnline: true,
      message: "Your account has been approved!"
    }, "approval_status");

    // 3. Notify all admins about driver approval
    socketService.notifyUser("admin", "admin_driver_approved", {
      driverId: driver._id,
      driverName: user.fullName,
      approvedBy: req.user.fullName || req.user.id,
      timestamp: new Date(),
      message: `Driver ${user.fullName} has been approved`
    });

    sendSuccess(res, { driver }, "Driver approved", 200);
  } catch (err) {
    next(err);
  }
};

exports.rejectDriver = async (req, res, next) => {
  try {
    // Try to find by driver ID first, then by user ID
    let driver = await Driver.findById(req.params.driverId);

    if (!driver) {
      // If not found by driver ID, try to find by user ID
      driver = await Driver.findOne({ user: req.params.driverId });
    }

    if (!driver) {
      return sendError(res, "Driver not found", 404);
    }

    const requiredDocuments = [
      "drivingLicenseFront",
      "drivingLicenseBack",
      "cnicFront",
      "cnicBack",
      "vehicleRegistration",
      "insuranceCertificate",
      "vehiclePhotoFront",
      "vehiclePhotoSide",
    ];

    // Check verification status of documents
    const allDocumentsUploaded = requiredDocuments.every(
      (doc) =>
        driver.documents && driver.documents[doc] && driver.documents[doc].url
    );

    const allDocumentsVerified = requiredDocuments.every(
      (doc) =>
        driver.documents &&
        driver.documents[doc] &&
        driver.documents[doc].verified
    );

    let rejectionMessage = "Your application was rejected by admin.";

    if (!allDocumentsUploaded) {
      rejectionMessage =
        "Your application was rejected because not all required documents were uploaded. Please upload all required documents and reapply.";
    } else if (!allDocumentsVerified) {
      // Find unverified documents
      const unverifiedDocs = requiredDocuments.filter(
        (doc) => !driver.documents[doc].verified
      );
      rejectionMessage = `Your application was rejected because the following documents are not verified: ${unverifiedDocs.join(
        ", "
      )}. Please upload verified copies of these documents and reapply.`;
    }

    // Update rejection details
    driver.isApproved = "rejected";
    driver.status = "offline"; // Set to offline for rejected drivers
    driver.verificationStatus = "unverified"; // Reset verification
    driver.rejectionCount += 1;
    driver.rejectionMessage = rejectionMessage;
    driver.lastRejectedAt = new Date();
    driver.rejectedBy = req.user.id;

    await driver.save();

    // Get user for notifications
    const user = await User.findById(driver.user);

    // Real-time WebSocket notifications for driver rejection
    
    // 1. Notify driver about rejection
    socketService.notifyUser(driver.user.toString(), "driver_rejected", {
      driverId: driver._id,
      status: "rejected",
      rejectionMessage: rejectionMessage,
      canReapply: true,
      timestamp: new Date(),
      message: rejectionMessage
    });

    // 2. Update driver dashboard with rejection status
    socketService.notifyDriverDashboardUpdate(driver._id.toString(), {
      verificationStatus: "unverified",
      isApproved: "rejected",
      canGoOnline: false,
      rejectionMessage: rejectionMessage,
      message: "Your application has been rejected. Please check the rejection reason and reapply."
    }, "approval_status");

    // 3. Notify all admins about driver rejection
    socketService.notifyUser("admin", "admin_driver_rejected", {
      driverId: driver._id,
      driverName: user?.fullName || "Unknown",
      rejectedBy: req.user.fullName || req.user.id,
      rejectionMessage: rejectionMessage,
      rejectionCount: driver.rejectionCount,
      timestamp: new Date(),
      message: `Driver ${user?.fullName || "Unknown"} has been rejected`
    });

    sendSuccess(
      res,
      {
        driver,
        message:
          "Driver rejected successfully. Driver can reapply with updated documents.",
      },
      "Driver rejected",
      200
    );
  } catch (err) {
    next(err);
  }
};

// Reject driver without document verification check (custom rejection)
exports.rejectDriverCustom = async (req, res, next) => {
  try {
    const { rejectionMessage } = req.body;

    if (!rejectionMessage) {
      return sendError(res, "Rejection message is required", 400);
    }

    // Try to find by driver ID first, then by user ID
    let driver = await Driver.findById(req.params.driverId);

    if (!driver) {
      // If not found by driver ID, try to find by user ID
      driver = await Driver.findOne({ user: req.params.driverId });
    }

    if (!driver) {
      return sendError(res, "Driver not found", 404);
    }

    // Update rejection details
    driver.isApproved = "rejected";
    driver.status = "offline"; // Set to offline for rejected drivers
    driver.verificationStatus = "unverified"; // Reset verification
    driver.rejectionCount += 1;
    driver.rejectionMessage = rejectionMessage;
    driver.lastRejectedAt = new Date();
    driver.rejectedBy = req.user.id;

    await driver.save();

    // Get user for notifications
    const user = await User.findById(driver.user);

    // Real-time WebSocket notifications for custom rejection
    
    // 1. Notify driver about rejection
    socketService.notifyUser(driver.user.toString(), "driver_rejected", {
      driverId: driver._id,
      status: "rejected",
      rejectionMessage: rejectionMessage,
      canReapply: true,
      timestamp: new Date(),
      message: rejectionMessage
    });

    // 2. Update driver dashboard
    socketService.notifyDriverDashboardUpdate(driver._id.toString(), {
      verificationStatus: "unverified",
      isApproved: "rejected",
      canGoOnline: false,
      rejectionMessage: rejectionMessage
    }, "approval_status");

    // 3. Notify all admins
    socketService.notifyUser("admin", "admin_driver_rejected", {
      driverId: driver._id,
      driverName: user?.fullName || "Unknown",
      rejectedBy: req.user.fullName || req.user.id,
      rejectionMessage: rejectionMessage,
      rejectionCount: driver.rejectionCount,
      timestamp: new Date()
    });

    sendSuccess(
      res,
      {
        driver,
        message: "Driver rejected successfully with custom message.",
      },
      "Driver rejected",
      200
    );
  } catch (err) {
    next(err);
  }
};

// Send message to driver (for document status notification)
exports.sendMessageToDriver = async (req, res, next) => {
  try {
    const { driverId } = req.params;
    const { message } = req.body;

    if (!message || message.trim() === "") {
      return sendError(res, "Message is required", 400);
    }

    // Find driver
    let driver = await Driver.findById(driverId);
    if (!driver) {
      driver = await Driver.findOne({ user: driverId });
    }

    if (!driver) {
      return sendError(res, "Driver not found", 404);
    }

    // Get user for notifications
    const user = await User.findById(driver.user);
    if (!user) {
      return sendError(res, "Driver user not found", 404);
    }

    // Get document verification status
    const requiredDocuments = [
      "drivingLicenseFront",
      "drivingLicenseBack",
      "cnicFront",
      "cnicBack",
      "vehicleRegistration",
      "insuranceCertificate",
      "vehiclePhotoFront",
      "vehiclePhotoSide",
    ];

    const verifiedDocs = requiredDocuments.filter(
      (doc) => driver.documents && driver.documents[doc] && driver.documents[doc].verified
    );
    const unverifiedDocs = requiredDocuments.filter(
      (doc) => driver.documents && driver.documents[doc] && driver.documents[doc].url && !driver.documents[doc].verified
    );

    // Send email notification
    try {
      await notificationService.sendAdminMessageToDriver(user, message);
    } catch (notificationError) {
      console.error("Failed to send email notification:", notificationError.message);
    }

    // Send WebSocket real-time notification
    socketService.notifyUser(driver.user.toString(), "admin_message", {
      driverId: driver._id,
      message: message,
      documentStatus: {
        verified: verifiedDocs.length,
        unverified: unverifiedDocs.length,
        total: requiredDocuments.length,
        verifiedDocuments: verifiedDocs,
        unverifiedDocuments: unverifiedDocs,
      },
      sentBy: req.user.fullName || req.user.id,
      timestamp: new Date(),
    });

    // Update driver dashboard
    socketService.notifyDriverDashboardUpdate(driver._id.toString(), {
      adminMessage: message,
      documentStatus: {
        verified: verifiedDocs.length,
        unverified: unverifiedDocs.length,
        total: requiredDocuments.length,
      },
    }, "admin_message");

    sendSuccess(
      res,
      {
        driverId: driver._id,
        driverName: user.fullName,
        message: message,
        documentStatus: {
          verified: verifiedDocs.length,
          unverified: unverifiedDocs.length,
          total: requiredDocuments.length,
          verifiedDocuments: verifiedDocs,
          unverifiedDocuments: unverifiedDocs,
        },
        sentAt: new Date(),
      },
      "Message sent to driver successfully",
      200
    );
  } catch (err) {
    next(err);
  }
};

// Verify individual document
exports.verifyDocument = async (req, res, next) => {
  try {
    const { driverId, documentType } = req.params;

    // Validate document type
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

    // Try to find by driver ID first, then by user ID
    let driver = await Driver.findById(driverId);

    if (!driver) {
      // If not found by driver ID, try to find by user ID
      driver = await Driver.findOne({ user: driverId });
    }

    if (!driver) {
      return sendError(res, "Driver not found", 404);
    }

    // Check if document exists
    if (
      !driver.documents ||
      !driver.documents[documentType] ||
      !driver.documents[documentType].url
    ) {
      return sendError(res, "Document not uploaded", 400);
    }

    const document = driver.documents[documentType];
    const currentStatus = document.status || 'uploaded';

    // Validate status transition
    const transitionValidation = validateStatusTransition(currentStatus, 'verify', document);
    if (!transitionValidation.valid) {
      return sendError(res, transitionValidation.message, 400);
    }

    // Update document verification and status
    driver.documents[documentType].verified = true;
    driver.documents[documentType].verifiedAt = new Date();
    driver.documents[documentType].verifiedBy = req.user.id;
    driver.documents[documentType].status = 'verified';
    driver.documents[documentType].rejected = false;
    driver.documents[documentType].rejectionReason = undefined;

    await driver.save();

    // Check how many documents are now verified
    const requiredDocuments = [
      "drivingLicenseFront",
      "drivingLicenseBack",
      "cnicFront",
      "cnicBack",
      "vehicleRegistration",
      "insuranceCertificate",
      "vehiclePhotoFront",
      "vehiclePhotoSide",
    ];
    const verifiedCount = requiredDocuments.filter(
      (doc) => driver.documents && driver.documents[doc] && driver.documents[doc].verified
    ).length;
    const allVerified = verifiedCount === requiredDocuments.length;

    // Real-time WebSocket notifications for document verification
    
    // 1. Notify driver about document verification
    socketService.notifyUser(driver.user.toString(), "document_verified", {
      driverId: driver._id,
      documentType: documentType,
      verifiedCount: verifiedCount,
      totalRequired: requiredDocuments.length,
      allVerified: allVerified,
      message: allVerified 
        ? "All documents verified! Your account is ready for approval."
        : `Document "${documentType}" has been verified. ${verifiedCount}/${requiredDocuments.length} documents verified.`,
      timestamp: new Date()
    });

    // 2. Update driver dashboard with verification progress
    socketService.notifyDriverDashboardUpdate(driver._id.toString(), {
      documentVerification: {
        documentType: documentType,
        verified: true,
        verifiedCount: verifiedCount,
        totalRequired: requiredDocuments.length,
        allVerified: allVerified
      }
    }, "document_verified");

    // 3. Notify admins about document verification
    socketService.notifyUser("admin", "admin_document_verified", {
      driverId: driver._id,
      documentType: documentType,
      verifiedBy: req.user.fullName || req.user.id,
      verifiedCount: verifiedCount,
      totalRequired: requiredDocuments.length,
      allVerified: allVerified,
      timestamp: new Date()
    });

    sendSuccess(
      res,
      {
        driver,
        verifiedDocument: documentType,
      },
      "Document verified successfully",
      200
    );
  } catch (err) {
    next(err);
  }
};

// Reject individual document
exports.rejectDocument = async (req, res, next) => {
  try {
    const { driverId, documentType } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason || rejectionReason.trim() === "") {
      return sendError(res, "Rejection reason is required", 400);
    }

    // Validate document type
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

    // Try to find by driver ID first, then by user ID
    let driver = await Driver.findById(driverId);

    if (!driver) {
      driver = await Driver.findOne({ user: driverId });
    }

    if (!driver) {
      return sendError(res, "Driver not found", 404);
    }

    // Check if document exists
    if (
      !driver.documents ||
      !driver.documents[documentType] ||
      !driver.documents[documentType].url
    ) {
      return sendError(res, "Document not uploaded", 400);
    }

    const document = driver.documents[documentType];
    const currentStatus = document.status || 'uploaded';

    // Validate status transition
    const transitionValidation = validateStatusTransition(currentStatus, 'reject', document);
    if (!transitionValidation.valid) {
      return sendError(res, transitionValidation.message, 400);
    }

    // Save current document to previous versions if it exists
    if (document.url) {
      if (!document.previousVersions) {
        document.previousVersions = [];
      }
      document.previousVersions.push({
        url: document.url,
        uploadedAt: document.uploadedAt,
        rejectedAt: new Date(),
        rejectionReason: rejectionReason,
      });
    }

    // Update document rejection status
    document.rejected = true;
    document.rejectionReason = rejectionReason;
    document.rejectedAt = new Date();
    document.rejectedBy = req.user.id;
    document.rejectionCount = (document.rejectionCount || 0) + 1;
    document.status = 'rejected';
    document.verified = false;
    document.verifiedAt = undefined;
    document.verifiedBy = undefined;

    await driver.save();

    // Get user for notifications
    const user = await User.findById(driver.user);

    // Real-time WebSocket notifications for document rejection
    
    // 1. Notify driver about document rejection
    socketService.notifyUser(driver.user.toString(), "document_rejected", {
      driverId: driver._id,
      documentType: documentType,
      rejectionReason: rejectionReason,
      rejectionCount: document.rejectionCount,
      message: `Document "${documentType}" has been rejected. Reason: ${rejectionReason}. Please re-upload a valid document.`,
      timestamp: new Date()
    });

    // 2. Update driver dashboard with rejection status
    socketService.notifyDriverDashboardUpdate(driver._id.toString(), {
      documentRejection: {
        documentType: documentType,
        rejected: true,
        rejectionReason: rejectionReason,
        rejectionCount: document.rejectionCount
      }
    }, "document_rejected");

    // 3. Notify admins about document rejection
    socketService.notifyUser("admin", "admin_document_rejected", {
      driverId: driver._id,
      driverName: user?.fullName || "Unknown",
      documentType: documentType,
      rejectionReason: rejectionReason,
      rejectedBy: req.user.fullName || req.user.id,
      timestamp: new Date()
    });

    sendSuccess(
      res,
      {
        driver,
        rejectedDocument: documentType,
        rejectionReason: rejectionReason,
        rejectionCount: document.rejectionCount,
      },
      "Document rejected successfully",
      200
    );
  } catch (err) {
    next(err);
  }
};

// Mark document as missing
exports.markDocumentMissing = async (req, res, next) => {
  try {
    const { driverId, documentType } = req.params;

    // Validate document type
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

    // Try to find by driver ID first, then by user ID
    let driver = await Driver.findById(driverId);

    if (!driver) {
      driver = await Driver.findOne({ user: driverId });
    }

    if (!driver) {
      return sendError(res, "Driver not found", 404);
    }

    // Initialize document object if it doesn't exist
    if (!driver.documents) {
      driver.documents = {};
    }

    if (!driver.documents[documentType]) {
      driver.documents[documentType] = {};
    }

    const document = driver.documents[documentType];
    const currentStatus = document.status || 'not_uploaded';

    // Validate status transition
    const transitionValidation = validateStatusTransition(currentStatus, 'mark_missing', document);
    if (!transitionValidation.valid) {
      return sendError(res, transitionValidation.message, 400);
    }

    // Mark document as missing
    document.status = 'not_uploaded';
    document.markedMissingAt = new Date();
    document.remindersSent = (document.remindersSent || 0) + 1;

    await driver.save();

    // Get user for notifications
    const user = await User.findById(driver.user);

    // Real-time WebSocket notifications for missing document
    
    // 1. Notify driver about missing document
    socketService.notifyUser(driver.user.toString(), "document_missing", {
      driverId: driver._id,
      documentType: documentType,
      message: `Document "${documentType}" is required but not uploaded. Please upload this document to complete your registration.`,
      remindersSent: document.remindersSent,
      timestamp: new Date()
    });

    // 2. Update driver dashboard with missing document status
    socketService.notifyDriverDashboardUpdate(driver._id.toString(), {
      documentMissing: {
        documentType: documentType,
        status: 'not_uploaded',
        remindersSent: document.remindersSent
      }
    }, "document_missing");

    // 3. Notify admins about missing document reminder
    socketService.notifyUser("admin", "admin_document_missing_marked", {
      driverId: driver._id,
      driverName: user?.fullName || "Unknown",
      documentType: documentType,
      markedBy: req.user.fullName || req.user.id,
      remindersSent: document.remindersSent,
      timestamp: new Date()
    });

    sendSuccess(
      res,
      {
        driver,
        documentType: documentType,
        status: 'not_uploaded',
        remindersSent: document.remindersSent,
      },
      "Document marked as missing and driver notified",
      200
    );
  } catch (err) {
    next(err);
  }
};

// Create a new driver
exports.createDriver = async (req, res) => {
  try {
    const {
      username,
      fullName,
      email,
      phone,
      password,
      vehicle,
      licenseNumber,
      vehicleModel,
      vehicleYear,
      vehicleColor,
      vehicleType,
      numberPlateOfVehicle,
    } = req.body;
    const createdBy = req.user.id;

    console.log("Admin creating driver for:", { username, email, fullName });

    // Validate required fields
    if (!username || !fullName || !email || !password || !vehicle) {
      return sendError(
        res,
        "username, fullName, email, password, and vehicle are required",
        400
      );
    }

    // Validate phone format (11 digits for UK/Surrey)
    const phoneRegex = /^\d{11}$/;
    if (phone && !phoneRegex.test(phone)) {
      return sendError(res, "Phone must be exactly 11 digits", 400);
    }

    // Validate username
    const sanitizedUsername = username.replace(/\s+/g, "_").toLowerCase();
    if (sanitizedUsername.length < 3 || sanitizedUsername.length > 30) {
      return sendError(
        res,
        "Username must be between 3 and 30 characters",
        400
      );
    }
    if (!/^[a-zA-Z0-9_]+$/.test(sanitizedUsername)) {
      return sendError(
        res,
        "Username can only contain letters, numbers, and underscores",
        400
      );
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return sendError(res, "Email already registered", 409);
    }

    // Check if phone already exists
    if (phone) {
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        return sendError(res, "Phone already registered", 409);
      }
    }

    // Check if username already exists
    const existingUsername = await User.findOne({
      username: sanitizedUsername,
    });
    if (existingUsername) {
      return sendError(res, "Username already taken", 409);
    }

    // Validate vehicle year if provided
    if (
      vehicleYear &&
      (vehicleYear < 1900 || vehicleYear > new Date().getFullYear() + 1)
    ) {
      return sendError(res, "Invalid vehicle year", 400);
    }

    // Validate vehicle type if provided
    const validVehicleTypes = [
      "sedan",
      "suv",
      "electric",
      "hatchback",
      "coupe",
      "convertible",
      "wagon",
      "pickup",
      "van",
      "motorcycle",
    ];
    if (vehicleType && !validVehicleTypes.includes(vehicleType)) {
      return sendError(res, "Invalid vehicle type", 400);
    }

    // Check for duplicate license number and number plate BEFORE creating user
    if (licenseNumber || numberPlateOfVehicle) {
      const existingDriver = await Driver.findOne({
        $or: [
          licenseNumber ? { licenseNumber: licenseNumber.trim() } : null,
          numberPlateOfVehicle
            ? { numberPlateOfVehicle: numberPlateOfVehicle.trim() }
            : null,
        ].filter(Boolean),
      });

      if (existingDriver) {
        const field =
          existingDriver.licenseNumber === licenseNumber?.trim()
            ? "License number"
            : "Number plate";
        return sendError(res, `${field} already registered`, 409);
      }
    }

    console.log("Creating user for driver");

    // Create user
    const user = await User.create({
      username: sanitizedUsername,
      fullName,
      email: email.toLowerCase(),
      phone,
      password,
      role: "driver", // Always driver
      isVerified: false, // Like public signup - needs admin approval
    });

    console.log("User created:", user._id);

    // Create driver profile
    const driverData = {
      user: user._id,
      vehicle,
      isApproved: "pending", // Pending approval status
      status: "offline", // Offline until approved
      verificationStatus: "unverified", // Unverified until approved
      photo: null,
      activeStatus: "active",
    };

    // Add optional fields if provided
    if (licenseNumber) driverData.licenseNumber = licenseNumber.trim();
    if (vehicleModel) driverData.vehicleModel = vehicleModel;
    if (vehicleYear) driverData.vehicleYear = vehicleYear;
    if (vehicleColor) driverData.vehicleColor = vehicleColor;
    if (vehicleType) driverData.vehicleType = vehicleType;
    if (numberPlateOfVehicle)
      driverData.numberPlateOfVehicle = numberPlateOfVehicle.trim();

    console.log("Creating driver profile:", driverData);

    const driver = await Driver.create(driverData);

    console.log("Driver profile created:", driver._id);

    // Create initial activation history
    await ActiveStatusHistory.create({
      userId: user._id,
      userType: "driver",
      driverId: driver._id,
      action: "activate",
      performedBy: createdBy,
      timestamp: new Date(),
    });

    console.log("ActiveStatusHistory created for driver");

    // Send welcome notification
    try {
      await notificationService.sendWelcomeEmail(user, "driver");
    } catch (notificationError) {
      console.error("Welcome notification failed:", notificationError.message);
      // Continue without failing the creation
    }

    sendSuccess(
      res,
      {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          username: user.username,
        },
        driver,
      },
      "Driver created successfully",
      201
    );
  } catch (err) {
    console.error("Create driver error:", err);
    sendError(res, "Failed to create driver", 500);
  }
};

// Update admin status
exports.updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body; // online/offline
    if (!["online", "offline"].includes(status)) {
      return sendError(res, "Invalid status. Must be online or offline", 400);
    }

    const admin = await Admin.findOneAndUpdate(
      { user: req.user.id },
      { status },
      { new: true }
    );

    if (!admin) {
      return sendError(res, "Admin profile not found", 404);
    }

    sendSuccess(res, { admin }, "Admin status updated", 200);
  } catch (err) {
    next(err);
  }
};

// Create a new admin or subadmin
exports.createAdmin = async (req, res) => {
  try {
    const {
      username,
      fullName,
      email,
      phone,
      password,
      adminType,
      assignedPermissions,
      assignedRoles,
    } = req.body;
    const createdBy = req.user.id;

    // Validate required fields
    if (!username || !fullName || !email || !password || !adminType) {
      return sendError(
        res,
        "username, fullName, email, password, and adminType are required",
        400
      );
    }

    // Validate phone format (11 digits for UK/Surrey)
    const phoneRegex = /^\d{11}$/;
    if (phone && !phoneRegex.test(phone)) {
      return sendError(res, "Phone must be exactly 11 digits", 400);
    }

    // Validate adminType
    if (!["admin", "subadmin"].includes(adminType)) {
      return sendError(res, "adminType must be 'admin' or 'subadmin'", 400);
    }

    // Check if creator has permission
    const creatorAdmin = await Admin.findOne({ user: createdBy });
    if (!creatorAdmin) {
      return sendError(res, "Creator admin profile not found", 404);
    }

    // Only superadmin can create admin, admin can create subadmin
    if (creatorAdmin.adminType === "subadmin") {
      return sendError(res, "Subadmin cannot create other admins", 403);
    }

    if (creatorAdmin.adminType === "admin" && adminType === "admin") {
      return sendError(res, "Admin cannot create other admins", 403);
    }

    // Validate permissions and roles before creating user
    let processedPermissions = [];
    if (assignedPermissions && Array.isArray(assignedPermissions)) {
      // Support both simple array and detailed objects
      for (const perm of assignedPermissions) {
        if (typeof perm === "string") {
          // Simple permission ID
          const permissionExists = await Permission.findById(perm);
          if (!permissionExists) {
            return sendError(res, `Permission ${perm} does not exist`, 400);
          }
          processedPermissions.push({
            permissionId: perm,
            grantedBy: createdBy,
            grantedAt: new Date(),
          });
        } else if (typeof perm === "object" && perm.permissionId) {
          // Detailed permission object
          const permissionExists = await Permission.findById(perm.permissionId);
          if (!permissionExists) {
            return sendError(
              res,
              `Permission ${perm.permissionId} does not exist`,
              400
            );
          }
          processedPermissions.push({
            permissionId: perm.permissionId,
            expiresAt: perm.expiresAt ? new Date(perm.expiresAt) : null,
            grantedBy: createdBy,
            grantedAt: new Date(),
          });
        }
      }
    }

    let validatedRoles = [];
    if (assignedRoles && Array.isArray(assignedRoles)) {
      // Validate roles exist
      const validRoles = await Role.find({ _id: { $in: assignedRoles } });
      if (validRoles.length !== assignedRoles.length) {
        return sendError(res, "One or more roles are invalid", 400);
      }
      validatedRoles = assignedRoles;
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return sendError(res, "Email already registered", 409);
    }

    // Sanitize username: replace spaces with underscores and lowercase
    const sanitizedUsername = username.replace(/\s+/g, "_").toLowerCase();

    // Create user
    const user = await User.create({
      username: sanitizedUsername,
      fullName,
      email,
      phone,
      password,
      role: adminType, // admin or subadmin
      isVerified: true, // Admins created via RBAC are verified
    });

    // Create admin profile
    const adminData = {
      user: user._id,
      adminType,
    };

    // Assign validated permissions and roles
    if (processedPermissions.length > 0) {
      adminData.assignedPermissions = processedPermissions;
    }

    if (validatedRoles.length > 0) {
      adminData.assignedRoles = validatedRoles;
    }

    const admin = await Admin.create(adminData);

    sendSuccess(
      res,
      {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
        },
        admin,
      },
      `${adminType} created successfully`,
      201
    );
  } catch (err) {
    console.error("Create admin error:", err);
    sendError(res, "Failed to create admin", 500);
  }
};

// Get all subadmins (for admin) or all admins/subadmins (for superadmin)
exports.getAdmins = async (req, res) => {
  try {
    const userId = req.user.id;
    const userAdmin = await Admin.findOne({ user: userId });

    if (!userAdmin) {
      return sendError(res, "Admin profile not found", 404);
    }

    let query = {};

    if (userAdmin.adminType === "admin") {
      // Admin can only see subadmins they created
      query = { adminType: "subadmin" };
      // Note: In a real implementation, you'd track who created whom
    }
    // Superadmin can see all

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await Admin.countDocuments(query);
    const admins = await Admin.find(query)
      .populate("user", "fullName email username")
      .populate("assignedPermissions", "name description")
      .populate("assignedRoles", "name description")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        admins,
        pagination: {
          currentPage: page,
          totalPages,
          totalAdmins: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "Admins retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get admins error:", err);
    sendError(res, "Failed to retrieve admins", 500);
  }
};

// Get comprehensive admin details by ID
exports.getAdminDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await Admin.findById(id)
      .populate(
        "user",
        "fullName email phone username address dateOfBirth preferences isVerified createdAt updatedAt"
      )
      .populate("assignedPermissions.permissionId")
      .populate("assignedRoles");

    if (!admin) {
      return sendError(res, "Admin not found", 404);
    }

    // Comprehensive admin details
    const adminDetails = {
      adminId: admin._id,
      userId: admin.user,
      adminType: admin.adminType,
      onlineStatus: admin.status,
      activeStatus: admin.activeStatus,
      assignedPermissions: admin.assignedPermissions,
      assignedRoles: admin.assignedRoles,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
      // User data
      username: admin.user.username,
      fullName: admin.user.fullName,
      email: admin.user.email,
      phone: admin.user.phone,
      address: admin.user.address,
      dateOfBirth: admin.user.dateOfBirth,
      preferences: admin.user.preferences,
      isVerified: admin.user.isVerified,
      userCreatedAt: admin.user.createdAt,
      userUpdatedAt: admin.user.updatedAt,
    };

    sendSuccess(
      res,
      { admin: adminDetails },
      "Admin details retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get admin details error:", err);
    sendError(res, "Failed to retrieve admin details", 500);
  }
};

// Update admin permissions and roles
exports.updateAdminPermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      adminType,
      assignedPermissions, // Replace all permissions
      assignedRoles, // Replace all roles
      addPermissions, // Add to existing permissions
      addRoles, // Add to existing roles
    } = req.body;
    const userId = req.user.id;

    const targetAdmin = await Admin.findById(id);
    if (!targetAdmin) {
      return sendError(res, "Admin not found", 404);
    }

    const currentAdmin = await Admin.findOne({ user: userId });
    if (!currentAdmin) {
      return sendError(res, "Current admin profile not found", 404);
    }

    // Permission checks
    if (currentAdmin.adminType === "subadmin") {
      return sendError(res, "Subadmin cannot modify permissions", 403);
    }

    if (
      currentAdmin.adminType === "admin" &&
      targetAdmin.adminType === "admin"
    ) {
      return sendError(res, "Admin cannot modify other admin permissions", 403);
    }

    if (adminType && !["admin", "subadmin"].includes(adminType)) {
      return sendError(res, "adminType must be 'admin' or 'subadmin'", 400);
    }

    // Validate and process permissions to add
    let permissionsToAdd = [];
    if (addPermissions && Array.isArray(addPermissions)) {
      for (const perm of addPermissions) {
        if (typeof perm === "string") {
          const permissionExists = await Permission.findById(perm);
          if (!permissionExists) {
            return sendError(res, `Permission ${perm} does not exist`, 400);
          }
          // Check if permission already assigned
          const alreadyAssigned = targetAdmin.assignedPermissions.some(
            (p) => p.permissionId.toString() === perm
          );
          if (!alreadyAssigned) {
            permissionsToAdd.push({
              permissionId: perm,
              grantedBy: userId,
              grantedAt: new Date(),
            });
          }
        } else if (typeof perm === "object" && perm.permissionId) {
          const permissionExists = await Permission.findById(perm.permissionId);
          if (!permissionExists) {
            return sendError(
              res,
              `Permission ${perm.permissionId} does not exist`,
              400
            );
          }
          // Check if permission already assigned
          const alreadyAssigned = targetAdmin.assignedPermissions.some(
            (p) => p.permissionId.toString() === perm.permissionId
          );
          if (!alreadyAssigned) {
            permissionsToAdd.push({
              permissionId: perm.permissionId,
              expiresAt: perm.expiresAt ? new Date(perm.expiresAt) : null,
              grantedBy: userId,
              grantedAt: new Date(),
            });
          }
        }
      }
    }

    // Validate and process roles to add
    let rolesToAdd = [];
    if (addRoles && Array.isArray(addRoles)) {
      const validRoles = await Role.find({ _id: { $in: addRoles } });
      if (validRoles.length !== addRoles.length) {
        return sendError(res, "One or more roles to add are invalid", 400);
      }
      // Check if roles already assigned
      rolesToAdd = addRoles.filter(
        (roleId) =>
          !targetAdmin.assignedRoles.some(
            (existingRole) => existingRole.toString() === roleId
          )
      );
    }

    // Validate permissions to replace
    let processedPermissions = [];
    if (assignedPermissions && Array.isArray(assignedPermissions)) {
      for (const perm of assignedPermissions) {
        if (typeof perm === "string") {
          const permissionExists = await Permission.findById(perm);
          if (!permissionExists) {
            return sendError(res, `Permission ${perm} does not exist`, 400);
          }
          processedPermissions.push({
            permissionId: perm,
            grantedBy: userId,
            grantedAt: new Date(),
          });
        } else if (typeof perm === "object" && perm.permissionId) {
          const permissionExists = await Permission.findById(perm.permissionId);
          if (!permissionExists) {
            return sendError(
              res,
              `Permission ${perm.permissionId} does not exist`,
              400
            );
          }
          processedPermissions.push({
            permissionId: perm.permissionId,
            expiresAt: perm.expiresAt ? new Date(perm.expiresAt) : null,
            grantedBy: userId,
            grantedAt: new Date(),
          });
        }
      }
    }

    // Validate roles to replace
    let validatedRoles = [];
    if (assignedRoles && Array.isArray(assignedRoles)) {
      const validRoles = await Role.find({ _id: { $in: assignedRoles } });
      if (validRoles.length !== assignedRoles.length) {
        return sendError(res, "One or more roles are invalid", 400);
      }
      validatedRoles = assignedRoles;
    }

    // Update Admin adminType if provided
    if (adminType) {
      targetAdmin.adminType = adminType;
    }

    // Apply updates based on operation type
    let updateMessage = "Admin permissions updated successfully";

    if (assignedPermissions && processedPermissions.length > 0) {
      // Replace all permissions
      targetAdmin.assignedPermissions = processedPermissions;
      updateMessage = "Admin permissions replaced successfully";
    } else if (addPermissions && permissionsToAdd.length > 0) {
      // Add to existing permissions
      targetAdmin.assignedPermissions = [
        ...targetAdmin.assignedPermissions,
        ...permissionsToAdd,
      ];
      updateMessage = "Permissions added to admin successfully";
    }

    if (assignedRoles && validatedRoles.length > 0) {
      // Replace all roles
      targetAdmin.assignedRoles = validatedRoles;
      updateMessage = assignedPermissions
        ? "Admin permissions and roles replaced successfully"
        : "Admin roles replaced successfully";
    } else if (addRoles && rolesToAdd.length > 0) {
      // Add to existing roles
      targetAdmin.assignedRoles = [...targetAdmin.assignedRoles, ...rolesToAdd];
      updateMessage =
        assignedPermissions || addPermissions
          ? "Permissions and roles added to admin successfully"
          : "Roles added to admin successfully";
    }

    // Check if any updates were made
    if (
      (!assignedPermissions || processedPermissions.length === 0) &&
      (!addPermissions || permissionsToAdd.length === 0) &&
      (!assignedRoles || validatedRoles.length === 0) &&
      (!addRoles || rolesToAdd.length === 0) &&
      !adminType
    ) {
      return sendError(
        res,
        "No valid permissions, roles, or adminType provided for update",
        400
      );
    }

    await targetAdmin.save();
    await targetAdmin.populate("assignedPermissions", "name description");
    await targetAdmin.populate("assignedRoles", "name description");

    sendSuccess(res, { admin: targetAdmin }, updateMessage, 200);
  } catch (err) {
    console.error("Update admin permissions error:", err);
    sendError(res, "Failed to update admin permissions", 500);
  }
};

// Update admin profile
exports.updateAdminProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const { fullName, username, email, phone, password } = body;
    const userId = req.user.id;

    const targetAdmin = await Admin.findById(id);
    if (!targetAdmin) {
      return sendError(res, "Admin not found", 404);
    }

    const currentAdmin = await Admin.findOne({ user: userId });
    if (!currentAdmin) {
      return sendError(res, "Current admin profile not found", 404);
    }

    // Permission checks - allow subadmins to update profiles
    if (
      currentAdmin.adminType === "admin" &&
      targetAdmin.adminType === "admin" &&
      currentAdmin._id.toString() !== targetAdmin._id.toString()
    ) {
      return sendError(res, "Admin cannot modify other admin profiles", 403);
    }

    // Validate profile fields if provided
    if (username) {
      if (username.length < 3 || username.length > 30) {
        return sendError(
          res,
          "Username must be between 3 and 30 characters",
          400
        );
      }
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return sendError(
          res,
          "Username can only contain letters, numbers, and underscores",
          400
        );
      }
      // Check uniqueness
      const existingUsername = await User.findOne({
        username: username.toLowerCase(),
        _id: { $ne: targetAdmin.user },
      });
      if (existingUsername) {
        return sendError(res, "Username already taken", 409);
      }
    }

    if (email) {
      // Check uniqueness
      const existingEmail = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: targetAdmin.user },
      });
      if (existingEmail) {
        return sendError(res, "Email already registered", 409);
      }
    }

    if (phone) {
      const phoneRegex = /^\d{11}$/;
      if (!phoneRegex.test(phone)) {
        return sendError(res, "Phone must be exactly 11 digits", 400);
      }
      // Check uniqueness
      const existingPhone = await User.findOne({
        phone,
        _id: { $ne: targetAdmin.user },
      });
      if (existingPhone) {
        return sendError(res, "Phone already registered", 409);
      }
    }

    // Prepare User updates
    const userUpdates = {};
    if (fullName) userUpdates.fullName = fullName;
    if (username) userUpdates.username = username.toLowerCase();
    if (email) userUpdates.email = email.toLowerCase();
    if (phone) userUpdates.phone = phone;
    if (password) {
      const saltRounds = 10;
      userUpdates.password = await bcrypt.hash(password, saltRounds);
    }

    // Check if any updates were provided
    if (Object.keys(userUpdates).length === 0) {
      return sendError(res, "No valid profile updates provided", 400);
    }

    // Update User
    await User.findByIdAndUpdate(targetAdmin.user, userUpdates);

    // Get updated user data
    const updatedUser = await User.findById(
      targetAdmin.user,
      "fullName username email phone"
    );

    sendSuccess(
      res,
      { user: updatedUser },
      "Admin profile updated successfully",
      200
    );
  } catch (err) {
    console.error("Update admin profile error:", err);
    sendError(res, "Failed to update admin profile", 500);
  }
};

// Delete subadmin
exports.deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const targetAdmin = await Admin.findById(id);
    if (!targetAdmin) {
      return sendError(res, "Admin not found", 404);
    }

    const currentAdmin = await Admin.findOne({ user: userId });
    if (!currentAdmin) {
      return sendError(res, "Current admin profile not found", 404);
    }

    // Permission checks
    if (currentAdmin.adminType === "subadmin") {
      return sendError(res, "Subadmin cannot delete admins", 403);
    }

    if (
      currentAdmin.adminType === "admin" &&
      targetAdmin.adminType === "admin"
    ) {
      return sendError(res, "Admin cannot delete other admins", 403);
    }

    // Delete admin profile and user
    await Admin.findByIdAndDelete(id);
    await User.findByIdAndDelete(targetAdmin.user);

    sendSuccess(res, null, "Admin deleted successfully", 200);
  } catch (err) {
    console.error("Delete admin error:", err);
    sendError(res, "Failed to delete admin", 500);
  }
};

// Driver Management Functions

// Get verified drivers
exports.getVerifiedDrivers = async (req, res) => {
  try {
    const userId = req.user.id;
    const userAdmin = await Admin.findOne({ user: userId });

    if (!userAdmin) {
      return sendError(res, "Admin profile not found", 404);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { verificationStatus: "verified" };

    const total = await Driver.countDocuments(query);
    const drivers = await Driver.find(query)
      .populate("user", "fullName email phone username")
      .populate("rejectedBy", "fullName")
      .populate("documents.drivingLicenseFront.verifiedBy", "fullName")
      .populate("documents.drivingLicenseBack.verifiedBy", "fullName")
      .populate("documents.cnicFront.verifiedBy", "fullName")
      .populate("documents.cnicBack.verifiedBy", "fullName")
      .populate("documents.vehicleRegistration.verifiedBy", "fullName")
      .populate("documents.insuranceCertificate.verifiedBy", "fullName")
      .populate("documents.vehiclePhotoFront.verifiedBy", "fullName")
      .populate("documents.vehiclePhotoSide.verifiedBy", "fullName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        drivers,
        pagination: {
          currentPage: page,
          totalPages,
          totalDrivers: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "Verified drivers retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get verified drivers error:", err);
    sendError(res, "Failed to retrieve verified drivers", 500);
  }
};

// Get unverified drivers
exports.getUnverifiedDrivers = async (req, res) => {
  try {
    const userId = req.user.id;
    const userAdmin = await Admin.findOne({ user: userId });

    if (!userAdmin) {
      return sendError(res, "Admin profile not found", 404);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { verificationStatus: "unverified" };

    const total = await Driver.countDocuments(query);
    const drivers = await Driver.find(query)
      .populate("user", "fullName email phone username")
      .populate("rejectedBy", "fullName")
      .populate("documents.drivingLicenseFront.verifiedBy", "fullName")
      .populate("documents.drivingLicenseBack.verifiedBy", "fullName")
      .populate("documents.cnicFront.verifiedBy", "fullName")
      .populate("documents.cnicBack.verifiedBy", "fullName")
      .populate("documents.vehicleRegistration.verifiedBy", "fullName")
      .populate("documents.insuranceCertificate.verifiedBy", "fullName")
      .populate("documents.vehiclePhotoFront.verifiedBy", "fullName")
      .populate("documents.vehiclePhotoSide.verifiedBy", "fullName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        drivers,
        pagination: {
          currentPage: page,
          totalPages,
          totalDrivers: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "Unverified drivers retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get unverified drivers error:", err);
    sendError(res, "Failed to retrieve unverified drivers", 500);
  }
};

// Get all drivers with pagination and filtering
exports.getDrivers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter query
    let query = {};

    // Filter by approval status
    if (req.query.isApproved) {
      query.isApproved = req.query.isApproved; // Can be "pending", "approved", "rejected"
    }

    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Filter by vehicle type
    if (req.query.vehicleType) {
      query.vehicleType = req.query.vehicleType;
    }

    // Filter by verification status
    if (req.query.verificationStatus) {
      query.verificationStatus = req.query.verificationStatus;
    }

    // Search by name, email, or license number
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, "i");
      query.$or = [
        { licenseNumber: searchRegex },
        { numberPlateOfVehicle: searchRegex },
      ];
      // Also search in user fields
      const userIds = await User.find({
        $or: [
          { fullName: searchRegex },
          { email: searchRegex },
          { phone: searchRegex },
        ],
      }).select("_id");
      query.$or.push({ user: { $in: userIds.map((u) => u._id) } });
    }

    const total = await Driver.countDocuments(query);
    const drivers = await Driver.find(query)
      .populate("user", "fullName email phone username")
      .populate("rejectedBy", "fullName")
      .populate("documents.drivingLicenseFront.verifiedBy", "fullName")
      .populate("documents.drivingLicenseBack.verifiedBy", "fullName")
      .populate("documents.cnicFront.verifiedBy", "fullName")
      .populate("documents.cnicBack.verifiedBy", "fullName")
      .populate("documents.vehicleRegistration.verifiedBy", "fullName")
      .populate("documents.insuranceCertificate.verifiedBy", "fullName")
      .populate("documents.vehiclePhotoFront.verifiedBy", "fullName")
      .populate("documents.vehiclePhotoSide.verifiedBy", "fullName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    // Return response in format expected by frontend
    res.status(200).json({
      success: true,
      message: "Drivers retrieved successfully",
      data: drivers,
      drivers: drivers,  // Include both for backward compatibility
      count: drivers.length,
      total: total,
      pagination: {
        currentPage: page,
        totalPages,
        totalDrivers: total,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (err) {
    console.error("Get drivers error:", err);
    sendError(res, "Failed to retrieve drivers", 500);
  }
};

// Get comprehensive driver details by ID
exports.getDriverDetails = async (req, res) => {
  try {
    const { driverId } = req.params;

    const driver = await Driver.findById(driverId)
      .populate(
        "user",
        "fullName email phone username address dateOfBirth preferences isVerified createdAt updatedAt"
      )
      .populate("rejectedBy", "fullName")
      .populate("documents.drivingLicenseFront.verifiedBy", "fullName")
      .populate("documents.drivingLicenseBack.verifiedBy", "fullName")
      .populate("documents.cnicFront.verifiedBy", "fullName")
      .populate("documents.cnicBack.verifiedBy", "fullName")
      .populate("documents.vehicleRegistration.verifiedBy", "fullName")
      .populate("documents.insuranceCertificate.verifiedBy", "fullName")
      .populate("documents.vehiclePhotoFront.verifiedBy", "fullName")
      .populate("documents.vehiclePhotoSide.verifiedBy", "fullName");

    if (!driver) {
      return sendError(res, "Driver not found", 404);
    }

    // Calculate earnings
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todaysEarningsAgg = await Ride.aggregate([
      {
        $match: {
          driver: driver._id,
          status: "completed",
          updatedAt: { $gte: today, $lt: tomorrow },
        },
      },
      { $group: { _id: null, total: { $sum: "$fare" } } },
    ]);
    const todaysEarnings =
      todaysEarningsAgg.length > 0 ? todaysEarningsAgg[0].total : 0;

    // Weekly earnings (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weeklyEarningsAgg = await Ride.aggregate([
      {
        $match: {
          driver: driver._id,
          status: "completed",
          updatedAt: { $gte: weekAgo },
        },
      },
      { $group: { _id: null, total: { $sum: "$fare" } } },
    ]);
    const weeklyEarnings =
      weeklyEarningsAgg.length > 0 ? weeklyEarningsAgg[0].total : 0;

    // Monthly earnings (last 30 days)
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const monthlyEarningsAgg = await Ride.aggregate([
      {
        $match: {
          driver: driver._id,
          status: "completed",
          updatedAt: { $gte: monthAgo },
        },
      },
      { $group: { _id: null, total: { $sum: "$fare" } } },
    ]);
    const monthlyEarnings =
      monthlyEarningsAgg.length > 0 ? monthlyEarningsAgg[0].total : 0;

    // Total earnings
    const totalEarningsAgg = await Ride.aggregate([
      {
        $match: {
          driver: driver._id,
          status: "completed",
        },
      },
      { $group: { _id: null, total: { $sum: "$fare" } } },
    ]);
    const totalEarnings =
      totalEarningsAgg.length > 0 ? totalEarningsAgg[0].total : 0;

    // Ride stats
    const totalRides = await Ride.countDocuments({ driver: driver._id });
    const completedRides = await Ride.countDocuments({
      driver: driver._id,
      status: "completed",
    });
    const cancelledRides = await Ride.countDocuments({
      driver: driver._id,
      status: "cancelled",
    });

    // Comprehensive driver details
    const driverDetails = {
      driverId: driver._id,
      userId: driver.user,
      licenseNumber: driver.licenseNumber,
      vehicle: driver.vehicle,
      vehicleModel: driver.vehicleModel,
      vehicleYear: driver.vehicleYear,
      vehicleColor: driver.vehicleColor,
      vehicleType: driver.vehicleType,
      numberPlateOfVehicle: driver.numberPlateOfVehicle,
      photo: driver.photo,
      documents: driver.documents,
      onlineStatus: driver.status,
      verificationStatus: driver.verificationStatus,
      isApproved: driver.isApproved,
      rejectionCount: driver.rejectionCount,
      rejectionMessage: driver.rejectionMessage,
      lastRejectedAt: driver.lastRejectedAt,
      rejectedBy: driver.rejectedBy,
      rating: driver.rating,
      activeStatus: driver.activeStatus,
      createdAt: driver.createdAt,
      updatedAt: driver.updatedAt,
      // Earnings report
      todaysEarnings,
      weeklyEarnings,
      monthlyEarnings,
      totalEarnings,
      // Dashboard
      totalRides,
      completedRides,
      cancelledRides,
      // User data
      username: driver.user.username,
      fullName: driver.user.fullName,
      email: driver.user.email,
      phone: driver.user.phone,
      address: driver.user.address,
      dateOfBirth: driver.user.dateOfBirth,
      preferences: driver.user.preferences,
      isVerified: driver.user.isVerified,
      userCreatedAt: driver.user.createdAt,
      userUpdatedAt: driver.user.updatedAt,
    };

    sendSuccess(
      res,
      { driver: driverDetails },
      "Driver details retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get driver details error:", err);
    sendError(res, "Failed to retrieve driver details", 500);
  }
};

// Update driver profile
exports.updateDriverProfile = async (req, res) => {
  try {
    const { driverId } = req.params;
    const {
      username,
      fullName,
      email,
      phone,
      password,
      licenseNumber,
      vehicle,
      vehicleModel,
      vehicleYear,
      vehicleColor,
      vehicleType,
      numberPlateOfVehicle,
      rating,
      isApproved,
      status,
    } = req.body;
    const userId = req.user.id;

    const targetDriver = await Driver.findById(driverId);
    if (!targetDriver) {
      return sendError(res, "Driver not found", 404);
    }

    const currentAdmin = await Admin.findOne({ user: userId });
    if (!currentAdmin) {
      return sendError(res, "Current admin profile not found", 404);
    }

    // Permission checks - subadmin can update drivers, admin can update drivers, superadmin can update all
    if (currentAdmin.adminType === "subadmin") {
      // Subadmin can only update basic driver info, not approval status
      if (isApproved !== undefined) {
        return sendError(res, "Subadmin cannot change approval status", 403);
      }
    }

    // Validate User profile fields if provided
    if (username) {
      if (username.length < 3 || username.length > 30) {
        return sendError(
          res,
          "Username must be between 3 and 30 characters",
          400
        );
      }
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return sendError(
          res,
          "Username can only contain letters, numbers, and underscores",
          400
        );
      }
      // Check uniqueness
      const existingUsername = await User.findOne({
        username: username.toLowerCase(),
        _id: { $ne: targetDriver.user },
      });
      if (existingUsername) {
        return sendError(res, "Username already taken", 409);
      }
    }

    if (email) {
      // Check uniqueness
      const existingEmail = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: targetDriver.user },
      });
      if (existingEmail) {
        return sendError(res, "Email already registered", 409);
      }
    }

    if (phone) {
      const phoneRegex = /^\d{11}$/;
      if (!phoneRegex.test(phone)) {
        return sendError(res, "Phone must be exactly 11 digits", 400);
      }
      // Check uniqueness
      const existingPhone = await User.findOne({
        phone,
        _id: { $ne: targetDriver.user },
      });
      if (existingPhone) {
        return sendError(res, "Phone already registered", 409);
      }
    }

    // Validate license number uniqueness if changed
    if (licenseNumber && licenseNumber !== targetDriver.licenseNumber) {
      const existingLicense = await Driver.findOne({
        licenseNumber,
        _id: { $ne: driverId },
      });
      if (existingLicense) {
        return sendError(res, "License number already registered", 409);
      }
    }

    // Validate number plate uniqueness if changed
    if (
      numberPlateOfVehicle &&
      numberPlateOfVehicle !== targetDriver.numberPlateOfVehicle
    ) {
      const existingPlate = await Driver.findOne({
        numberPlateOfVehicle,
        _id: { $ne: driverId },
      });
      if (existingPlate) {
        return sendError(res, "Number plate already registered", 409);
      }
    }

    // Prepare User updates
    const userUpdates = {};
    if (fullName) userUpdates.fullName = fullName;
    if (username) userUpdates.username = username.toLowerCase();
    if (email) userUpdates.email = email.toLowerCase();
    if (phone) userUpdates.phone = phone;
    if (password) {
      const saltRounds = 10;
      userUpdates.password = await bcrypt.hash(password, saltRounds);
    }

    // Update driver fields
    const updateFields = {};
    if (licenseNumber !== undefined) updateFields.licenseNumber = licenseNumber;
    if (vehicle !== undefined) updateFields.vehicle = vehicle;
    if (vehicleModel !== undefined) updateFields.vehicleModel = vehicleModel;
    if (vehicleYear !== undefined) updateFields.vehicleYear = vehicleYear;
    if (vehicleColor !== undefined) updateFields.vehicleColor = vehicleColor;
    if (vehicleType !== undefined) updateFields.vehicleType = vehicleType;
    if (numberPlateOfVehicle !== undefined)
      updateFields.numberPlateOfVehicle = numberPlateOfVehicle;
    if (rating !== undefined) updateFields.rating = rating;
    if (isApproved !== undefined && currentAdmin.adminType !== "subadmin") {
      if (!["pending", "approved", "rejected"].includes(isApproved)) {
        return sendError(
          res,
          "isApproved must be 'pending', 'approved', or 'rejected'",
          400
        );
      }
      updateFields.isApproved = isApproved;
    }
    if (status !== undefined) updateFields.status = status;

    // Check if any updates were provided
    if (
      Object.keys(userUpdates).length === 0 &&
      Object.keys(updateFields).length === 0
    ) {
      return sendError(res, "No valid updates provided", 400);
    }

    // Update User if there are user updates
    if (Object.keys(userUpdates).length > 0) {
      await User.findByIdAndUpdate(targetDriver.user, userUpdates);
    }

    // Update Driver if there are driver updates
    let updatedDriver = targetDriver;
    if (Object.keys(updateFields).length > 0) {
      updatedDriver = await Driver.findByIdAndUpdate(driverId, updateFields, {
        new: true,
      });
    }

    // Populate user data for response
    await updatedDriver.populate("user", "fullName email phone username");

    sendSuccess(
      res,
      { driver: updatedDriver },
      "Driver profile updated successfully",
      200
    );
  } catch (err) {
    console.error("Update driver profile error:", err);
    sendError(res, "Failed to update driver profile", 500);
  }
};

// Delete driver
exports.deleteDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const userId = req.user.id;

    const targetDriver = await Driver.findById(driverId);
    if (!targetDriver) {
      return sendError(res, "Driver not found", 404);
    }

    const currentAdmin = await Admin.findOne({ user: userId });
    if (!currentAdmin) {
      return sendError(res, "Current admin profile not found", 404);
    }

    // Permission checks - subadmin can delete drivers, admin can delete drivers, superadmin can delete all
    // No restrictions for driver deletion in hierarchy

    // Delete driver profile and user
    await Driver.findByIdAndDelete(driverId);
    await User.findByIdAndDelete(targetDriver.user);

    sendSuccess(res, null, "Driver deleted successfully", 200);
  } catch (err) {
    console.error("Delete driver error:", err);
    sendError(res, "Failed to delete driver", 500);
  }
};

// Suspend or activate driver
exports.manageDriverStatus = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { action } = req.body; // 'suspend' or 'activate'
    const userId = req.user.id;

    if (!["suspend", "activate"].includes(action)) {
      return sendError(res, "Action must be 'suspend' or 'activate'", 400);
    }

    const targetDriver = await Driver.findById(driverId);
    if (!targetDriver) {
      return sendError(res, "Driver not found", 404);
    }

    const currentAdmin = await Admin.findOne({ user: userId });
    if (!currentAdmin) {
      return sendError(res, "Current admin profile not found", 404);
    }

    // Permission checks - subadmin can manage driver status, admin can, superadmin can
    // For now, no restrictions

    let newStatus;
    if (action === "suspend") {
      newStatus = "offline"; // Set to offline when suspended
      // Could add a suspended field to Driver model in future
    } else if (action === "activate") {
      newStatus = "offline"; // Set to offline, driver can go online themselves
    }

    const updatedDriver = await Driver.findByIdAndUpdate(
      driverId,
      { status: newStatus },
      { new: true }
    ).populate("user", "fullName email phone");

    const message =
      action === "suspend"
        ? "Driver suspended successfully"
        : "Driver activated successfully";

    sendSuccess(res, { driver: updatedDriver }, message, 200);
  } catch (err) {
    console.error("Manage driver status error:", err);
    sendError(res, "Failed to manage driver status", 500);
  }
};

// Upload driver photo
exports.uploadDriverPhoto = [
  driverPhotoUpload.single("photo"),
  async (req, res) => {
    try {
      if (!req.file) {
        return sendError(res, "No file uploaded", 400);
      }

      const { driverId } = req.params;

      const driver = await Driver.findById(driverId);
      if (!driver) {
        return sendError(res, "Driver not found", 404);
      }

      // Delete old photo if exists
      if (driver.photo && driver.photo.url) {
        const fs = require("fs");
        const path = require("path");
        const oldPath = path.join(
          __dirname,
          "../uploads/drivers",
          path.basename(driver.photo.url)
        );
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      // Generate URL for the uploaded file
      const photoUrl = `/uploads/drivers/${req.file.filename}`;
      driver.photo = {
        url: photoUrl,
        uploadedAt: new Date(),
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
      };
      await driver.save();

      sendSuccess(
        res,
        {
          photo: driver.photo,
          message: "Driver photo uploaded successfully",
        },
        "Driver photo updated successfully",
        200
      );
    } catch (error) {
      console.error("Upload driver photo error:", error);
      sendError(res, "Failed to upload driver photo", 500);
    }
  },
];

// Suspend rider
exports.suspendRider = async (req, res) => {
  try {
    const { riderId } = req.params;
    const { suspensionMessage } = req.body;

    const rider = await Rider.findById(riderId);
    if (!rider) {
      return sendError(res, "Rider not found", 404);
    }

    rider.isSuspended = true;
    rider.status = "suspended";
    rider.suspensionMessage =
      suspensionMessage ||
      "Your account has been suspended by admin. Please contact admin to resolve this issue.";
    rider.suspendedAt = new Date();
    rider.suspendedBy = req.user.id;

    await rider.save();

    sendSuccess(
      res,
      {
        rider: {
          id: rider._id,
          isSuspended: rider.isSuspended,
          status: rider.status,
          suspensionMessage: rider.suspensionMessage,
          suspendedAt: rider.suspendedAt,
        },
      },
      "Rider suspended successfully",
      200
    );
  } catch (err) {
    console.error("Suspend rider error:", err);
    sendError(res, "Failed to suspend rider", 500);
  }
};

// Unsuspend rider
exports.unsuspendRider = async (req, res) => {
  try {
    const { riderId } = req.params;

    const rider = await Rider.findById(riderId);
    if (!rider) {
      return sendError(res, "Rider not found", 404);
    }

    rider.isSuspended = false;
    rider.status = "offline"; // Set to offline, rider can go online themselves
    rider.suspensionMessage = undefined;
    rider.suspendedAt = undefined;
    rider.suspendedBy = undefined;

    await rider.save();

    sendSuccess(
      res,
      {
        rider: {
          id: rider._id,
          isSuspended: rider.isSuspended,
          status: rider.status,
        },
      },
      "Rider unsuspended successfully",
      200
    );
  } catch (err) {
    console.error("Unsuspend rider error:", err);
    sendError(res, "Failed to unsuspend rider", 500);
  }
};

// Get all riders with pagination and filtering
exports.getRiders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter query
    let query = {};

    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Search by name, email, or phone
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, "i");
      query.$or = [
        { "user.fullName": searchRegex },
        { "user.email": searchRegex },
        { "user.phone": searchRegex },
      ];
    }

    // Get total count
    const total = await Rider.countDocuments(query);

    // Get riders with user details and ride counts
    const riders = await Rider.find(query)
      .populate("user", "fullName email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get ride counts for each rider
    const riderIds = riders.map((rider) => rider._id);
    const rideCounts = await Ride.aggregate([
      { $match: { rider: { $in: riderIds } } },
      { $group: { _id: "$rider", totalRides: { $sum: 1 } } },
    ]);

    // Create a map of rider ID to total rides
    const rideCountMap = {};
    rideCounts.forEach((count) => {
      rideCountMap[count._id.toString()] = count.totalRides;
    });

    // Format response
    const formattedRiders = riders.map((rider) => ({
      riderId: rider._id,
      name: rider.user?.fullName || "N/A",
      contact: {
        email: rider.user?.email || "N/A",
        phone: rider.user?.phone || "N/A",
      },
      totalRides: rideCountMap[rider._id.toString()] || 0,
      status: rider.status,
      rating: rider.rating,
      isSuspended: rider.isSuspended,
      createdAt: rider.createdAt,
    }));

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        riders: formattedRiders,
        pagination: {
          currentPage: page,
          totalPages,
          totalRiders: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "Riders retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get riders error:", err);
    sendError(res, "Failed to retrieve riders", 500);
  }
};

// Get comprehensive rider details by ID
exports.getRiderDetails = async (req, res) => {
  try {
    const { riderId } = req.params;

    const rider = await Rider.findById(riderId)
      .populate(
        "user",
        "fullName email phone username address dateOfBirth preferences isVerified createdAt updatedAt"
      )
      .populate("referredBy", "fullName")
      .populate("suspendedBy", "fullName");

    if (!rider) {
      return sendError(res, "Rider not found", 404);
    }

    // Calculate total rides
    const totalRides = await Ride.countDocuments({
      rider: rider._id,
      status: "completed",
    });

    // Get full wallet details
    const wallet = await Wallet.findOne({ user: rider.user._id });

    // Get payment methods
    const paymentMethods = await PaymentMethod.find({ user: rider.user._id });

    // Get saved locations
    const savedLocations = await SavedLocation.find({ user: rider.user._id });

    // Get active ride
    const activeRide = await Ride.findOne({
      rider: rider._id,
      status: { $in: ["requested", "accepted", "in_progress"] },
    })
      .populate("driver", "user vehicle")
      .populate({
        path: "driver",
        populate: {
          path: "user",
          select: "fullName",
        },
      });

    // Get reward activity
    const rewardActivity = await RewardTransaction.find({
      user: rider.user._id,
    })
      .sort({ createdAt: -1 })
      .limit(10); // Last 10 transactions

    // Calculate total spent
    const totalSpentAgg = await Ride.aggregate([
      { $match: { rider: rider._id, status: "completed" } },
      { $group: { _id: null, total: { $sum: "$fare" } } },
    ]);
    const totalSpent = totalSpentAgg.length > 0 ? totalSpentAgg[0].total : 0;

    // Referral earnings
    const referralEarnings = rider.referralStats
      ? rider.referralStats.totalEarnedFromReferrals
      : 0;

    // Comprehensive rider details
    const riderDetails = {
      riderId: rider._id,
      userId: rider.user,
      referralCode: rider.referralCode,
      referredBy: rider.referredBy,
      rating: rider.rating,
      onlineStatus: rider.status,
      isSuspended: rider.isSuspended,
      suspensionMessage: rider.suspensionMessage,
      suspendedAt: rider.suspendedAt,
      suspendedBy: rider.suspendedBy,
      points: rider.points,
      referralStats: rider.referralStats,
      photo: rider.photo,
      activeStatus: rider.activeStatus,
      createdAt: rider.createdAt,
      updatedAt: rider.updatedAt,
      // Rider profile (user data)
      profile: {
        username: rider.user.username,
        fullName: rider.user.fullName,
        email: rider.user.email,
        phone: rider.user.phone,
        address: rider.user.address,
        dateOfBirth: rider.user.dateOfBirth,
        preferences: rider.user.preferences,
        isVerified: rider.user.isVerified,
        userCreatedAt: rider.user.createdAt,
        userUpdatedAt: rider.user.updatedAt,
      },
      // Wallet
      wallet: wallet
        ? {
            _id: wallet._id,
            balance: wallet.balance,
            currency: wallet.currency,
            transactions: wallet.transactions,
            createdAt: wallet.createdAt,
            updatedAt: wallet.updatedAt,
          }
        : null,
      // Payment methods
      paymentMethods,
      // Saved locations
      savedLocations,
      // Rider dashboard data
      dashboard: {
        totalRides,
        savedAmount: wallet ? wallet.balance : 0,
        totalSpent,
        referralEarnings,
      },
      // Active ride
      activeRide: activeRide
        ? {
            rideId: activeRide._id,
            status: activeRide.status,
            pickup: activeRide.pickup,
            dropoff: activeRide.dropoff,
            fare: activeRide.fare,
            estimatedFare: activeRide.estimatedFare,
            distance: activeRide.actualDistance || activeRide.estimatedDistance,
            duration: activeRide.actualDuration || activeRide.estimatedDuration,
            driver: activeRide.driver
              ? {
                  driverId: activeRide.driver._id,
                  name: activeRide.driver.user?.fullName || "Unknown Driver",
                  vehicle: activeRide.driver.vehicle,
                  rating: activeRide.driver.rating,
                }
              : null,
            createdAt: activeRide.createdAt,
            updatedAt: activeRide.updatedAt,
          }
        : null,
      // Active status (already included above)
      // Referral information (already included above)
      // Reward activity
      rewardActivity,
    };

    sendSuccess(
      res,
      { rider: riderDetails },
      "Rider details retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get rider details error:", err);
    sendError(res, "Failed to retrieve rider details", 500);
  }
};

// Get dashboard counters
exports.getDashboard = async (req, res) => {
  try {
    // Riders counts
    const totalRiders = await Rider.countDocuments();
    const activeRiders = await Rider.countDocuments({ status: "online" });
    const inactiveRiders = await Rider.countDocuments({ status: "offline" });
    const activeStatusActiveRiders = await Rider.countDocuments({
      activeStatus: "active",
    });
    const activeStatusInactiveRiders = await Rider.countDocuments({
      activeStatus: "deactive",
    });

    // Drivers counts
    const totalDrivers = await Driver.countDocuments();
    const activeDrivers = await Driver.countDocuments({
      status: { $in: ["online", "busy"] },
    });
    const inactiveDrivers = await Driver.countDocuments({ status: "offline" });
    const activeStatusActiveDrivers = await Driver.countDocuments({
      activeStatus: "active",
    });
    const activeStatusInactiveDrivers = await Driver.countDocuments({
      activeStatus: "deactive",
    });

    // Rides count
    const totalRides = await Ride.countDocuments();

    // Revenue - sum of paid payments
    const revenueResult = await Payment.aggregate([
      { $match: { status: "paid" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const revenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

    // Admins counts
    const totalAdmins = await Admin.countDocuments();
    const activeAdmins = await Admin.countDocuments({ status: "online" });
    const inactiveAdmins = await Admin.countDocuments({ status: "offline" });
    const activeStatusActiveAdmins = await Admin.countDocuments({
      activeStatus: "active",
    });
    const activeStatusInactiveAdmins = await Admin.countDocuments({
      activeStatus: "deactive",
    });

    const dashboard = {
      riders: {
        total: totalRiders,
        active: activeRiders,
        inactive: inactiveRiders,
        activeStatus: {
          active: activeStatusActiveRiders,
          inactive: activeStatusInactiveRiders,
        },
      },
      drivers: {
        total: totalDrivers,
        active: activeDrivers,
        inactive: inactiveDrivers,
        activeStatus: {
          active: activeStatusActiveDrivers,
          inactive: activeStatusInactiveDrivers,
        },
      },
      rides: totalRides,
      revenue: revenue,
      admins: {
        total: totalAdmins,
        active: activeAdmins,
        inactive: inactiveAdmins,
        activeStatus: {
          active: activeStatusActiveAdmins,
          inactive: activeStatusInactiveAdmins,
        },
      },
    };

    sendSuccess(res, dashboard, "Dashboard data retrieved successfully", 200);
  } catch (err) {
    console.error("Get dashboard error:", err);
    sendError(res, "Failed to retrieve dashboard data", 500);
  }
};

// Get all rides with pagination and filtering
exports.getRides = async (req, res) => {
  try {
    const userId = req.user.id;
    const userAdmin = await Admin.findOne({ user: userId });

    if (!userAdmin) {
      return sendError(res, "Admin profile not found", 404);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter query
    let query = {};

    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Filter by date range
    if (req.query.startDate && req.query.endDate) {
      query.createdAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate),
      };
    }

    // Search by rider or driver name
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, "i");
      // Search in rider and driver user fullName
      const riderUserIds = await User.find({
        fullName: searchRegex,
        role: "rider",
      }).select("_id");
      const driverUserIds = await User.find({
        fullName: searchRegex,
        role: "driver",
      }).select("_id");
      const driverIds = await Driver.find({
        user: { $in: driverUserIds.map((u) => u._id) },
      }).select("_id");

      query.$or = [
        { rider: { $in: riderUserIds.map((u) => u._id) } },
        { driver: { $in: driverIds.map((d) => d._id) } },
      ];
    }

    const total = await Ride.countDocuments(query);
    const rides = await Ride.find(query)
      .populate("rider", "fullName")
      .populate("driver", "user")
      .populate({
        path: "driver",
        populate: {
          path: "user",
          select: "fullName",
        },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const formattedRides = rides.map((ride) => ({
      rideId: ride._id,
      riderFullName: ride.rider?.fullName || "N/A",
      driverFullName: ride.driver?.user?.fullName || "N/A",
      route: `${ride.pickup?.address || "N/A"} to ${
        ride.dropoff?.address || "N/A"
      }`,
      distance: ride.actualDistance || ride.estimatedDistance || 0,
      fare: ride.fare || ride.estimatedFare || 0,
      status: ride.status,
      createdAt: ride.createdAt,
    }));

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        rides: formattedRides,
        pagination: {
          currentPage: page,
          totalPages,
          totalRides: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "Rides retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get rides error:", err);
    sendError(res, "Failed to retrieve rides", 500);
  }
};

// Get ride details by ID
exports.getRideDetails = async (req, res) => {
  try {
    const { rideId } = req.params;

    const ride = await Ride.findById(rideId)
      .populate("rider", "fullName email phone")
      .populate("driver", "user vehicle")
      .populate({
        path: "driver",
        populate: {
          path: "user",
          select: "fullName email phone",
        },
      });

    if (!ride) {
      return sendError(res, "Ride not found", 404);
    }

    sendSuccess(res, { ride }, "Ride details retrieved successfully", 200);
  } catch (err) {
    console.error("Get ride details error:", err);
    sendError(res, "Failed to retrieve ride details", 500);
  }
};

// Get admin active status history
exports.getAdminActiveHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { userType: "admin" };

    const total = await ActiveStatusHistory.countDocuments(query);
    const history = await ActiveStatusHistory.find(query)
      .populate("userId", "fullName email username")
      .populate("adminId", "adminType activeStatus")
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        history,
        pagination: {
          currentPage: page,
          totalPages,
          totalRecords: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "Admin active status history retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get admin active history error:", err);
    sendError(res, "Failed to retrieve admin active status history", 500);
  }
};

// Get driver active status history
exports.getDriverActiveHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { userType: "driver" };

    const total = await ActiveStatusHistory.countDocuments(query);
    const history = await ActiveStatusHistory.find(query)
      .populate("userId", "fullName email username")
      .populate("driverId", "vehicle numberPlateOfVehicle activeStatus")
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        history,
        pagination: {
          currentPage: page,
          totalPages,
          totalRecords: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "Driver active status history retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get driver active history error:", err);
    sendError(res, "Failed to retrieve driver active status history", 500);
  }
};

// Get rider active status history
exports.getRiderActiveHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { userType: "rider" };

    const total = await ActiveStatusHistory.countDocuments(query);
    const history = await ActiveStatusHistory.find(query)
      .populate("userId", "fullName email username")
      .populate("riderId", "rating activeStatus")
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        history,
        pagination: {
          currentPage: page,
          totalPages,
          totalRecords: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "Rider active status history retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get rider active history error:", err);
    sendError(res, "Failed to retrieve rider active status history", 500);
  }
};

// Activate driver account (admin function)
exports.activateDriverAccount = async (req, res) => {
  try {
    const { driverId } = req.params;
    const userId = req.user.id;

    const targetDriver = await Driver.findById(driverId);
    if (!targetDriver) {
      return sendError(res, "Driver not found", 404);
    }

    const currentAdmin = await Admin.findOne({ user: userId });
    if (!currentAdmin) {
      return sendError(res, "Admin profile not found", 404);
    }

    // Permission checks - subadmin can activate, admin can, superadmin can
    // No restrictions for activation

    // Update activeStatus
    await Driver.findByIdAndUpdate(driverId, { activeStatus: "active" });

    // Create history
    const historyData = {
      userId: targetDriver.user,
      userType: "driver",
      action: "activate",
      performedBy: userId,
    };
    historyData.driverId = driverId;
    await ActiveStatusHistory.create(historyData);

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.emit("activeStatusChanged", {
        userId: targetDriver.user,
        userType: "driver",
        action: "activate",
        timestamp: new Date(),
        performedBy: userId,
      });
    }

    // Real-time WebSocket notifications for driver activation
    socketService.notifyUser(targetDriver.user.toString(), "account_activated", {
      userType: "driver",
      driverId: targetDriver._id,
      activeStatus: "active",
      message: "Your driver account has been activated.",
      timestamp: new Date()
    });

    socketService.notifyDriverDashboardUpdate(targetDriver._id.toString(), {
      activeStatus: "active",
      message: "Your account has been activated!"
    }, "account_status");

    socketService.notifyUser("admin", "admin_driver_activated", {
      driverId: targetDriver._id,
      activatedBy: req.user.fullName || req.user.id,
      timestamp: new Date()
    });

    sendSuccess(
      res,
      { timestamp: new Date() },
      "Driver account activated successfully",
      200
    );
  } catch (err) {
    console.error("Activate driver account error:", err);
    sendError(res, "Failed to activate driver account", 500);
  }
};

// Deactivate driver account (admin function)
exports.deactivateDriverAccount = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    const targetDriver = await Driver.findById(driverId);
    if (!targetDriver) {
      return sendError(res, "Driver not found", 404);
    }

    const currentAdmin = await Admin.findOne({ user: userId });
    if (!currentAdmin) {
      return sendError(res, "Admin profile not found", 404);
    }

    // Update activeStatus
    await Driver.findByIdAndUpdate(driverId, { activeStatus: "deactive" });

    // Create history
    const historyData = {
      userId: targetDriver.user,
      userType: "driver",
      action: "deactivate",
      performedBy: userId,
      reason: reason,
    };
    historyData.driverId = driverId;
    await ActiveStatusHistory.create(historyData);

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.emit("activeStatusChanged", {
        userId: targetDriver.user,
        userType: "driver",
        action: "deactivate",
        timestamp: new Date(),
        performedBy: userId,
      });
    }

    // Real-time WebSocket notifications for driver deactivation
    socketService.notifyUser(targetDriver.user.toString(), "account_deactivated", {
      userType: "driver",
      driverId: targetDriver._id,
      activeStatus: "inactive",
      message: "Your driver account has been deactivated. Please contact support for more information.",
      timestamp: new Date()
    });

    socketService.notifyDriverDashboardUpdate(targetDriver._id.toString(), {
      activeStatus: "inactive",
      status: "offline",
      message: "Your account has been deactivated."
    }, "account_status");

    socketService.notifyUser("admin", "admin_driver_deactivated", {
      driverId: targetDriver._id,
      deactivatedBy: req.user.fullName || req.user.id,
      timestamp: new Date()
    });

    sendSuccess(
      res,
      { timestamp: new Date() },
      "Driver account deactivated successfully",
      200
    );
  } catch (err) {
    console.error("Deactivate driver account error:", err);
    sendError(res, "Failed to deactivate driver account", 500);
  }
};

// Activate rider account (admin function)
exports.activateRiderAccount = async (req, res) => {
  try {
    const { riderId } = req.params;
    const userId = req.user.id;

    const targetRider = await Rider.findById(riderId);
    if (!targetRider) {
      return sendError(res, "Rider not found", 404);
    }

    const currentAdmin = await Admin.findOne({ user: userId });
    if (!currentAdmin) {
      return sendError(res, "Admin profile not found", 404);
    }

    // Update activeStatus
    await Rider.findByIdAndUpdate(riderId, { activeStatus: "active" });

    // Create history
    const historyData = {
      userId: targetRider.user,
      userType: "rider",
      action: "activate",
      performedBy: userId,
    };
    historyData.riderId = riderId;
    await ActiveStatusHistory.create(historyData);

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.emit("activeStatusChanged", {
        userId: targetRider.user,
        userType: "rider",
        action: "activate",
        timestamp: new Date(),
        performedBy: userId,
      });
    }

    // Real-time WebSocket notifications for rider activation
    socketService.notifyUser(targetRider.user.toString(), "account_activated", {
      userType: "rider",
      riderId: targetRider._id,
      activeStatus: "active",
      message: "Your rider account has been activated.",
      timestamp: new Date()
    });

    socketService.notifyDashboard(targetRider._id.toString(), "account_status", {
      activeStatus: "active",
      message: "Your account has been activated!"
    });

    socketService.notifyUser("admin", "admin_rider_activated", {
      riderId: targetRider._id,
      activatedBy: req.user.fullName || req.user.id,
      timestamp: new Date()
    });

    sendSuccess(
      res,
      { timestamp: new Date() },
      "Rider account activated successfully",
      200
    );
  } catch (err) {
    console.error("Activate rider account error:", err);
    sendError(res, "Failed to activate rider account", 500);
  }
};

// Deactivate rider account (admin function)
exports.deactivateRiderAccount = async (req, res) => {
  try {
    const { riderId } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    const targetRider = await Rider.findById(riderId);
    if (!targetRider) {
      return sendError(res, "Rider not found", 404);
    }

    const currentAdmin = await Admin.findOne({ user: userId });
    if (!currentAdmin) {
      return sendError(res, "Admin profile not found", 404);
    }

    // Update activeStatus
    await Rider.findByIdAndUpdate(riderId, { activeStatus: "deactive" });

    // Create history
    const historyData = {
      userId: targetRider.user,
      userType: "rider",
      action: "deactivate",
      performedBy: userId,
      reason: reason,
    };
    historyData.riderId = riderId;
    await ActiveStatusHistory.create(historyData);

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.emit("activeStatusChanged", {
        userId: targetRider.user,
        userType: "rider",
        action: "deactivate",
        timestamp: new Date(),
        performedBy: userId,
        reason: reason,
      });
    }

    // Real-time WebSocket notifications for rider deactivation
    socketService.notifyUser(targetRider.user.toString(), "account_deactivated", {
      userType: "rider",
      riderId: targetRider._id,
      activeStatus: "inactive",
      message: "Your rider account has been deactivated. Please contact support for more information.",
      timestamp: new Date()
    });

    socketService.notifyDashboard(targetRider._id.toString(), "account_status", {
      activeStatus: "inactive",
      message: "Your account has been deactivated."
    });

    socketService.notifyUser("admin", "admin_rider_deactivated", {
      riderId: targetRider._id,
      deactivatedBy: req.user.fullName || req.user.id,
      timestamp: new Date()
    });

    sendSuccess(
      res,
      { timestamp: new Date() },
      "Rider account deactivated successfully",
      200
    );
  } catch (err) {
    console.error("Deactivate rider account error:", err);
    sendError(res, "Failed to deactivate rider account", 500);
  }
};

// Activate admin account (admin function)
exports.activateAdminAccount = async (req, res) => {
  try {
    const { adminId } = req.params;
    const userId = req.user.id;

    const targetAdmin = await Admin.findById(adminId);
    if (!targetAdmin) {
      return sendError(res, "Admin not found", 404);
    }

    const currentAdmin = await Admin.findOne({ user: userId });
    if (!currentAdmin) {
      return sendError(res, "Current admin profile not found", 404);
    }

    // Permission checks - only superadmin can activate admin accounts
    if (currentAdmin.adminType !== "superadmin") {
      return sendError(res, "Only superadmin can manage admin accounts", 403);
    }

    // Update activeStatus
    await Admin.findByIdAndUpdate(adminId, { activeStatus: "active" });

    // Create history
    const historyData = {
      userId: targetAdmin.user,
      userType: "admin",
      action: "activate",
      performedBy: userId,
    };
    historyData.adminId = adminId;
    await ActiveStatusHistory.create(historyData);

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.emit("activeStatusChanged", {
        userId: targetAdmin.user,
        userType: "admin",
        action: "activate",
        timestamp: new Date(),
        performedBy: userId,
      });
    }

    sendSuccess(
      res,
      { timestamp: new Date() },
      "Admin account activated successfully",
      200
    );
  } catch (err) {
    console.error("Activate admin account error:", err);
    sendError(res, "Failed to activate admin account", 500);
  }
};

// Deactivate admin account (admin function)
exports.deactivateAdminAccount = async (req, res) => {
  try {
    const { adminId } = req.params;
    const userId = req.user.id;

    const targetAdmin = await Admin.findById(adminId);
    if (!targetAdmin) {
      return sendError(res, "Admin not found", 404);
    }

    const currentAdmin = await Admin.findOne({ user: userId });
    if (!currentAdmin) {
      return sendError(res, "Current admin profile not found", 404);
    }

    // Permission checks - only superadmin can deactivate admin accounts
    if (currentAdmin.adminType !== "superadmin") {
      return sendError(res, "Only superadmin can manage admin accounts", 403);
    }

    // Update activeStatus
    await Admin.findByIdAndUpdate(adminId, { activeStatus: "deactive" });

    // Create history
    const historyData = {
      userId: targetAdmin.user,
      userType: "admin",
      action: "deactivate",
      performedBy: userId,
    };
    historyData.adminId = adminId;
    await ActiveStatusHistory.create(historyData);

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.emit("activeStatusChanged", {
        userId: targetAdmin.user,
        userType: "admin",
        action: "deactivate",
        timestamp: new Date(),
        performedBy: userId,
      });
    }

    sendSuccess(
      res,
      { timestamp: new Date() },
      "Admin account deactivated successfully",
      200
    );
  } catch (err) {
    console.error("Deactivate admin account error:", err);
    sendError(res, "Failed to deactivate admin account", 500);
  }
};

// Get all active status history
exports.getAllActiveHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await ActiveStatusHistory.countDocuments();
    const history = await ActiveStatusHistory.find()
      .populate("userId", "fullName email username")
      .populate("driverId", "vehicle numberPlateOfVehicle activeStatus")
      .populate("adminId", "adminType activeStatus")
      .populate("riderId", "rating activeStatus")
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(total / limit);

    sendSuccess(
      res,
      {
        history,
        pagination: {
          currentPage: page,
          totalPages,
          totalRecords: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      "All active status history retrieved successfully",
      200
    );
  } catch (err) {
    console.error("Get all active history error:", err);
    sendError(res, "Failed to retrieve all active status history", 500);
  }
};
// =============================================
// ANALYTICS ENDPOINTS
// =============================================

// 1. GET /api/v1/admin/analytics - General dashboard analytics
exports.getAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Default to last 30 days if no dates provided
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get counts
    const [
      totalRiders,
      totalDrivers,
      totalRides,
      completedRides,
      cancelledRides,
      activeDrivers,
      pendingDrivers,
      activeRiders,
      totalRevenue
    ] = await Promise.all([
      Rider.countDocuments(),
      Driver.countDocuments(),
      Ride.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      Ride.countDocuments({ status: 'completed', createdAt: { $gte: start, $lte: end } }),
      Ride.countDocuments({ status: 'cancelled', createdAt: { $gte: start, $lte: end } }),
      Driver.countDocuments({ status: 'online', isApproved: 'approved' }),
      Driver.countDocuments({ isApproved: 'pending' }),
      Rider.countDocuments({ activeStatus: 'active' }),
      Payment.aggregate([
        { $match: { status: 'paid', createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    // Calculate growth (compare to previous period)
    const previousStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
    const [previousRides, previousRevenue] = await Promise.all([
      Ride.countDocuments({ createdAt: { $gte: previousStart, $lt: start } }),
      Payment.aggregate([
        { $match: { status: 'paid', createdAt: { $gte: previousStart, $lt: start } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    const currentRevenue = totalRevenue[0]?.total || 0;
    const prevRevenue = previousRevenue[0]?.total || 0;
    const rideGrowth = previousRides > 0 ? ((completedRides - previousRides) / previousRides * 100).toFixed(1) : 0;
    const revenueGrowth = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue * 100).toFixed(1) : 0;

    sendSuccess(res, {
      period: { start, end },
      users: {
        totalRiders,
        activeRiders,
        totalDrivers,
        activeDrivers,
        pendingDrivers
      },
      rides: {
        total: totalRides,
        completed: completedRides,
        cancelled: cancelledRides,
        completionRate: totalRides > 0 ? ((completedRides / totalRides) * 100).toFixed(1) : 0,
        growth: parseFloat(rideGrowth)
      },
      revenue: {
        total: currentRevenue,
        growth: parseFloat(revenueGrowth),
        currency: 'GBP'
      }
    }, 'Analytics retrieved successfully', 200);
  } catch (err) {
    console.error('Get analytics error:', err);
    sendError(res, 'Failed to retrieve analytics', 500);
  }
};

// 2. GET /api/v1/admin/analytics/revenue - Revenue analytics
exports.getRevenueAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;
    
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Date grouping format based on groupBy parameter
    let dateFormat;
    switch (groupBy) {
      case 'hour':
        dateFormat = { $dateToString: { format: '%Y-%m-%d %H:00', date: '$createdAt' } };
        break;
      case 'week':
        dateFormat = { $dateToString: { format: '%Y-W%V', date: '$createdAt' } };
        break;
      case 'month':
        dateFormat = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
        break;
      default: // day
        dateFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
    }

    // Revenue over time
    const revenueOverTime = await Payment.aggregate([
      { $match: { status: 'paid', createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: dateFormat,
          revenue: { $sum: '$amount' },
          transactions: { $sum: 1 },
          avgTransaction: { $avg: '$amount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Revenue by payment method
    const revenueByMethod = await Payment.aggregate([
      { $match: { status: 'paid', createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: '$paymentMethod',
          revenue: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Platform commission vs driver earnings from rides
    const earningsBreakdown = await Ride.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: null,
          totalFare: { $sum: '$fare' },
          totalCommission: { $sum: '$platformCommission' },
          totalDriverEarnings: { $sum: '$driverEarnings' },
          totalTips: { $sum: '$tips' }
        }
      }
    ]);

    // Total summary
    const totalRevenue = revenueOverTime.reduce((sum, item) => sum + item.revenue, 0);
    const totalTransactions = revenueOverTime.reduce((sum, item) => sum + item.transactions, 0);

    sendSuccess(res, {
      period: { start, end, groupBy },
      summary: {
        totalRevenue,
        totalTransactions,
        averageTransaction: totalTransactions > 0 ? (totalRevenue / totalTransactions).toFixed(2) : 0,
        currency: 'GBP'
      },
      revenueOverTime,
      revenueByPaymentMethod: revenueByMethod,
      earningsBreakdown: earningsBreakdown[0] || {
        totalFare: 0,
        totalCommission: 0,
        totalDriverEarnings: 0,
        totalTips: 0
      }
    }, 'Revenue analytics retrieved successfully', 200);
  } catch (err) {
    console.error('Get revenue analytics error:', err);
    sendError(res, 'Failed to retrieve revenue analytics', 500);
  }
};

// 3. GET /api/v1/admin/analytics/rides - Ride statistics
exports.getRideAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;
    
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    let dateFormat;
    switch (groupBy) {
      case 'hour':
        dateFormat = { $dateToString: { format: '%Y-%m-%d %H:00', date: '$createdAt' } };
        break;
      case 'week':
        dateFormat = { $dateToString: { format: '%Y-W%V', date: '$createdAt' } };
        break;
      case 'month':
        dateFormat = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
        break;
      default:
        dateFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
    }

    // Rides over time
    const ridesOverTime = await Ride.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: dateFormat,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Rides by status
    const ridesByStatus = await Ride.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Rides by vehicle type
    const ridesByVehicleType = await Ride.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: '$vehicleType', count: { $sum: 1 } } }
    ]);

    // Rides by payment method
    const ridesByPaymentMethod = await Ride.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: '$paymentMethod', count: { $sum: 1 } } }
    ]);

    // Average ride statistics
    const avgStats = await Ride.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: null,
          avgFare: { $avg: '$fare' },
          avgDistance: { $avg: '$actualDistance' },
          avgDuration: { $avg: '$actualDuration' },
          avgRating: { $avg: '$rating.driverRating' },
          totalDistance: { $sum: '$actualDistance' },
          totalDuration: { $sum: '$actualDuration' }
        }
      }
    ]);

    // Peak hours analysis
    const peakHours = await Ride.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    const totalRides = ridesByStatus.reduce((sum, item) => sum + item.count, 0);
    const completedRides = ridesByStatus.find(s => s._id === 'completed')?.count || 0;

    sendSuccess(res, {
      period: { start, end, groupBy },
      summary: {
        totalRides,
        completedRides,
        completionRate: totalRides > 0 ? ((completedRides / totalRides) * 100).toFixed(1) : 0
      },
      ridesOverTime,
      ridesByStatus,
      ridesByVehicleType,
      ridesByPaymentMethod,
      averageStatistics: avgStats[0] || {
        avgFare: 0,
        avgDistance: 0,
        avgDuration: 0,
        avgRating: 0,
        totalDistance: 0,
        totalDuration: 0
      },
      peakHours: peakHours.map(h => ({ hour: h._id, rides: h.count }))
    }, 'Ride analytics retrieved successfully', 200);
  } catch (err) {
    console.error('Get ride analytics error:', err);
    sendError(res, 'Failed to retrieve ride analytics', 500);
  }
};
// 4. GET /api/v1/admin/analytics/top-drivers - Top performing drivers (all drivers ranked by rides)
exports.getTopDrivers = async (req, res) => {
  try {
    const { startDate, endDate, limit = 10, sortBy = 'rides', status } = req.query;
    
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const limitNum = parseInt(limit) || 10;

    // Build match query for rides
    const matchQuery = {
      createdAt: { $gte: start, $lte: end },
      driver: { $exists: true, $ne: null }
    };
    
    if (status && status !== 'all') {
      matchQuery.status = status;
    }

    // Get ride stats per driver
    const rideStats = await Ride.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$driver',
          totalRides: { $sum: 1 },
          totalEarnings: { $sum: { $ifNull: ['$driverEarnings', 0] } },
          totalFare: { $sum: { $ifNull: ['$fare', 0] } },
          totalTips: { $sum: { $ifNull: ['$tips', 0] } },
          avgRating: { $avg: '$rating.driverRating' },
          totalDistance: { $sum: { $ifNull: ['$actualDistance', 0] } }
        }
      }
    ]);

    // Create a map of ride stats by driver ID
    const statsMap = {};
    rideStats.forEach(stat => {
      statsMap[stat._id.toString()] = stat;
    });

    // Get ALL active drivers with user info
    const allDrivers = await Driver.find({ activeStatus: 'active' })
      .populate('user', 'fullName email phone')
      .select('user vehicle vehicleType numberPlateOfVehicle photo rating status isApproved')
      .lean();

    // Combine driver info with ride stats
    const driversWithStats = allDrivers.map(driver => {
      const stats = statsMap[driver._id.toString()] || {
        totalRides: 0,
        totalEarnings: 0,
        totalFare: 0,
        totalTips: 0,
        avgRating: null,
        totalDistance: 0
      };

      return {
        driverId: driver._id,
        fullName: driver.user?.fullName || 'Unknown',
        email: driver.user?.email || '',
        phone: driver.user?.phone || '',
        vehicle: driver.vehicle,
        vehicleType: driver.vehicleType,
        numberPlate: driver.numberPlateOfVehicle,
        photo: driver.photo?.url || null,
        overallRating: driver.rating || 0,
        status: driver.status,
        isApproved: driver.isApproved,
        totalRides: stats.totalRides,
        totalEarnings: stats.totalEarnings,
        totalFare: stats.totalFare,
        totalTips: stats.totalTips,
        avgRating: stats.avgRating ? parseFloat(stats.avgRating.toFixed(2)) : null,
        totalDistance: stats.totalDistance ? parseFloat(stats.totalDistance.toFixed(2)) : 0
      };
    });

    // Sort based on sortBy parameter (default: rides)
    driversWithStats.sort((a, b) => {
      if (sortBy === 'earnings') return b.totalEarnings - a.totalEarnings;
      if (sortBy === 'rating') return (b.overallRating || 0) - (a.overallRating || 0);
      return b.totalRides - a.totalRides; // default: rides
    });

    // Apply limit and add rank
    const topDrivers = driversWithStats.slice(0, limitNum).map((driver, index) => ({
      rank: index + 1,
      ...driver
    }));

    sendSuccess(res, {
      period: { start, end },
      sortedBy: sortBy,
      totalDrivers: driversWithStats.length,
      topDrivers
    }, 'Top drivers retrieved successfully', 200);
  } catch (err) {
    console.error('Get top drivers error:', err);
    sendError(res, 'Failed to retrieve top drivers', 500);
  }
};

// 5. GET /api/v1/admin/analytics/top-riders - Top active riders (all riders ranked by rides)
exports.getTopRiders = async (req, res) => {
  try {
    const { startDate, endDate, limit = 10, sortBy = 'rides', status } = req.query;
    
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const limitNum = parseInt(limit) || 10;

    // Build match query for rides
    const matchQuery = {
      createdAt: { $gte: start, $lte: end },
      rider: { $exists: true, $ne: null }
    };
    
    if (status && status !== 'all') {
      matchQuery.status = status;
    }

    // Get ride stats per rider (rider field stores user._id)
    const rideStats = await Ride.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$rider',
          totalRides: { $sum: 1 },
          totalSpent: { $sum: { $ifNull: ['$fare', 0] } },
          totalTips: { $sum: { $ifNull: ['$tips', 0] } },
          avgFare: { $avg: '$fare' },
          avgRating: { $avg: '$rating.riderRating' }
        }
      }
    ]);

    // Create a map of ride stats by rider user ID
    const statsMap = {};
    rideStats.forEach(stat => {
      statsMap[stat._id.toString()] = stat;
    });

    // Get ALL active riders with user info
    const allRiders = await Rider.find({ activeStatus: 'active' })
      .populate('user', 'fullName email phone')
      .select('user photo rating points status')
      .lean();

    // Combine rider info with ride stats
    const ridersWithStats = allRiders.map(rider => {
      const stats = statsMap[rider.user?._id?.toString()] || {
        totalRides: 0,
        totalSpent: 0,
        totalTips: 0,
        avgFare: null,
        avgRating: null
      };

      return {
        riderId: rider._id,
        oderId: rider.user?._id,
        fullName: rider.user?.fullName || 'Unknown',
        email: rider.user?.email || '',
        phone: rider.user?.phone || '',
        photo: rider.photo?.url || null,
        overallRating: rider.rating || 0,
        tier: rider.points?.currentTier || 'Bronze',
        pointsBalance: rider.points?.balance || 0,
        status: rider.status,
        totalRides: stats.totalRides,
        totalSpent: stats.totalSpent ? parseFloat(stats.totalSpent.toFixed(2)) : 0,
        totalTips: stats.totalTips ? parseFloat(stats.totalTips.toFixed(2)) : 0,
        avgFare: stats.avgFare ? parseFloat(stats.avgFare.toFixed(2)) : 0,
        avgRating: stats.avgRating ? parseFloat(stats.avgRating.toFixed(2)) : null
      };
    });

    // Sort based on sortBy parameter (default: rides)
    ridersWithStats.sort((a, b) => {
      if (sortBy === 'spending') return b.totalSpent - a.totalSpent;
      if (sortBy === 'rating') return (b.overallRating || 0) - (a.overallRating || 0);
      return b.totalRides - a.totalRides; // default: rides
    });

    // Apply limit and add rank
    const topRiders = ridersWithStats.slice(0, limitNum).map((rider, index) => ({
      rank: index + 1,
      ...rider
    }));

    sendSuccess(res, {
      period: { start, end },
      sortedBy: sortBy,
      totalRiders: ridersWithStats.length,
      topRiders
    }, 'Top riders retrieved successfully', 200);
  } catch (err) {
    console.error('Get top riders error:', err);
    sendError(res, 'Failed to retrieve top riders', 500);
  }
};

// 6. GET /api/v1/admin/analytics/realtime - Real-time dashboard data
exports.getRealtimeAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Get real-time counts
    const [
      onlineDrivers,
      busyDrivers,
      offlineDrivers,
      activeRides,
      pendingRides,
      todayRides,
      todayCompletedRides,
      todayCancelledRides,
      lastHourRides,
      todayRevenue,
      pendingDriverApprovals,
      onlineRiders
    ] = await Promise.all([
      Driver.countDocuments({ status: 'online', isApproved: 'approved', activeStatus: 'active' }),
      Driver.countDocuments({ status: 'busy', isApproved: 'approved', activeStatus: 'active' }),
      Driver.countDocuments({ status: 'offline', isApproved: 'approved', activeStatus: 'active' }),
      Ride.countDocuments({ status: { $in: ['accepted', 'in_progress'] } }),
      Ride.countDocuments({ status: { $in: ['requested', 'searching', 'assigned'] } }),
      Ride.countDocuments({ createdAt: { $gte: todayStart } }),
      Ride.countDocuments({ status: 'completed', createdAt: { $gte: todayStart } }),
      Ride.countDocuments({ status: 'cancelled', createdAt: { $gte: todayStart } }),
      Ride.countDocuments({ createdAt: { $gte: hourAgo } }),
      Payment.aggregate([
        { $match: { status: 'paid', createdAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Driver.countDocuments({ isApproved: 'pending' }),
      Rider.countDocuments({ status: 'online' })
    ]);

    // Recent rides (last 10)
    const recentRides = await Ride.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('rider', 'fullName email')
      .populate({
        path: 'driver',
        populate: { path: 'user', select: 'fullName' }
      })
      .select('status fare pickup.address dropoff.address createdAt paymentMethod');

    // Hourly ride trend for today
    const hourlyTrend = await Ride.aggregate([
      { $match: { createdAt: { $gte: todayStart } } },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          count: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    sendSuccess(res, {
      timestamp: now,
      drivers: {
        online: onlineDrivers,
        busy: busyDrivers,
        offline: offlineDrivers,
        total: onlineDrivers + busyDrivers + offlineDrivers,
        available: onlineDrivers,
        pendingApproval: pendingDriverApprovals
      },
      riders: {
        online: onlineRiders
      },
      rides: {
        active: activeRides,
        pending: pendingRides,
        inProgress: activeRides,
        today: {
          total: todayRides,
          completed: todayCompletedRides,
          cancelled: todayCancelledRides,
          completionRate: todayRides > 0 ? ((todayCompletedRides / todayRides) * 100).toFixed(1) : 0
        },
        lastHour: lastHourRides
      },
      revenue: {
        today: todayRevenue[0]?.total || 0,
        currency: 'GBP'
      },
      recentRides: recentRides.map(ride => ({
        id: ride._id,
        status: ride.status,
        fare: ride.fare,
        pickup: ride.pickup?.address,
        dropoff: ride.dropoff?.address,
        paymentMethod: ride.paymentMethod,
        riderName: ride.rider?.fullName,
        driverName: ride.driver?.user?.fullName,
        createdAt: ride.createdAt
      })),
      hourlyTrend: hourlyTrend.map(h => ({
        hour: h._id,
        total: h.count,
        completed: h.completed
      }))
    }, 'Realtime analytics retrieved successfully', 200);
  } catch (err) {
    console.error('Get realtime analytics error:', err);
    sendError(res, 'Failed to retrieve realtime analytics', 500);
  }
};

// Monthly Performance Analytics - Last 12 months with rides, revenue, new users, and month-over-month growth
exports.getMonthlyPerformance = async (req, res) => {
  try {
    const monthsCount = parseInt(req.query.months) || 12;
    
    // Calculate start date (beginning of month, X months ago)
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - monthsCount + 1, 1);
    
    // Month names for display
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    // Aggregate rides by month
    const ridesByMonth = await Ride.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          totalRides: { $sum: 1 },
          completedRides: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
          },
          cancelledRides: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] }
          },
          totalFare: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$fare", 0] }
          },
          totalTips: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$tips", 0] }
          },
          platformCommission: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$platformCommission", 0] }
          },
          driverEarnings: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$driverEarnings", 0] }
          }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 }
      }
    ]);

    // Aggregate new drivers by month (based on User createdAt with role 'driver')
    const newDriversByMonth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          role: "driver"
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 }
      }
    ]);

    // Aggregate new riders by month (based on User createdAt with role 'rider')
    const newRidersByMonth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          role: "rider"
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 }
      }
    ]);

    // Create lookup maps for easy access
    const ridesMap = {};
    ridesByMonth.forEach(r => {
      ridesMap[`${r._id.year}-${r._id.month}`] = r;
    });

    const driversMap = {};
    newDriversByMonth.forEach(d => {
      driversMap[`${d._id.year}-${d._id.month}`] = d.count;
    });

    const ridersMap = {};
    newRidersByMonth.forEach(r => {
      ridersMap[`${r._id.year}-${r._id.month}`] = r.count;
    });

    // Build monthly data array for last X months
    const monthlyData = [];
    let totalRides = 0;
    let totalRevenue = 0;
    let totalCommission = 0;
    let totalNewDrivers = 0;
    let totalNewRiders = 0;

    for (let i = 0; i < monthsCount; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - monthsCount + 1 + i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1; // MongoDB months are 1-indexed
      const key = `${year}-${month}`;

      const rideData = ridesMap[key] || {
        totalRides: 0,
        completedRides: 0,
        cancelledRides: 0,
        totalFare: 0,
        totalTips: 0,
        platformCommission: 0,
        driverEarnings: 0
      };

      const newDrivers = driversMap[key] || 0;
      const newRiders = ridersMap[key] || 0;

      // Calculate average fare
      const avgFare = rideData.completedRides > 0 
        ? (rideData.totalFare / rideData.completedRides) 
        : 0;

      monthlyData.push({
        month: monthNames[month - 1],
        year: year,
        monthNumber: month,
        rides: {
          total: rideData.totalRides,
          completed: rideData.completedRides,
          cancelled: rideData.cancelledRides,
          completionRate: rideData.totalRides > 0 
            ? parseFloat(((rideData.completedRides / rideData.totalRides) * 100).toFixed(1))
            : 0
        },
        revenue: {
          totalFare: parseFloat(rideData.totalFare.toFixed(2)),
          tips: parseFloat(rideData.totalTips.toFixed(2)),
          platformCommission: parseFloat(rideData.platformCommission.toFixed(2)),
          driverEarnings: parseFloat(rideData.driverEarnings.toFixed(2)),
          averageFare: parseFloat(avgFare.toFixed(2))
        },
        newUsers: {
          drivers: newDrivers,
          riders: newRiders,
          total: newDrivers + newRiders
        },
        growth: {
          ridesPercent: 0,
          revenuePercent: 0,
          newUsersPercent: 0
        }
      });

      // Add to totals
      totalRides += rideData.completedRides;
      totalRevenue += rideData.totalFare;
      totalCommission += rideData.platformCommission;
      totalNewDrivers += newDrivers;
      totalNewRiders += newRiders;
    }

    // Calculate month-over-month growth
    for (let i = 1; i < monthlyData.length; i++) {
      const current = monthlyData[i];
      const previous = monthlyData[i - 1];

      // Rides growth
      if (previous.rides.completed > 0) {
        current.growth.ridesPercent = parseFloat(
          (((current.rides.completed - previous.rides.completed) / previous.rides.completed) * 100).toFixed(1)
        );
      } else if (current.rides.completed > 0) {
        current.growth.ridesPercent = 100;
      }

      // Revenue growth
      if (previous.revenue.totalFare > 0) {
        current.growth.revenuePercent = parseFloat(
          (((current.revenue.totalFare - previous.revenue.totalFare) / previous.revenue.totalFare) * 100).toFixed(1)
        );
      } else if (current.revenue.totalFare > 0) {
        current.growth.revenuePercent = 100;
      }

      // New users growth
      if (previous.newUsers.total > 0) {
        current.growth.newUsersPercent = parseFloat(
          (((current.newUsers.total - previous.newUsers.total) / previous.newUsers.total) * 100).toFixed(1)
        );
      } else if (current.newUsers.total > 0) {
        current.growth.newUsersPercent = 100;
      }
    }

    // Calculate averages
    const avgMonthlyRides = monthsCount > 0 ? Math.round(totalRides / monthsCount) : 0;
    const avgMonthlyRevenue = monthsCount > 0 ? parseFloat((totalRevenue / monthsCount).toFixed(2)) : 0;

    sendSuccess(res, {
      period: {
        months: monthsCount,
        startDate: startDate.toISOString(),
        endDate: now.toISOString()
      },
      summary: {
        totalRides: totalRides,
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalPlatformCommission: parseFloat(totalCommission.toFixed(2)),
        totalNewDrivers: totalNewDrivers,
        totalNewRiders: totalNewRiders,
        totalNewUsers: totalNewDrivers + totalNewRiders,
        avgMonthlyRides: avgMonthlyRides,
        avgMonthlyRevenue: avgMonthlyRevenue,
        currency: "GBP"
      },
      monthlyData: monthlyData
    }, "Monthly performance analytics retrieved successfully", 200);
  } catch (err) {
    console.error("Get monthly performance error:", err);
    sendError(res, "Failed to retrieve monthly performance analytics", 500);
  }
};
