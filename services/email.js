import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  async initializeTransporter() {
    try {
      // If no SMTP credentials provided, use Ethereal for testing
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log("📧 No SMTP credentials found, creating test account...");
        const testAccount = await nodemailer.createTestAccount();

        this.transporter = nodemailer.createTransport({
          host: "smtp.ethereal.email",
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });

        console.log("✅ Email service initialized with test account");
        console.log(
          `📧 Test email credentials: ${testAccount.user} / ${testAccount.pass}`
        );
        console.log("🌐 View emails at: https://ethereal.email/");
        return;
      }

      // Use provided SMTP credentials with enhanced settings for Hostinger
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === "true", // false for 587, true for 465
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        tls: {
          rejectUnauthorized: false, // Accept self-signed certificates
        },
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 60000,
        debug: process.env.NODE_ENV === "development", // Enable debug in development
      });

      console.log("✅ Email service initialized with provided credentials");
    } catch (error) {
      console.error("❌ Email service initialization failed:", error);
    }
  }

  async sendEmail(to, subject, html, attachments = []) {
    try {
      if (!this.transporter) {
        throw new Error("Email transporter not initialized");
      }

      const mailOptions = {
        from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
        to,
        subject,
        html,
        attachments,
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log("✅ Email sent successfully:", {
        to,
        subject,
        messageId: result.messageId,
      });

      // If using Ethereal (test), show preview URL
      if (result.messageId && process.env.SMTP_HOST !== "smtp.gmail.com") {
        const previewUrl = nodemailer.getTestMessageUrl(result);
        if (previewUrl) {
          console.log("📧 Preview email: " + previewUrl);
        }
      }

      return result;
    } catch (error) {
      console.error("❌ Email sending failed:", error);
      throw error;
    }
  }

  async sendOrderConfirmation(customerEmail, orderData) {
    const { customerName, orders, totalAmount, website, orderCount } =
      orderData;

    // For single order, use the tracking ID, for multiple orders, use a summary
    const subject =
      orderCount === 1
        ? `Order Confirmation - ${orders[0].trackingId}`
        : `Order Confirmation - ${orderCount} Orders`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Confirmation</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #3b82f6; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .order-details { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
          .footer { text-align: center; padding: 20px; color: #666; }
          .tracking-id { font-size: 24px; font-weight: bold; color: #3b82f6; }
          .amount { font-size: 20px; font-weight: bold; color: #059669; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Order Confirmation</h1>
            <p>Thank you for choosing SEO by Amanda!</p>
          </div>
          
          <div class="content">
            <h2>Hello ${customerName},</h2>
            <p>We've received your order and payment successfully. Here are your order details:</p>
            
            <div class="order-details">
              <h3>Order Information</h3>
              <p><strong>Tracking ID:</strong> <span class="tracking-id">${trackingId}</span></p>
              <p><strong>Service:</strong> ${serviceName}</p>
              <p><strong>Website:</strong> ${website}</p>
              <p><strong>Keywords:</strong> ${keywords}</p>
              <p><strong>Total Amount:</strong> <span class="amount">$${totalAmount}</span></p>
            </div>
            
            <h3>What's Next?</h3>
            <ul>
              <li>Our SEO experts will begin working on your project within 24 hours</li>
              <li>You'll receive regular updates on your order status</li>
              <li>Completed work will be delivered via email with detailed reports</li>
              <li>You can track your order status using the tracking ID above</li>
            </ul>
            
            <p>If you have any questions, please don't hesitate to contact us.</p>
          </div>
          
          <div class="footer">
            <p>Best regards,<br>SEO by Amanda Team</p>
            <p>Email: ${process.env.FROM_EMAIL}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(customerEmail, subject, html);
  }

  async sendMultipleOrderConfirmation(customerEmail, orderData) {
    const { customerName, orders, totalAmount, website, orderCount } =
      orderData;

    const subject =
      orderCount === 1
        ? `Order Confirmation - ${orders[0].trackingId}`
        : `Order Confirmation - ${orderCount} Orders`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Confirmation</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #3b82f6; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .order-details { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
          .footer { text-align: center; padding: 20px; color: #666; }
          .total-amount { font-size: 24px; font-weight: bold; color: #059669; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Order Confirmation</h1>
            <p>Thank you for choosing SEO by Amanda!</p>
          </div>
          
          <div class="content">
            <h2>Hello ${customerName},</h2>
            <p>We've received your ${
              orderCount === 1 ? "order" : `${orderCount} orders`
            } and payment successfully. Here are your order details:</p>
            
            <div class="order-details">
              <h3>Order Information</h3>
              <p><strong>Website:</strong> ${website}</p>
              <p><strong>Total Orders:</strong> ${orderCount}</p>
              <p><strong>Total Amount:</strong> <span class="total-amount">$${totalAmount}</span></p>
              
              <h4>Your Orders:</h4>
              ${orders
                .map(
                  (order) => `
                <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin: 10px 0;">
                  <p><strong>Tracking ID:</strong> <span style="color: #3b82f6; font-family: monospace; font-size: 16px;">${order.trackingId}</span></p>
                  <p><strong>Service:</strong> ${order.serviceName} - ${order.serviceTierName}</p>
                  <p><strong>Amount:</strong> <span style="color: #059669; font-weight: bold;">$${order.totalAmount}</span></p>
                  <p><strong>Delivery:</strong> ${order.deliveryDays} days</p>
                </div>
              `
                )
                .join("")}
            </div>
            
            <h3>What's Next?</h3>
            <ul>
              <li>Our SEO experts will begin working on your ${
                orderCount === 1 ? "project" : "projects"
              } within 24 hours</li>
              <li>You'll receive regular updates on your order status</li>
              <li>Completed work will be delivered via email with detailed reports</li>
              <li>You can track your order status using the tracking ${
                orderCount === 1 ? "ID" : "IDs"
              } above</li>
            </ul>
            
            <p>If you have any questions, please don't hesitate to contact us.</p>
          </div>
          
          <div class="footer">
            <p>Best regards,<br>SEO by Amanda Team</p>
            <p>Email: ${process.env.FROM_EMAIL}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(customerEmail, subject, html);
  }

  async sendStatusUpdate(customerEmail, orderData, newStatus, notes = "") {
    const { trackingId, customerName, serviceName } = orderData;

    const statusMessages = {
      confirmed: "Your order has been confirmed and is being prepared.",
      in_progress: "Our team is actively working on your SEO project.",
      completed:
        "Your SEO project has been completed! Check your email for deliverables.",
      cancelled:
        "Your order has been cancelled. If you have any questions, please contact us.",
    };

    const subject = `Order Update - ${trackingId} - ${newStatus
      .replace("_", " ")
      .toUpperCase()}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Status Update</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #3b82f6; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .status-update { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #3b82f6; }
          .footer { text-align: center; padding: 20px; color: #666; }
          .tracking-id { font-size: 18px; font-weight: bold; color: #3b82f6; }
          .status { font-size: 16px; font-weight: bold; color: #059669; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Order Status Update</h1>
          </div>
          
          <div class="content">
            <h2>Hello ${customerName},</h2>
            <p>We have an update on your SEO order:</p>
            
            <div class="status-update">
              <p><strong>Tracking ID:</strong> <span class="tracking-id">${trackingId}</span></p>
              <p><strong>Service:</strong> ${serviceName}</p>
              <p><strong>New Status:</strong> <span class="status">${newStatus.replace(
                "_",
                " "
              )}</span></p>
              
              <p><strong>Update:</strong> ${
                statusMessages[newStatus] ||
                "Your order status has been updated."
              }</p>
              
              ${
                notes
                  ? `<p><strong>Additional Notes:</strong> ${notes}</p>`
                  : ""
              }
            </div>
            
            <p>Thank you for choosing SEO by Amanda. We'll keep you updated on any further progress.</p>
          </div>
          
          <div class="footer">
            <p>Best regards,<br>SEO by Amanda Team</p>
            <p>Email: ${process.env.FROM_EMAIL}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(customerEmail, subject, html);
  }

  async sendDeliverable(customerEmail, orderData, attachments) {
    const { trackingId, customerName, serviceName } = orderData;

    const subject = `SEO Deliverables - ${trackingId} - ${serviceName}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SEO Deliverables</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #059669; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .deliverable-info { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
          .footer { text-align: center; padding: 20px; color: #666; }
          .tracking-id { font-size: 18px; font-weight: bold; color: #3b82f6; }
          .completed { font-size: 20px; font-weight: bold; color: #059669; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Your SEO Project is Complete!</h1>
          </div>
          
          <div class="content">
            <h2>Hello ${customerName},</h2>
            <p class="completed">Great news! Your SEO project has been completed.</p>
            
            <div class="deliverable-info">
              <p><strong>Tracking ID:</strong> <span class="tracking-id">${trackingId}</span></p>
              <p><strong>Service:</strong> ${serviceName}</p>
              <p><strong>Deliverables:</strong> Please find your SEO analysis and recommendations in the attached files.</p>
              
              <h3>What's Included:</h3>
              <ul>
                <li>Comprehensive SEO audit report</li>
                <li>Keyword analysis and recommendations</li>
                <li>Technical SEO findings</li>
                <li>Action plan for improvements</li>
                <li>Performance metrics and benchmarks</li>
              </ul>
            </div>
            
            <p><strong>Next Steps:</strong></p>
            <ul>
              <li>Review the attached reports carefully</li>
              <li>Implement the recommended changes</li>
              <li>Monitor your website's performance</li>
              <li>Contact us if you need clarification on any recommendations</li>
            </ul>
            
            <p>Thank you for choosing SEO by Amanda. We hope our analysis helps improve your website's search engine performance!</p>
          </div>
          
          <div class="footer">
            <p>Best regards,<br>SEO by Amanda Team</p>
            <p>Email: ${process.env.FROM_EMAIL}</p>
            <p>Need help? Reply to this email or contact us anytime.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(customerEmail, subject, html, attachments);
  }

  async sendDeliveryEmail(customerEmail, orderData, attachment) {
    const { trackingId, customerName, serviceName, message } = orderData;

    const subject = `Order Delivered - ${trackingId} - ${serviceName}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Order Delivered</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #059669; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .delivery-info { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #059669; }
          .footer { text-align: center; padding: 20px; color: #666; }
          .tracking-id { font-size: 18px; font-weight: bold; color: #3b82f6; }
          .delivered { font-size: 20px; font-weight: bold; color: #059669; }
          .message-box { background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Your Order Has Been Delivered!</h1>
          </div>
          
          <div class="content">
            <h2>Hello ${customerName},</h2>
            <p class="delivered">Great news! Your SEO project has been completed and delivered.</p>
            
            <div class="delivery-info">
              <p><strong>Tracking ID:</strong> <span class="tracking-id">${trackingId}</span></p>
              <p><strong>Service:</strong> ${serviceName}</p>
              <p><strong>Delivery Date:</strong> ${new Date().toLocaleDateString()}</p>
              
              <div class="message-box">
                <h4>Message from our team:</h4>
                <p>${message}</p>
              </div>
              
              <p><strong>Deliverables:</strong> Please find your completed work in the attached Excel file.</p>
            </div>
            
            <p><strong>What's Next:</strong></p>
            <ul>
              <li>Download and review the attached Excel file</li>
              <li>Implement the recommendations provided</li>
              <li>Monitor your website's performance improvements</li>
              <li>Contact us if you have any questions about the deliverables</li>
            </ul>
            
            <p>Thank you for choosing SEO by Amanda. We hope our work helps boost your website's search engine performance!</p>
            
            <p><strong>Need Support?</strong> Simply reply to this email if you have any questions or need clarification on the delivered work.</p>
          </div>
          
          <div class="footer">
            <p>Best regards,<br>SEO by Amanda Team</p>
            <p>Email: ${process.env.FROM_EMAIL}</p>
            <p>🌟 We'd love your feedback! Let us know how we did.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const attachments = [
      {
        filename: attachment.filename,
        content: attachment.content,
      },
    ];

    return this.sendEmail(customerEmail, subject, html, attachments);
  }

  async testConnection() {
    try {
      await this.transporter.verify();
      console.log("✅ Email service connection verified");
      return true;
    } catch (error) {
      console.error("❌ Email service connection failed:", error);
      return false;
    }
  }
}

export const emailService = new EmailService();
export default EmailService;
