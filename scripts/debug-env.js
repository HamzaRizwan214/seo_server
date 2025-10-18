#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.join(__dirname, '../.env');
console.log(`Loading .env from: ${envPath}`);

dotenv.config({ path: envPath });

console.log('\n🔍 Environment Variables Debug:');
console.log('================================');
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`PORT: ${process.env.PORT || 'not set'}`);
console.log(`STRIPE_SECRET_KEY: ${process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0, 12) + '...' : 'not set'}`);
console.log(`STRIPE_PUBLISHABLE_KEY: ${process.env.STRIPE_PUBLISHABLE_KEY ? process.env.STRIPE_PUBLISHABLE_KEY.substring(0, 12) + '...' : 'not set'}`);
console.log(`PAYPAL_CLIENT_ID: ${process.env.PAYPAL_CLIENT_ID ? process.env.PAYPAL_CLIENT_ID.substring(0, 12) + '...' : 'not set'}`);

// Check if .env file exists
import fs from 'fs';
const envExists = fs.existsSync(envPath);
console.log(`\n.env file exists: ${envExists}`);

if (envExists) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const hasStripeSecret = envContent.includes('STRIPE_SECRET_KEY=');
  const hasStripePublishable = envContent.includes('STRIPE_PUBLISHABLE_KEY=');
  
  console.log(`Contains STRIPE_SECRET_KEY: ${hasStripeSecret}`);
  console.log(`Contains STRIPE_PUBLISHABLE_KEY: ${hasStripePublishable}`);
}