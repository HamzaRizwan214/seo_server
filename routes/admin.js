import express from 'express';
import bcrypt from 'bcryptjs';
import { authenticateAdmin, generateToken } from '../middleware/auth.js';
import { validateAdminLogin, validateStatusUpdate, validateOrderQuery } from '../middleware/validation.js';
import { 
  adminIPRestriction, 
  bruteForceProtection, 
  validateEmail, 
  validatePassword,
  handleValidationErrors,
  secureFileUpload 
} from '../middleware/security.js';
import { query, beginTransaction, commitTransaction, rollbackTransaction } from '../config/database.js';
import { emailService } from '../services/email.js';
import { paypalService } from '../services/paypal.js';
import { tempFileManager } from '../utils/tempFileManager.js';

const router = express.Router();

// Admin login with enhanced security
router.post('/login', 
  bruteForceProtection,
  validateEmail,
  handleValidationErrors,
  validateAdminLogin, 
  async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find admin user
    const result = await query(
      'SELECT id, email, password_hash, name, role, is_active FROM admin_users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Verify password with bcrypt (secure hashing)
    console.log('🔐 Password verification for:', email);
    
    let isValidPassword = false;
    
    // Check if password is already hashed (starts with $2b$)
    if (user.password_hash.startsWith('$2b$')) {
      // Use bcrypt for hashed passwords
      isValidPassword = await bcrypt.compare(password, user.password_hash);
    } else {
      // Fallback for plain text passwords (upgrade to hash)
      isValidPassword = password === user.password_hash;
      
      if (isValidPassword) {
        // Upgrade to hashed password
        const hashedPassword = await bcrypt.hash(password, 12);
        await query(
          'UPDATE admin_users SET password_hash = $1 WHERE id = $2',
          [hashedPassword, user.id]
        );
        console.log('✅ Password upgraded to secure hash for user:', user.name);
      }
    }
    
    console.log('   🎯 Password valid:', isValidPassword);
    
    if (!isValidPassword) {
      console.log('❌ Password comparison failed');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    console.log('✅ Login successful for:', user.email);

    // Generate JWT token
    const token = generateToken(user.id, user.email);

    // Update last login
    await query(
      'UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Return user data (without password)
    const { password_hash, ...userData } = user;

    res.json({
      success: true,
      data: {
        token,
        user: userData
      }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});

// Verify token
router.get('/verify', authenticateAdmin, async (req, res) => {
  res.json({
    success: true,
    data: {
      user: req.admin
    }
  });
});

// Dashboard statistics
router.get('/dashboard/stats', authenticateAdmin, async (req, res) => {
  try {
    const [
      totalOrdersResult,
      pendingOrdersResult,
      inProgressOrdersResult,
      completedOrdersResult,
      totalRevenueResult,
      totalCustomersResult,
      todayOrdersResult,
      thisMonthRevenueResult
    ] = await Promise.all([
      query('SELECT COUNT(*) as count FROM orders'),
      query('SELECT COUNT(*) as count FROM orders WHERE status = $1', ['pending']),
      query('SELECT COUNT(*) as count FROM orders WHERE status = $1', ['in_progress']),
      query('SELECT COUNT(*) as count FROM orders WHERE status = $1', ['completed']),
      query('SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE payment_status = $1', ['paid']),
      query('SELECT COUNT(DISTINCT customer_id) as count FROM orders'),
      query('SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = CURRENT_DATE'),
      query(`SELECT COALESCE(SUM(total_amount), 0) as total FROM orders 
             WHERE payment_status = $1 AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)`, ['paid'])
    ]);

    const stats = {
      totalOrders: parseInt(totalOrdersResult.rows[0].count),
      pendingOrders: parseInt(pendingOrdersResult.rows[0].count),
      inProgressOrders: parseInt(inProgressOrdersResult.rows[0].count),
      completedOrders: parseInt(completedOrdersResult.rows[0].count),
      totalRevenue: parseFloat(totalRevenueResult.rows[0].total),
      totalCustomers: parseInt(totalCustomersResult.rows[0].count),
      todayOrders: parseInt(todayOrdersResult.rows[0].count),
      thisMonthRevenue: parseFloat(thisMonthRevenueResult.rows[0].total)
    };

    // Calculate average order value
    stats.avgOrderValue = stats.totalOrders > 0 ? stats.totalRevenue / stats.totalOrders : 0;

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics'
    });
  }
});

// Recent orders for dashboard
router.get('/dashboard/recent-orders', authenticateAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const result = await query(`
      SELECT 
        o.id,
        o.tracking_id,
        o.service_name,
        o.service_tier_name,
        o.delivery_days,
        o.total_amount,
        o.status,
        o.payment_status,
        o.created_at,
        c.name as customer_name,
        c.email as customer_email
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ORDER BY o.created_at DESC
      LIMIT $1
    `, [limit]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Recent orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent orders'
    });
  }
});

