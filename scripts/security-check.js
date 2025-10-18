#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function runSecurityCheck() {
  console.log('🔒 Running Security Check...\n');

  const issues = [];
  const warnings = [];
  const passed = [];

  // Check 1: Environment Variables
  console.log('1. Checking environment variables...');
  
  const requiredEnvVars = [
    'JWT_SECRET',
    'DB_PASSWORD',
    'SMTP_PASS',
    'STRIPE_SECRET_KEY'
  ];

  requiredEnvVars.forEach(envVar => {
    const value = process.env[envVar];
    if (!value || value.includes('your-') || value.includes('change-this')) {
      issues.push(`❌ ${envVar} is not set or using default value`);
    } else if (envVar === 'JWT_SECRET' && value.length < 32) {
      warnings.push(`⚠️  ${envVar} should be at least 32 characters long`);
    } else {
      passed.push(`✅ ${envVar} is properly configured`);
    }
  });

  // Check 2: Production Mode
  console.log('\n2. Checking production configuration...');
  
  if (process.env.NODE_ENV !== 'production') {
    warnings.push('⚠️  NODE_ENV is not set to production');
  } else {
    passed.push('✅ NODE_ENV is set to production');
  }

  // Check 3: SSL Configuration
  console.log('\n3. Checking SSL configuration...');
  
  const frontendUrl = process.env.FRONTEND_URL;
  const adminUrl = process.env.ADMIN_URL;
  
  if (!frontendUrl?.startsWith('https://')) {
    warnings.push('⚠️  FRONTEND_URL should use HTTPS in production');
  } else {
    passed.push('✅ FRONTEND_URL uses HTTPS');
  }
  
  if (!adminUrl?.startsWith('https://')) {
    warnings.push('⚠️  ADMIN_URL should use HTTPS in production');
  } else {
    passed.push('✅ ADMIN_URL uses HTTPS');
  }

  // Check 4: File Permissions
  console.log('\n4. Checking file permissions...');
  
  const envPath = path.join(__dirname, '../.env');
  try {
    const stats = fs.statSync(envPath);
    const mode = (stats.mode & parseInt('777', 8)).toString(8);
    
    if (mode !== '600') {
      warnings.push(`⚠️  .env file permissions are ${mode}, should be 600 for security`);
    } else {
      passed.push('✅ .env file has secure permissions (600)');
    }
  } catch (error) {
    issues.push('❌ Could not check .env file permissions');
  }

  // Check 5: Default Passwords
  console.log('\n5. Checking for default passwords...');
  
  const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD;
  if (defaultPassword === 'admin123' || defaultPassword === 'password') {
    issues.push('❌ Default admin password is still set to a weak value');
  } else {
    passed.push('✅ Default admin password has been changed');
  }

  // Check 6: Database Security
  console.log('\n6. Checking database configuration...');
  
  const dbPassword = process.env.DB_PASSWORD;
  if (!dbPassword || dbPassword === 'root' || dbPassword === 'password') {
    issues.push('❌ Database password is weak or default');
  } else if (dbPassword.length < 8) {
    warnings.push('⚠️  Database password should be at least 8 characters');
  } else {
    passed.push('✅ Database password is configured');
  }

  // Check 7: Payment Configuration
  console.log('\n7. Checking payment security...');
  
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey?.startsWith('sk_test_') && process.env.NODE_ENV === 'production') {
    warnings.push('⚠️  Using Stripe test keys in production environment');
  } else if (stripeKey?.startsWith('sk_live_')) {
    passed.push('✅ Using Stripe live keys');
  }

  // Results Summary
  console.log('\n' + '='.repeat(50));
  console.log('🔒 SECURITY CHECK RESULTS');
  console.log('='.repeat(50));

  if (passed.length > 0) {
    console.log('\n✅ PASSED CHECKS:');
    passed.forEach(item => console.log(`   ${item}`));
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warnings.forEach(item => console.log(`   ${item}`));
  }

  if (issues.length > 0) {
    console.log('\n❌ CRITICAL ISSUES:');
    issues.forEach(item => console.log(`   ${item}`));
  }

  console.log('\n' + '='.repeat(50));
  
  if (issues.length === 0 && warnings.length === 0) {
    console.log('🎉 ALL SECURITY CHECKS PASSED!');
    console.log('Your application is ready for production deployment.');
  } else if (issues.length === 0) {
    console.log('✅ No critical issues found.');
    console.log('⚠️  Please review warnings before production deployment.');
  } else {
    console.log('❌ CRITICAL ISSUES FOUND!');
    console.log('Please fix all critical issues before deploying to production.');
    process.exit(1);
  }

  console.log('\n📋 Next steps:');
  console.log('1. Fix any critical issues listed above');
  console.log('2. Review and address warnings');
  console.log('3. Set up SSL certificate');
  console.log('4. Configure firewall rules');
  console.log('5. Set up monitoring and logging');
  console.log('6. Run penetration testing');
  console.log('\nSee PRODUCTION_SECURITY_CHECKLIST.md for complete deployment guide.');
}

runSecurityCheck();