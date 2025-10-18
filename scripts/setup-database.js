import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, testConnection } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupDatabase() {
  console.log('🗄️  Setting up SEO Order Management Database...\n');

  try {
    // Test database connection
    console.log('📡 Testing database connection...');
    const connected = await testConnection();
    
    if (!connected) {
      console.error('❌ Database connection failed. Please check your configuration.');
      process.exit(1);
    }

    // Read and execute schema
    console.log('📋 Reading database schema...');
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('🔨 Creating database tables and functions...');
    await query(schema);

    console.log('✅ Database schema created successfully!\n');

    // Verify tables were created
    console.log('🔍 Verifying table creation...');
    const tablesResult = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    console.log('📊 Created tables:');
    tablesResult.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });

    // Check if services were inserted
    const servicesResult = await query('SELECT COUNT(*) as count FROM services');
    console.log(`\n📦 Inserted ${servicesResult.rows[0].count} default services`);

    console.log('\n🎉 Database setup completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Run: npm run create:admin');
    console.log('   2. Start the server: npm run dev');
    console.log('   3. Access admin panel: http://localhost:3002\n');

  } catch (error) {
    console.error('❌ Database setup failed:', error);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Ensure PostgreSQL is running');
    console.error('   2. Check database credentials in .env file');
    console.error('   3. Verify database exists and user has permissions');
    process.exit(1);
  }
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Setup failed:', error);
      process.exit(1);
    });
}

export default setupDatabase;