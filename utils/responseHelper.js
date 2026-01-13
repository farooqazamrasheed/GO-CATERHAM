/**
 * Standardized API Response Helper
 * Provides consistent response format across all APIs
 */

const sendSuccess = (res, data = null, message = null, statusCode = 200) => {
  const response = {
    status: "success",
    timestamp: new Date().toISOString(),
  };

  if (message) response.message = message;
  if (data !== null) response.data = data;

  return res.status(statusCode).json(response);
};

const sendError = (res, message, statusCode = 400, errorCode = null) => {
  const response = {
    status: "error",
    message,
    timestamp: new Date().toISOString(),
  };

  if (errorCode) response.code = errorCode;

  return res.status(statusCode).json(response);
};

module.exports = {
  sendSuccess,
  sendError,
};
