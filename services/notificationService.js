const nodemailer = require("../utils/sendEmail");

/**
 * Notification Service - Handles push notifications via email and SMS
 */
class NotificationService {
  constructor() {
    // In production, integrate with services like Firebase, OneSignal, or Twilio
    this.emailEnabled = process.env.EMAIL_ENABLED === "true";
    this.smsEnabled = process.env.SMS_ENABLED === "true";
  }

  /**
   * Send ride request notification to driver
   * @param {Object} driver - Driver user object
   * @param {Object} rideData - Ride details
   */
  async sendRideRequestNotification(driver, rideData) {
    const subject = "New Ride Request - GO-CATERHAM";
    const message = `
      Hi ${driver.fullName},

      You have a new ride request!

      Pickup: ${rideData.pickup?.address || "N/A"}
      Dropoff: ${rideData.dropoff?.address || "N/A"}
      Estimated Fare: £${rideData.estimatedFare || "N/A"}
      Vehicle Type: ${rideData.vehicleType || "N/A"}

      Please respond within 15 seconds to accept this ride.

      Best regards,
      GO-CATERHAM Team
    `;

    await this.sendEmail(driver.email, subject, message);
    // TODO: Send SMS if enabled
  }

  /**
   * Send ride accepted notification to rider
   * @param {Object} rider - Rider user object
   * @param {Object} driver - Driver details
   * @param {Object} rideData - Ride details
   */
  async sendRideAcceptedNotification(rider, driver, rideData) {
    const subject = "Ride Accepted - GO-CATERHAM";
    const message = `
      Hi ${rider.fullName},

      Great news! Your ride has been accepted.

      Driver: ${driver.user?.fullName || "Unknown Driver"}
      Vehicle: ${driver.vehicle?.make} ${driver.vehicle?.model} (${
      driver.vehicle?.color
    })
      Plate: ${driver.vehicle?.plateNumber}
      Phone: ${driver.user?.phone}

      Your driver will arrive shortly. You can track them in real-time.

      Safe travels!
      GO-CATERHAM Team
    `;

    await this.sendEmail(rider.email, subject, message);
    // TODO: Send SMS if enabled
  }

  /**
   * Send ride completed notification
   * @param {Object} rider - Rider user object
   * @param {Object} rideData - Ride details
   */
  async sendRideCompletedNotification(rider, rideData) {
    const subject = "Ride Completed - GO-CATERHAM";
    const message = `
      Hi ${rider.fullName},

      Your ride has been completed successfully!

      Final Fare: £${rideData.fare || rideData.estimatedFare}
      Distance: ${rideData.actualDistance || rideData.estimatedDistance} miles
      Duration: ${rideData.actualDuration || rideData.estimatedDuration} minutes

      Thank you for choosing GO-CATERHAM. Please rate your experience and consider adding a tip for your driver.

      Best regards,
      GO-CATERHAM Team
    `;

    await this.sendEmail(rider.email, subject, message);
    // TODO: Send SMS if enabled
  }

  /**
   * Send ride cancelled notification
   * @param {Object} user - User object (rider or driver)
   * @param {Object} rideData - Ride details
   * @param {string} reason - Cancellation reason
   */
  async sendRideCancelledNotification(user, rideData, reason) {
    const subject = "Ride Cancelled - GO-CATERHAM";
    const message = `
      Hi ${user.fullName},

      Your ride has been cancelled.

      Reason: ${reason}
      Ride ID: ${rideData._id}

      ${
        rideData.cancellationFee
          ? `Cancellation Fee: £${rideData.cancellationFee}`
          : ""
      }

      If you have any questions, please contact our support team.

      Best regards,
      GO-CATERHAM Team
    `;

    await this.sendEmail(user.email, subject, message);
    // TODO: Send SMS if enabled
  }

  /**
   * Send tip received notification to driver
   * @param {Object} driver - Driver user object
   * @param {Object} rideData - Ride details
   * @param {number} tipAmount - Tip amount
   * @param {string} riderName - Rider name
   */
  async sendTipReceivedNotification(driver, rideData, tipAmount, riderName) {
    const subject = "Tip Received - GO-CATERHAM";
    const message = `
      Hi ${driver.fullName},

      Congratulations! You received a £${tipAmount} tip from ${riderName} for ride ${
      rideData._id
    }.

      Your total earnings for this ride: £${rideData.driverEarnings || 0}

      Keep up the great service!

      Best regards,
      GO-CATERHAM Team
    `;

    await this.sendEmail(driver.email, subject, message);
    // TODO: Send SMS if enabled
  }

