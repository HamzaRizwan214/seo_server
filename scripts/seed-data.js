import { query, beginTransaction, commitTransaction, rollbackTransaction } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const sampleCustomers = [
  {
    name: 'John Smith',
    email: 'john.smith@example.com',
    website: 'https://johnsmith.com'
  },
  {
    name: 'Sarah Johnson',
    email: 'sarah@techstartup.com',
    website: 'https://techstartup.com'
  },
  {
    name: 'Mike Chen',
    email: 'mike@ecommerce.store',
    website: 'https://ecommerce.store'
  },
  {
    name: 'Emily Davis',
    email: 'emily@localrestaurant.com',
    website: 'https://localrestaurant.com'
  },
  {
    name: 'David Wilson',
    email: 'david@consultingfirm.net',
    website: 'https://consultingfirm.net'
  }
];

const sampleKeywords = [
  'SEO optimization, digital marketing, search engine ranking',
  'e-commerce SEO, online store optimization, product visibility',
  'local SEO, restaurant marketing, food delivery optimization',
  'B2B SEO, lead generation, business consulting keywords',
  'technical SEO, website performance, site speed optimization',
  'content marketing, blog SEO, organic traffic growth',
  'mobile SEO, responsive design, mobile-first indexing',
  'voice search optimization, featured snippets, local search'
];

async function seedDatabase() {
  console.log('🌱 Seeding database with sample data...\n');

  const client = await beginTransaction();

  try {
    // Get available service tiers
    const serviceTiersResult = await client.query(`
      SELECT st.*, s.name as service_name 
      FROM service_tiers st 
      JOIN services s ON st.service_id = s.id 
      WHERE st.is_active = true AND s.is_active = true
    `);
    const serviceTiers = serviceTiersResult.rows;

    if (serviceTiers.length === 0) {
      throw new Error('No service tiers found. Run database setup first.');
    }

    console.log(`📦 Found ${serviceTiers.length} service tiers`);

    // Create sample customers and orders
    for (let i = 0; i < sampleCustomers.length; i++) {
      const customer = sampleCustomers[i];
      
      console.log(`👤 Creating customer: ${customer.name}`);
      
      // Create customer
      const customerResult = await client.query(
        'INSERT INTO customers (name, email, website) VALUES ($1, $2, $3) RETURNING id',
        [customer.name, customer.email, customer.website]
      );
      
      const customerId = customerResult.rows[0].id;

      // Create 1-3 orders per customer
      const orderCount = Math.floor(Math.random() * 3) + 1;
      
      for (let j = 0; j < orderCount; j++) {
        const serviceTier = serviceTiers[Math.floor(Math.random() * serviceTiers.length)];
        const keywords = sampleKeywords[Math.floor(Math.random() * sampleKeywords.length)];
        const quantity = Math.floor(Math.random() * 3) + 1;
        const totalAmount = serviceTier.price * quantity;
        
        // Random status
        const statuses = ['pending', 'confirmed', 'in_progress', 'completed'];
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        
        // Payment status based on order status
        let paymentStatus = 'pending';
        if (status === 'confirmed' || status === 'in_progress' || status === 'completed') {
          paymentStatus = 'paid';
        }

        console.log(`   📋 Creating order: ${serviceTier.service_name} - ${serviceTier.name} (${status})`);

        // Create order
        const orderResult = await client.query(
          `INSERT INTO orders (customer_id, service_tier_id, service_name, service_tier_name, service_price, delivery_days, keywords, quantity, total_amount, status, payment_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, tracking_id`,
          [customerId, serviceTier.id, serviceTier.service_name, serviceTier.name, serviceTier.price, serviceTier.delivery_days, keywords, quantity, totalAmount, status, paymentStatus]
        );

        const order = orderResult.rows[0];

        // Add initial status history
        await client.query(
          'INSERT INTO order_status_history (order_id, status, notes) VALUES ($1, $2, $3)',
          [order.id, 'pending', 'Order created (sample data)']
        );

        // Add status progression for non-pending orders
        if (status !== 'pending') {
          await client.query(
            'INSERT INTO order_status_history (order_id, status, notes) VALUES ($1, $2, $3)',
            [order.id, 'confirmed', 'Payment received (sample data)']
          );
        }

        if (status === 'in_progress' || status === 'completed') {
          await client.query(
            'INSERT INTO order_status_history (order_id, status, notes) VALUES ($1, $2, $3)',
            [order.id, 'in_progress', 'Work started (sample data)']
          );
        }

        if (status === 'completed') {
          await client.query(
            'INSERT INTO order_status_history (order_id, status, notes) VALUES ($1, $2, $3)',
            [order.id, 'completed', 'Work completed and delivered (sample data)']
          );
        }

        // Create payment record for paid orders
        if (paymentStatus === 'paid') {
          await client.query(
            `INSERT INTO payments (order_id, payment_method, payment_id, amount, currency, status)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [order.id, 'paypal', `SAMPLE_${order.tracking_id}`, totalAmount, 'USD', 'paid']
          );
        }
      }
    }

    await commitTransaction(client);

    // Get final counts
    const [ordersCount, customersCount, paymentsCount] = await Promise.all([
      query('SELECT COUNT(*) as count FROM orders'),
      query('SELECT COUNT(*) as count FROM customers'),
      query('SELECT COUNT(*) as count FROM payments')
    ]);

    console.log('\n✅ Sample data created successfully!');
    console.log('\n📊 Summary:');
    console.log(`   👥 Customers: ${customersCount.rows[0].count}`);
    console.log(`   📋 Orders: ${ordersCount.rows[0].count}`);
    console.log(`   💳 Payments: ${paymentsCount.rows[0].count}`);
    console.log(`   📦 Services: ${services.length}`);

    console.log('\n🎯 You can now:');
    console.log('   1. Start the server: npm run dev');
    console.log('   2. Access admin panel: http://localhost:3002');
    console.log('   3. Login with your admin credentials');
    console.log('   4. View the sample orders and customers');

  } catch (error) {
    await rollbackTransaction(client);
    console.error('❌ Failed to seed database:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase()
    .then(() => {
      console.log('\n🎉 Database seeding completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}

export default seedDatabase;