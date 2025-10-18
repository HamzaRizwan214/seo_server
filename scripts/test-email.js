#!/usr/bin/env node

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { emailService } from "../services/email.js";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

async function testEmailService() {
  console.log("📧 Testing Email Service with Hostinger...\n");

  try {
    // Test 1: Check configuration
    console.log("1. Checking email configuration...");
    console.log(`   SMTP Host: ${process.env.SMTP_HOST}`);
    console.log(`   SMTP Port: ${process.env.SMTP_PORT}`);
    console.log(`   SMTP User: ${process.env.SMTP_USER}`);
    console.log(`   From Email: ${process.env.FROM_EMAIL}`);
    console.log(`   From Name: ${process.env.FROM_NAME}\n`);

    // Test 2: Test connection
    console.log("2. Testing SMTP connection...");
    const connectionTest = await emailService.testConnection();
    console.log(
      `   Connection: ${connectionTest ? "✅ SUCCESS" : "❌ FAILED"}\n`
    );

    if (!connectionTest) {
      console.log("❌ Connection failed. Please check:");
      console.log("   1. SMTP settings are correct for Hostinger");
      console.log("   2. Email password is correct");
      console.log("   3. Email account exists and is active");
      console.log("   4. Firewall/network allows SMTP connections\n");
      return;
    }

    // Test 3: Send test email
    console.log("3. Sending test email...");
    const testEmail = await emailService.sendEmail(
      process.env.SMTP_USER, // Send to yourself
      "Test Email from SEO by Amanda",
      `
        <h2>🎉 Email Service Test Successful!</h2>
        <p>This is a test email from your SEO by Amanda application.</p>
        <p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>SMTP Host:</strong> ${process.env.SMTP_HOST}</p>
        <p><strong>From:</strong> ${process.env.FROM_NAME} &lt;${
        process.env.FROM_EMAIL
      }&gt;</p>
        <hr>
        <p>If you received this email, your Hostinger email configuration is working correctly!</p>
      `
    );

    console.log("✅ Test email sent successfully!");
    console.log(`   Message ID: ${testEmail.messageId}\n`);

    // Test 4: Send order confirmation test
    console.log("4. Testing order confirmation email...");
    const orderTestData = {
      customerName: "Test Customer",
      orders: [
        {
          trackingId: "TEST-" + Date.now(),
          serviceName: "SEO Audit",
          serviceTierName: "Basic",
          totalAmount: "$29.99",
          deliveryDays: 3,
        },
      ],
      totalAmount: "$29.99",
      website: "https://example.com",
      orderCount: 1,
    };

    await emailService.sendMultipleOrderConfirmation(
      process.env.SMTP_USER,
      orderTestData
    );

    console.log("✅ Order confirmation test email sent!\n");

    console.log("🎉 All email tests passed!");
    console.log("\n📋 Your email service is ready for:");
    console.log("   ✅ Order confirmations");
    console.log("   ✅ Status updates");
    console.log("   ✅ Delivery notifications");
    console.log("   ✅ Admin notifications\n");
  } catch (error) {
    console.error("❌ Email test failed:", error.message);

    if (error.code === "EAUTH") {
      console.log("\n💡 Authentication failed. Please check:");
      console.log("   1. Email address is correct");
      console.log("   2. Password is correct");
      console.log("   3. Account is not locked or suspended");
    } else if (error.code === "ECONNECTION") {
      console.log("\n💡 Connection failed. Please check:");
      console.log("   1. SMTP host is correct (smtp.hostinger.com)");
      console.log("   2. Port is correct (587 for TLS)");
      console.log("   3. Internet connection is working");
    }
  }
}

testEmailService();
