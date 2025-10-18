#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const API_BASE_URL = process.env.FRONTEND_URL || 'http://localhost:3005';

async function testOrderWithEmail() {
  console.log('🧪 Testing Order Creation with Email Confirmation...\n');

  try {
    // Test order data
    const testOrderData = {
      cart: [
        {
          serviceId: 1, // Assuming service tier ID 1 exists
          quantity: 1,
          title: 'SEO Audit - Basic'
        }
      ],
      customer: {
        name: 'Test Customer',
        email: process.env.SMTP_USER || 'test@example.com', // Send to your own email
        website: 'https://example.com',
        notes: 'This is a test order to verify email functionality'
      }
    };

    console.log('📦 Creating test order...');
    console.log(`   Customer: ${testOrderData.customer.name}`);
    console.log(`   Email: ${testOrderData.customer.email}`);
    console.log(`   Website: ${testOrderData.customer.website}`);
    console.log(`   Cart items: ${testOrderData.cart.length}\n`);

    // Make API request to create test order
    const response = await axios.post(`${API_BASE_URL}/api/orders/test-order`, testOrderData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success) {
      console.log('✅ Test order created successfully!');
      console.log(`   Orders created: ${response.data.data.orderCount}`);
      console.log(`   Total amount: ${response.data.data.totalAmount}`);
      console.log(`   Tracking ID: ${response.data.data.trackingId}`);
      console.log(`   Customer email: ${response.data.data.customerEmail}\n`);

      console.log('📧 Order confirmation email should be sent to:', response.data.data.customerEmail);
      console.log('\n🎉 Test completed successfully!');
      console.log('\n📋 Check your email inbox for the order confirmation.');
      console.log('   If you don\'t receive it, check:');
      console.log('   1. Spam/junk folder');
      console.log('   2. Server logs for email errors');
      console.log('   3. Email configuration in server/.env');

    } else {
      console.log('❌ Test order failed:', response.data.message);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Response:', error.response.data);
    }
    
    console.log('\n💡 Make sure:');
    console.log('   1. Server is running (npm run dev)');
    console.log('   2. Database is connected');
    console.log('   3. Service tiers exist in database');
    console.log('   4. Email configuration is correct');
  }
}

// Run the test
testOrderWithEmail();