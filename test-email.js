import { emailService } from './services/email.js';
import dotenv from 'dotenv';

dotenv.config();

async function testEmail() {
  console.log('🧪 Testing email configuration...\n');

  try {
    // Test connection
    console.log('📡 Testing SMTP connection...');
    const isConnected = await emailService.testConnection();
    
    if (!isConnected) {
      console.log('❌ SMTP connection failed. Check your credentials.');
      return;
    }

    console.log('✅ SMTP connection successful!');

    // Send test email
    console.log('📧 Sending test email...');
    
    const testOrderData = {
      customerName: 'Test Customer',
      orders: [{
        trackingId: 'SEO-TEST-001',
        serviceName: 'Monthly SEO Packages',
        serviceTierName: 'Standard Monthly',
        totalAmount: '450.00',
        deliveryDays: 30
      }],
      totalAmount: 450.00,
      website: 'https://example.com',
      orderCount: 1
    };

    await emailService.sendMultipleOrderConfirmation(
      process.env.SMTP_USER, // Send to yourself for testing
      testOrderData
    );

    console.log('✅ Test email sent successfully!');
    console.log(`📬 Check your inbox: ${process.env.SMTP_USER}`);

  } catch (error) {
    console.error('❌ Email test failed:', error.message);
    
    if (error.code === 'EAUTH') {
      console.log('\n💡 Authentication failed. Check:');
      console.log('   - SMTP_USER is correct');
      console.log('   - SMTP_PASS is your App Password (not regular password)');
      console.log('   - 2FA is enabled on your Gmail account');
    }
  }
}

testEmail();