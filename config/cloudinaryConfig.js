const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage for driver documents
const documentStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "go-caterham/documents",
    allowed_formats: ["jpg", "jpeg", "png", "pdf"],
    transformation: [{ quality: "auto" }],
  },
});

// Storage for profile pictures
const profileStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "go-caterham/profiles",
    allowed_formats: ["jpg", "jpeg", "png"],
    transformation: [{ width: 500, height: 500, crop: "limit", quality: "auto" }],
  },
});

// Storage for vehicle photos
const vehicleStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "go-caterham/vehicles",
    allowed_formats: ["jpg", "jpeg", "png"],
    transformation: [{ quality: "auto" }],
  },
});

// General storage for any uploads
const generalStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "go-caterham/uploads",
    allowed_formats: ["jpg", "jpeg", "png", "pdf"],
  },
});

module.exports = {
  cloudinary,
  documentStorage,
  profileStorage,
  vehicleStorage,
  generalStorage,
};