// Get all orders with filtering and pagination
router.get('/orders', authenticateAdmin, validateOrderQuery, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      payment_status,
      search,
      sort = 'created_at',
      order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    // Build WHERE conditions
    if (status) {
      whereConditions.push(`o.status = $${paramIndex++}`);
      queryParams.push(status);
    }

    if (payment_status) {
      whereConditions.push(`o.payment_status = $${paramIndex++}`);
      queryParams.push(payment_status);
    }

    if (search) {
      whereConditions.push(`(
        o.tracking_id ILIKE $${paramIndex} OR 
        c.name ILIKE $${paramIndex} OR 
        c.email ILIKE $${paramIndex} OR
        o.service_name ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get orders
    const ordersQuery = `
      SELECT 
        o.id,
        o.tracking_id,
        o.service_name,
        o.service_tier_name,
        o.delivery_days,
        o.quantity,
        o.total_amount,
        o.keywords,
        o.status,
        o.payment_status,
        o.created_at,
        o.updated_at,
        c.name as customer_name,
        c.email as customer_email,
        c.website as customer_website
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ${whereClause}
      ORDER BY o.${sort} ${order}
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    queryParams.push(limit, offset);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      ${whereClause}
    `;

    const [ordersResult, countResult] = await Promise.all([
      query(ordersQuery, queryParams),
      query(countQuery, queryParams.slice(0, -2)) // Remove limit and offset for count
    ]);

    const totalOrders = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalOrders / limit);

    res.json({
      success: true,
      data: {
        orders: ordersResult.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalOrders,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
});

// Get single order details
router.get('/orders/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get order details
    const orderResult = await query(`
      SELECT 
        o.*,
        c.name as customer_name,
        c.email as customer_email,
        c.website as customer_website,
        c.phone as customer_phone,
        c.created_at as customer_created_at
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.id = $1
    `, [id]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get order status history
    const historyResult = await query(`
      SELECT status, notes, created_at, changed_by
      FROM order_status_history
      WHERE order_id = $1
      ORDER BY created_at DESC
    `, [id]);

    // Get deliverables
    const deliverablesResult = await query(`
      SELECT id, file_name, file_path, file_type, file_size, created_at as uploaded_at
      FROM deliverables
      WHERE order_id = $1
      ORDER BY created_at DESC
    `, [id]);

    // Get payment details
    const paymentResult = await query(`
      SELECT payment_method, payment_id, amount, currency, status, created_at
      FROM payments
      WHERE order_id = $1
      ORDER BY created_at DESC
    `, [id]);

    res.json({
      success: true,
      data: {
        order: orderResult.rows[0],
        statusHistory: historyResult.rows,
        deliverables: deliverablesResult.rows,
        payments: paymentResult.rows
      }
    });

  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details'
    });
  }
});

// Update order status
router.put('/orders/:id/status', authenticateAdmin, validateStatusUpdate, async (req, res) => {
  const client = await beginTransaction();
  
  try {
    const { id } = req.params;
    const { status, notes = '' } = req.body;

    // Get current order details
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = $1',
      [id]
    );

    if (orderResult.rows.length === 0) {
      await rollbackTransaction(client);
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const currentOrder = orderResult.rows[0];

    // Update order status
    const updateResult = await client.query(
      'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, id]
    );

    // Add to status history
    await client.query(
      'INSERT INTO order_status_history (order_id, status, notes, changed_by) VALUES ($1, $2, $3, $4)',
      [id, status, notes, req.admin.id]
    );

    // Get customer info for email
    const customerResult = await client.query(`
      SELECT c.email, c.name, o.tracking_id, o.service_name
      FROM customers c
      JOIN orders o ON c.id = o.customer_id
      WHERE o.id = $1
    `, [id]);

    await commitTransaction(client);

    // Send status update email (async, don't wait)
    if (customerResult.rows.length > 0) {
      const customer = customerResult.rows[0];
      
      emailService.sendStatusUpdate(
        customer.email,
        {
          trackingId: customer.tracking_id,
          customerName: customer.name,
          serviceName: customer.service_name
        },
        status,
        notes
      ).catch(error => {
        console.error('Failed to send status update email:', error);
      });
    }

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: {
        order: updateResult.rows[0]
      }
    });

  } catch (error) {
    await rollbackTransaction(client);
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status'
    });
  }
});

// Get customers
router.get('/customers', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '';
    let queryParams = [];
    let paramIndex = 1;

    if (search) {
      whereClause = `WHERE c.name ILIKE $${paramIndex} OR c.email ILIKE $${paramIndex}`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const customersQuery = `
      SELECT 
        c.*,
        COUNT(o.id) as total_orders,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_amount ELSE 0 END), 0) as total_spent,
        MAX(o.created_at) as last_order_date
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

    queryParams.push(limit, offset);

    const countQuery = `
      SELECT COUNT(DISTINCT c.id) as total
      FROM customers c
      ${whereClause}
    `;

    const [customersResult, countResult] = await Promise.all([
      query(customersQuery, queryParams),
      query(countQuery, queryParams.slice(0, -2))
    ]);

    const totalCustomers = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalCustomers / limit);

    res.json({
      success: true,
      data: {
        customers: customersResult.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCustomers,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customers'
    });
  }
});

