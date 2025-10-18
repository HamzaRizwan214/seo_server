import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

async function createAdminUser() {
  console.log('👤 Creating admin user...\n');

  try {
    const email = process.env.DEFAULT_ADMIN_EMAIL || 'admin@seobyamanda.com';
    const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const name = process.env.DEFAULT_ADMIN_NAME || 'Admin User';

    // Check if admin already exists
    const existingAdmin = await query(
      'SELECT id, email FROM admin_users WHERE email = $1',
      [email]
    );

    if (existingAdmin.rows.length > 0) {
      console.log('ℹ️  Admin user already exists:');
      console.log(`   📧 Email: ${existingAdmin.rows[0].email}`);
      console.log(`   🆔 ID: ${existingAdmin.rows[0].id}`);
      console.log('\n💡 To reset password, delete the user and run this script again.');
      return;
    }

    // Store plain text password (no hashing)
    console.log('💾 Creating admin user in database...');
    const result = await query(
      'INSERT INTO admin_users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, created_at',
      [email, password, name, 'admin']
    );

    const admin = result.rows[0];

    console.log('✅ Admin user created successfully!\n');
    console.log('📋 Admin Details:');
    console.log(`   🆔 ID: ${admin.id}`);
    console.log(`   👤 Name: ${admin.name}`);
    console.log(`   📧 Email: ${admin.email}`);
    console.log(`   🔑 Password: ${password}`);
    console.log(`   👑 Role: ${admin.role}`);
    console.log(`   📅 Created: ${admin.created_at}`);

    console.log('\n🚨 IMPORTANT SECURITY NOTICE:');
    console.log('   ⚠️  Change the default password immediately after first login!');
    console.log('   🔒 Use a strong, unique password for production environments');
    console.log('   🌐 Access admin panel: http://localhost:3002');

    console.log('\n🎯 Login Credentials:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);

  } catch (error) {
    console.error('❌ Failed to create admin user:', error);
    
    if (error.code === '23505') { // Unique constraint violation
      console.error('\n💡 This usually means an admin with this email already exists.');
    } else if (error.code === '42P01') { // Table doesn't exist
      console.error('\n💡 Run database setup first: npm run setup');
    }
    
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createAdminUser()
    .then(() => {
      console.log('\n🎉 Admin user creation completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Admin creation failed:', error);
      process.exit(1);
    });
}

export default createAdminUser;