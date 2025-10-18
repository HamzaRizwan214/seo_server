#!/usr/bin/env node

import axios from 'axios';

const API_BASE_URL = 'http://localhost:3005';

async function simpleTestOrder() {
  console.log('🧪 Simple Test Order Creation...\n');

  try {
    const testData = {
      cart: [
        {
          serviceId: 1, // Make sure this service tier exists
          quantity: 1,
          title: 'Test Service'
        }
      ],
      customer: {
        name: 'Test Customer',
        email: 'test@example.com',
        website: 'https://example.com',
        notes: 'Test order'
      }
    };

    console.log('📦 Sending test order request...');
    
    const response = await axios.post(`${API_BASE_URL}/api/orders/test-order`, testData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    console.log('✅ Response received:', response.data);

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', error.response.data);
    }
  }
}

simpleTestOrder();