// Analytics data
router.get('/analytics', authenticateAdmin, async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    let dateFilter = '';
    switch (period) {
      case '7d':
        dateFilter = "created_at >= CURRENT_DATE - INTERVAL '7 days'";
        break;
      case '30d':
        dateFilter = "created_at >= CURRENT_DATE - INTERVAL '30 days'";
        break;
      case '90d':
        dateFilter = "created_at >= CURRENT_DATE - INTERVAL '90 days'";
        break;
      case '1y':
        dateFilter = "created_at >= CURRENT_DATE - INTERVAL '1 year'";
        break;
      default:
        dateFilter = "created_at >= CURRENT_DATE - INTERVAL '30 days'";
    }

    // Revenue over time
    const revenueQuery = `
      SELECT 
        DATE(created_at) as date,
        COALESCE(SUM(total_amount), 0) as revenue,
        COUNT(*) as orders
      FROM orders 
      WHERE payment_status = 'paid' AND ${dateFilter}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    // Top services
    const servicesQuery = `
      SELECT 
        service_name,
        COUNT(*) as orders,
        COALESCE(SUM(total_amount), 0) as revenue
      FROM orders 
      WHERE payment_status = 'paid' AND ${dateFilter}
      GROUP BY service_name
      ORDER BY revenue DESC
      LIMIT 5
    `;

    const [revenueResult, servicesResult] = await Promise.all([
      query(revenueQuery),
      query(servicesQuery)
    ]);

    res.json({
      success: true,
      data: {
        revenueChart: revenueResult.rows,
        topServices: servicesResult.rows,
        period
      }
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics data'
    });
  }
});

// Deliver order with file attachment (using temporary storage)
router.post('/orders/:id/deliver', authenticateAdmin, async (req, res) => {
  let tempFileInfo = null;
  
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!req.files || !req.files.deliveryFile) {
      return res.status(400).json({
        success: false,
        message: 'Delivery file is required'
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Delivery message is required'
      });
    }

    const deliveryFile = req.files.deliveryFile;

    // Validate file type
    const allowedTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed'
    ];
    
    const allowedExtensions = ['.xlsx', '.xls', '.pdf', '.zip'];
    const fileExtension = deliveryFile.name.toLowerCase().substring(deliveryFile.name.lastIndexOf('.'));
    
    if (!allowedTypes.includes(deliveryFile.mimetype) && !allowedExtensions.includes(fileExtension)) {
      return res.status(400).json({
        success: false,
        message: 'Only Excel (.xlsx, .xls), PDF, and ZIP files are allowed'
      });
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (deliveryFile.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: 'File size must be less than 10MB'
      });
    }

    console.log(`📤 Processing delivery for order ${id} with file: ${deliveryFile.name}`);

    // Get order and customer details
    const orderResult = await query(`
      SELECT o.*, c.email, c.name as customer_name
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.id = $1
    `, [id]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const order = orderResult.rows[0];

    // Save file temporarily
    tempFileInfo = await tempFileManager.saveTemp(deliveryFile.data, deliveryFile.name);
    console.log(`💾 File temporarily saved: ${tempFileInfo.tempFileName}`);

    // Update order status to completed
    await query(
      'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['completed', id]
    );

    // Add status history
    await query(
      'INSERT INTO order_status_history (order_id, status, notes) VALUES ($1, $2, $3)',
      [id, 'completed', `Order delivered with file attachment: ${deliveryFile.name}`]
    );

    // Send delivery email with attachment
    try {
      await emailService.sendDeliveryEmail(
        order.email,
        {
          trackingId: order.tracking_id,
          customerName: order.customer_name,
          serviceName: order.service_name,
          message: message.trim()
        },
        {
          filename: deliveryFile.name,
          path: tempFileInfo.tempPath
        }
      );

      console.log(`✅ Delivery email sent for order ${order.tracking_id}`);
    } catch (emailError) {
      console.error('❌ Email delivery failed:', emailError);
      throw new Error('Failed to send delivery email: ' + emailError.message);
    }

    // Clean up temp file immediately after email is sent
    await tempFileManager.deleteTemp(tempFileInfo.tempPath);
    console.log(`🗑️ Temp file cleaned up for order ${order.tracking_id}`);

    res.json({
      success: true,
      message: 'Order delivered successfully',
      data: {
        orderId: id,
        trackingId: order.tracking_id,
        fileName: deliveryFile.name,
        fileSize: deliveryFile.size
      }
    });

  } catch (error) {
    console.error('❌ Order delivery error:', error);
    
    // Clean up temp file if it exists and there was an error
    if (tempFileInfo) {
      await tempFileManager.deleteTemp(tempFileInfo.tempPath);
      console.log('🗑️ Temp file cleaned up after error');
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to deliver order: ' + error.message
    });
  }
});

// Delete order
router.delete('/orders/:id', authenticateAdmin, async (req, res) => {
  const client = await beginTransaction();
  
  try {
    const { id } = req.params;

    // Check if order exists
    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1', [id]);
    
    if (orderResult.rows.length === 0) {
      await rollbackTransaction(client);
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Delete related records first (due to foreign key constraints)
    await client.query('DELETE FROM order_status_history WHERE order_id = $1', [id]);
    await client.query('DELETE FROM payments WHERE order_id = $1', [id]);
    await client.query('DELETE FROM deliverables WHERE order_id = $1', [id]);
    
    // Delete the order
    await client.query('DELETE FROM orders WHERE id = $1', [id]);

    await commitTransaction(client);

    res.json({
      success: true,
      message: 'Order deleted successfully'
    });

  } catch (error) {
    await rollbackTransaction(client);
    console.error('Delete order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete order'
    });
  }
});

// Delete customer
router.delete('/customers/:id', authenticateAdmin, async (req, res) => {
  const client = await beginTransaction();
  
  try {
    const { id } = req.params;

    // Check if customer exists
    const customerResult = await client.query('SELECT * FROM customers WHERE id = $1', [id]);
    
    if (customerResult.rows.length === 0) {
      await rollbackTransaction(client);
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Check if customer has orders
    const ordersResult = await client.query('SELECT COUNT(*) as count FROM orders WHERE customer_id = $1', [id]);
    const orderCount = parseInt(ordersResult.rows[0].count);

    if (orderCount > 0) {
      await rollbackTransaction(client);
      return res.status(400).json({
        success: false,
        message: `Cannot delete customer with ${orderCount} existing orders. Delete orders first.`
      });
    }

    // Delete the customer
    await client.query('DELETE FROM customers WHERE id = $1', [id]);

    await commitTransaction(client);

    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });

  } catch (error) {
    await rollbackTransaction(client);
    console.error('Delete customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete customer'
    });
  }
});

// Get customer details
router.get('/customers/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get customer details with order statistics
    const customerResult = await query(`
      SELECT 
        c.*,
        COUNT(o.id) as total_orders,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_amount ELSE 0 END), 0) as total_spent,
        MAX(o.created_at) as last_order_date,
        COUNT(CASE WHEN o.status = 'completed' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN o.status = 'pending' THEN 1 END) as pending_orders
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id
      WHERE c.id = $1
      GROUP BY c.id, c.name, c.email, c.website, c.phone, c.created_at, c.updated_at
    `, [id]);

    if (customerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Get customer's orders
    const ordersResult = await query(`
      SELECT 
        id,
        tracking_id,
        service_name,
        service_tier_name,
        total_amount,
        status,
        payment_status,
        created_at
      FROM orders 
      WHERE customer_id = $1 
      ORDER BY created_at DESC
    `, [id]);

    res.json({
      success: true,
      data: {
        customer: customerResult.rows[0],
        orders: ordersResult.rows
      }
    });

  } catch (error) {
    console.error('Get customer details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer details'
    });
  }
});

export default router;