const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const checkPermission = require("../middlewares/permission");

const documentController = require("../controllers/documentController");

// All routes require authentication
router.use(auth);

// Upload driver documents - drivers can upload their own, admins can upload for any driver
router.post(
  "/driver/:driverId/upload",
  checkPermission("upload_documents"),
  ...documentController.uploadDriverDocuments
);

// Get driver documents status - drivers can view their own, admins can view any
router.get(
  "/driver/:driverId",
  checkPermission("view_documents"),
  documentController.getDriverDocuments
);

// Delete specific document - drivers can delete their own, admins can delete any
router.delete(
  "/driver/:driverId/:documentType",
  checkPermission("delete_documents"),
  documentController.deleteDriverDocument
);

module.exports = router;