  /**
   * Send rating received notification
   * @param {Object} recipient - User who received the rating
   * @param {Object} rideData - Ride details
   * @param {number} rating - Rating (1-5)
   * @param {string} raterName - Name of person who gave rating
   * @param {string} type - 'rider' or 'driver'
   */
  async sendRatingReceivedNotification(
    recipient,
    rideData,
    rating,
    raterName,
    type
  ) {
    const subject = `${
      type === "rider" ? "Driver" : "Rider"
    } Rating Received - GO-CATERHAM`;
    const message = `
      Hi ${recipient.fullName},

      ${raterName} rated your service ${rating} star${
      rating > 1 ? "s" : ""
    } for ride ${rideData._id}.

      Your updated rating: ${recipient.rating || 5.0}/5.0

      Thank you for being part of the GO-CATERHAM community!

      Best regards,
      GO-CATERHAM Team
    `;

    await this.sendEmail(recipient.email, subject, message);
    // TODO: Send SMS if enabled
  }

  /**
   * Send email notification
   * @param {string} email - Recipient email
   * @param {string} subject - Email subject
   * @param {string} message - Email message
   */
  async sendEmail(email, subject, message) {
    if (!this.emailEnabled) {
      console.log("Email notifications disabled, skipping:", subject);
      return;
    }

    try {
      await nodemailer.sendEmail(email, subject, message);
      console.log(`Email sent to ${email}: ${subject}`);
    } catch (error) {
      console.error("Failed to send email notification:", error);
    }
  }

  /**
   * Send SMS notification (placeholder for future implementation)
   * @param {string} phone - Recipient phone
   * @param {string} message - SMS message
   */
  async sendSMS(phone, message) {
    if (!this.smsEnabled) {
      console.log("SMS notifications disabled, skipping");
      return;
    }

    // TODO: Integrate with SMS service like Twilio
    console.log(`SMS to ${phone}: ${message}`);
  }

  /**
   * Send welcome email to new users
   * @param {Object} user - User object
   * @param {string} role - User role
   */
  async sendWelcomeEmail(user, role) {
    const subject = `Welcome to GO-CATERHAM - ${
      role.charAt(0).toUpperCase() + role.slice(1)
    } Account`;
    const message = `
      Hi ${user.fullName},

      Welcome to GO-CATERHAM! Your ${role} account has been created successfully.

      ${
        role === "rider"
          ? "You can now book rides and enjoy our services."
          : "Please complete your document verification to start accepting rides."
      }

      If you have any questions, feel free to contact our support team.

      Safe travels!
      GO-CATERHAM Team
    `;

    await this.sendEmail(user.email, subject, message);
  }

  /**
   * Send admin message to driver
   * @param {Object} driver - Driver user object
   * @param {string} message - Custom message from admin
   */
  async sendAdminMessageToDriver(driver, message) {
    const subject = "Message from Admin - GO-CATERHAM";
    const emailMessage = `
      Hi ${driver.fullName},

      You have received a message from the GO-CATERHAM admin team:

      ---
      ${message}
      ---

      If you have any questions, please contact our support team.

      Best regards,
      GO-CATERHAM Team
    `;

    await this.sendEmail(driver.email, subject, emailMessage);
  }

  /**
   * Send driver approval notification
   * @param {Object} driver - Driver user object
   */
  async sendDriverApprovedNotification(driver) {
    const subject = "Driver Account Approved - GO-CATERHAM";
    const message = `
      Hi ${driver.fullName},

      Congratulations! Your driver account has been approved and you can now start accepting rides.

      Please ensure your app is updated and you're online to receive ride requests.

      Welcome to the GO-CATERHAM driver community!

      Best regards,
      GO-CATERHAM Team
    `;

    await this.sendEmail(driver.email, subject, message);
  }
}

// Create singleton instance
const notificationService = new NotificationService();

module.exports = notificationService;
