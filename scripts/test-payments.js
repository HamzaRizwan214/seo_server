#!/usr/bin/env node

import axios from 'axios';

const API_BASE = 'http://localhost:3005/api';

async function testPayments() {
  console.log('🧪 Testing Payment Gateways...\n');

  const testOrder = {
    cart: [
      {
        serviceId: 1,
        quantity: 1,
        title: 'SEO Audit'
      }
    ],
    customer: {
      name: 'Test Customer',
      email: 'test@example.com',
      website: 'https://example.com',
      notes: 'Payment gateway test'
    }
  };

  try {
    // Test 1: Create Stripe Payment Intent
    console.log('1. Testing Stripe Payment Intent Creation...');
    const stripeResponse = await axios.post(`${API_BASE}/orders/create-payment-intent`, testOrder);
    console.log('✅ Stripe Payment Intent:', stripeResponse.data.data.clientSecret.substring(0, 20) + '...');

    // Test 2: Test Order (simulates successful payment)
    console.log('\n2. Testing Order Creation...');
    const orderResponse = await axios.post(`${API_BASE}/orders/test-order`, testOrder);
    console.log('✅ Test Order Created:', orderResponse.data.data.trackingId);

    console.log('\n🎉 Payment gateway tests completed!');
    console.log('\nNext: Test the full UI flow at http://localhost:3000/checkout');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testPayments();