#!/usr/bin/env node

import dotenv from 'dotenv';
import { stripeService } from '../services/stripe.js';

// Load environment variables from the server directory
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from the server root directory
dotenv.config({ path: path.join(__dirname, '../.env') });

async function testStripeIntegration() {
  console.log('🧪 Testing Stripe Integration...\n');

  // Check if environment variables are set
  console.log('0. Checking environment variables...');
  console.log(`   Environment file path: ${path.join(__dirname, '../.env')}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
  
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  
  if (!secretKey || secretKey === 'sk_test_your_actual_secret_key_here') {
    console.log('❌ STRIPE_SECRET_KEY not set or using placeholder value');
    console.log('   Please update your server/.env file with your actual Stripe secret key');
    console.log('   Get it from: https://dashboard.stripe.com/apikeys\n');
    process.exit(1);
  }
  
  if (!publishableKey || publishableKey === 'pk_test_your_actual_publishable_key_here') {
    console.log('⚠️  STRIPE_PUBLISHABLE_KEY not set or using placeholder value');
    console.log('   Please update your server/.env file with your actual Stripe publishable key');
  }
  
  console.log(`   ✅ Secret key found: ${secretKey.substring(0, 12)}...`);
  console.log(`   ✅ Publishable key found: ${publishableKey ? publishableKey.substring(0, 12) + '...' : 'Not set'}\n`);

  try {
    // Test 1: Connection
    console.log('1. Testing Stripe connection...');
    const isConnected = await stripeService.testConnection();
    console.log(`   ${isConnected ? '✅' : '❌'} Connection: ${isConnected ? 'SUCCESS' : 'FAILED'}\n`);

    if (!isConnected) {
      console.log('❌ Stripe connection failed. Possible issues:');
      console.log('   1. Invalid API key format');
      console.log('   2. Network connectivity issues');
      console.log('   3. Stripe service temporarily unavailable');
      console.log('\n💡 Make sure your API key:');
      console.log('   - Starts with sk_test_ (for test mode) or sk_live_ (for live mode)');
      console.log('   - Is copied correctly from https://dashboard.stripe.com/apikeys');
      console.log('   - Has no extra spaces or characters\n');
      process.exit(1);
    }

    // Test 2: Create Payment Intent
    console.log('2. Testing payment intent creation...');
    const paymentIntent = await stripeService.createPaymentIntent({
      amount: 2999, // $29.99
      currency: 'usd',
      metadata: {
        test: 'true',
        service: 'SEO Audit'
      }
    });
    
    console.log(`   ✅ Payment Intent ID: ${paymentIntent.id}`);
    console.log(`   ✅ Amount: $${(paymentIntent.amount / 100).toFixed(2)}`);
    console.log(`   ✅ Status: ${paymentIntent.status}\n`);

    // Test 3: Retrieve Payment Intent
    console.log('3. Testing payment intent retrieval...');
    const retrieved = await stripeService.getPaymentIntent(paymentIntent.id);
    console.log(`   ✅ Retrieved ID: ${retrieved.id}`);
    console.log(`   ✅ Status: ${retrieved.status}\n`);

    console.log('🎉 All Stripe tests passed!\n');
    console.log('📋 Next steps:');
    console.log('   1. Replace test keys with your actual Stripe keys');
    console.log('   2. Test with real card numbers in development');
    console.log('   3. Set up webhook endpoint in Stripe dashboard');
    console.log('   4. Test the full payment flow in the application\n');

  } catch (error) {
    console.error('❌ Stripe test failed:', error.message);
    
    if (error.message.includes('Invalid API Key')) {
      console.log('\n💡 Tip: Make sure you have valid Stripe API keys in your .env file');
      console.log('   Get them from: https://dashboard.stripe.com/apikeys');
    }
    
    process.exit(1);
  }
}

// Run the test
testStripeIntegration();