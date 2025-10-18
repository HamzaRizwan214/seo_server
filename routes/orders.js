import express from "express";
import {
  query,
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
} from "../config/database.js";
import {
  validateOrderCreation,
  validatePaymentCapture,
} from "../middleware/validation.js";
import { 
  validateOrderInput, 
  handleValidationErrors,
  sanitizeInput 
} from "../middleware/security.js";
import { paypalService } from "../services/paypal.js";
import { emailService } from "../services/email.js";
import { stripeService } from "../services/stripe.js";

const router = express.Router();

// Create new order (secured)
router.post("/create", 
  validateOrderInput,
  handleValidationErrors,
  validateOrderCreation, 
  async (req, res) => {
  const client = await beginTransaction();

  try {
    const {
      customerName,
      customerEmail,
      website,
      keywords,
      serviceId,
      quantity = 1,
    } = req.body;

    // Get service tier details
    const serviceTierResult = await client.query(
      `SELECT st.*, s.name as service_name 
       FROM service_tiers st 
       JOIN services s ON st.service_id = s.id 
       WHERE st.id = $1 AND st.is_active = true AND s.is_active = true`,
      [serviceId] // serviceId is actually serviceTierId from frontend
    );

    if (serviceTierResult.rows.length === 0) {
      await rollbackTransaction(client);
      return res.status(400).json({
        success: false,
        message: "Invalid or inactive service tier",
      });
    }

    const serviceTier = serviceTierResult.rows[0];
    const totalAmount = serviceTier.price * quantity;

    // Check if customer exists, create if not
    let customerId;
    const customerResult = await client.query(
      "SELECT id FROM customers WHERE email = $1",
      [customerEmail]
    );

    if (customerResult.rows.length > 0) {
      customerId = customerResult.rows[0].id;
      // Update customer info
      await client.query(
        "UPDATE customers SET name = $1, website = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
        [customerName, website, customerId]
      );
    } else {
      // Create new customer
      const newCustomerResult = await client.query(
        "INSERT INTO customers (name, email, website) VALUES ($1, $2, $3) RETURNING id",
        [customerName, customerEmail, website]
      );
      customerId = newCustomerResult.rows[0].id;
    }

    // Create order
    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, service_tier_id, service_name, service_tier_name, service_price, delivery_days, keywords, quantity, total_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        customerId,
        serviceId, // This is actually serviceTierId from frontend
        serviceTier.service_name,
        serviceTier.name,
        serviceTier.price,
        serviceTier.delivery_days,
        keywords,
        quantity,
        totalAmount,
      ]
    );

    const order = orderResult.rows[0];

    // Add initial status history
    await client.query(
      "INSERT INTO order_status_history (order_id, status, notes) VALUES ($1, $2, $3)",
      [order.id, "pending", "Order created"]
    );

    await commitTransaction(client);

    // Create PayPal order
    const paypalOrder = await paypalService.createOrder({
      amount: totalAmount,
      currency: "USD",
      orderId: order.tracking_id,
      description: `${service.name} - ${keywords.substring(0, 50)}...`,
    });

    res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: {
        order: {
          id: order.id,
          trackingId: order.tracking_id,
          totalAmount: order.total_amount,
          serviceName: order.service_name,
        },
        paypalOrder: {
          id: paypalOrder.id,
          approvalUrl: paypalOrder.links.find((link) => link.rel === "approve")
            ?.href,
        },
      },
    });
  } catch (error) {
    await rollbackTransaction(client);
    console.error("Order creation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create order",
    });
  }
});

// Capture PayPal payment
router.post("/capture-payment", validatePaymentCapture, async (req, res) => {
  const client = await beginTransaction();

  try {
    const { paypalOrderId, orderId } = req.body;

    // Get order details
    const orderResult = await client.query(
      `SELECT o.*, c.name as customer_name, c.email as customer_email, c.website as customer_website
       FROM orders o 
       JOIN customers c ON o.customer_id = c.id 
       WHERE o.id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      await rollbackTransaction(client);
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const order = orderResult.rows[0];

    // Capture PayPal payment
    const captureResult = await paypalService.captureOrder(paypalOrderId);
    const paymentInfo = paypalService.extractPaymentInfo(captureResult);

    // Verify payment amount matches order amount
    if (Math.abs(paymentInfo.amount - parseFloat(order.total_amount)) > 0.01) {
      await rollbackTransaction(client);
      return res.status(400).json({
        success: false,
        message: "Payment amount mismatch",
      });
    }

    // Update order payment status
    await client.query(
      "UPDATE orders SET payment_status = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
      ["paid", "confirmed", orderId]
    );

    // Record payment
    await client.query(
      `INSERT INTO payments (order_id, payment_method, payment_id, payer_id, amount, currency, status, gateway_response)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        orderId,
        "paypal",
        paymentInfo.paypalOrderId,
        paymentInfo.payerId,
        paymentInfo.amount,
        paymentInfo.currency,
        "paid",
        JSON.stringify(captureResult),
      ]
    );

    // Add status history
    await client.query(
      "INSERT INTO order_status_history (order_id, status, notes) VALUES ($1, $2, $3)",
      [orderId, "confirmed", "Payment received and confirmed"]
    );

    await commitTransaction(client);

    // Send confirmation email
    try {
      await emailService.sendOrderConfirmation(order.customer_email, {
        trackingId: order.tracking_id,
        customerName: order.customer_name,
        serviceName: order.service_name,
        totalAmount: order.total_amount,
        keywords: order.keywords,
        website: order.customer_website,
      });
    } catch (emailError) {
      console.error("Failed to send confirmation email:", emailError);
      // Don't fail the request if email fails
    }

    res.json({
      success: true,
      message: "Payment captured successfully",
      data: {
        orderId: order.id,
        trackingId: order.tracking_id,
        paymentId: paymentInfo.paypalOrderId,
        amount: paymentInfo.amount,
      },
    });
  } catch (error) {
    await rollbackTransaction(client);
    console.error("Payment capture error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to capture payment",
    });
  }
});

// Get order by tracking ID (for customers)
router.get("/track/:trackingId", async (req, res) => {
  try {
    const { trackingId } = req.params;
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required for order tracking",
      });
    }

    const result = await query(
      `SELECT o.tracking_id, o.service_name, o.service_tier_name, o.total_amount, o.status, o.payment_status, 
              o.created_at, o.delivery_days, o.keywords, c.name as customer_name, c.email as customer_email, c.website as customer_website
       FROM orders o 
       JOIN customers c ON o.customer_id = c.id 
       WHERE o.tracking_id = $1 AND c.email = $2`,
      [trackingId, email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found or email doesn't match",
      });
    }

    const order = result.rows[0];

    // Get status history
    const historyResult = await query(
      "SELECT status, notes, created_at FROM order_status_history WHERE order_id = (SELECT id FROM orders WHERE tracking_id = $1) ORDER BY created_at DESC",
      [trackingId]
    );

    // Format response to match what the frontend expects
    const response = {
      trackingId: order.tracking_id,
      status: order.status,
      statusText: order.status.charAt(0).toUpperCase() + order.status.slice(1).replace('_', ' '),
      submittedAt: order.created_at,
      total: parseFloat(order.total_amount),
      customer: {
        name: order.customer_name,
        email: order.customer_email,
        website: order.customer_website
      },
      items: [{
        description: `${order.service_name} - ${order.service_tier_name}`,
        total: parseFloat(order.total_amount)
      }],
      timeline: historyResult.rows.length > 0 ? historyResult.rows.map(h => ({
        date: h.created_at,
        description: h.notes || `Order status updated to ${h.status}`
      })) : [{
        date: order.created_at,
        description: "Order placed and confirmed"
      }],
      deliverables: [], // Empty for now, can be populated later
      estimatedCompletion: new Date(Date.now() + (order.delivery_days || 7) * 24 * 60 * 60 * 1000).toISOString()
    };

    res.json(response);
  } catch (error) {
    console.error("Order tracking error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve order information",
    });
  }
});

// Get available services
router.get("/services", async (req, res) => {
  try {
    const result = await query(
      "SELECT id, name, description, price FROM services WHERE is_active = true ORDER BY price ASC"
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Services fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch services",
    });
  }
});

// PayPal webhook handler
router.post("/webhook/paypal", async (req, res) => {
  try {
    const webhookEvent = req.body;

    // Log webhook for debugging (development only)
    if (process.env.NODE_ENV !== 'production') {
      console.log("PayPal webhook received:", webhookEvent.event_type);
    }

    // Handle different webhook events
    switch (webhookEvent.event_type) {
      case "CHECKOUT.ORDER.APPROVED":
        // Order approved but not yet captured
        if (process.env.NODE_ENV !== 'production') {
          console.log("PayPal order approved:", webhookEvent.resource.id);
        }
        break;

      case "PAYMENT.CAPTURE.COMPLETED":
        // Payment captured successfully
        await handlePaymentCompleted(webhookEvent.resource);
        break;

      case "PAYMENT.CAPTURE.DENIED":
        // Payment was denied
        await handlePaymentDenied(webhookEvent.resource);
        break;

      default:
        if (process.env.NODE_ENV !== 'production') {
          console.log("Unhandled webhook event:", webhookEvent.event_type);
        }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("PayPal webhook error:", error);
    res.status(500).json({ success: false });
  }
});

// Helper function to handle completed payments
async function handlePaymentCompleted(resource) {
  try {
    const paymentId = resource.id;

    // Update payment status in database
    await query(
      "UPDATE payments SET status = $1, gateway_response = $2, updated_at = CURRENT_TIMESTAMP WHERE payment_id = $3",
      ["paid", JSON.stringify(resource), paymentId]
    );

    if (process.env.NODE_ENV !== 'production') {
      console.log("Payment completed webhook processed:", paymentId);
    }
  } catch (error) {
    console.error("Error processing payment completed webhook:", error);
  }
}

// Helper function to handle denied payments
async function handlePaymentDenied(resource) {
  try {
    const paymentId = resource.id;

    // Update payment status in database
    await query(
      "UPDATE payments SET status = $1, gateway_response = $2, updated_at = CURRENT_TIMESTAMP WHERE payment_id = $3",
      ["failed", JSON.stringify(resource), paymentId]
    );

    if (process.env.NODE_ENV !== 'production') {
      console.log("Payment denied webhook processed:", paymentId);
    }
  } catch (error) {
    console.error("Error processing payment denied webhook:", error);
  }
}

// Test order endpoint (bypasses PayPal for testing)
router.post("/test-order", async (req, res) => {
  const client = await beginTransaction();

  try {
    const { cart, customer } = req.body;

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is required and must contain at least one item",
      });
    }

    // Validate customer data
    if (!customer || !customer.name || !customer.email || !customer.website) {
      return res.status(400).json({
        success: false,
        message: "Customer name, email, and website are required",
      });
    }

    if (customer.name.length < 2 || customer.name.length > 255) {
      return res.status(400).json({
        success: false,
        message: "Customer name must be between 2 and 255 characters",
      });
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log("🔍 Debug Test Order:");
      console.log("   📦 Cart Items:", cart.length);
      console.log("   👤 Customer:", customer.name, customer.email);
    }

    // Check if customer exists or create new one
    let customerId;
    const existingCustomer = await client.query(
      "SELECT id FROM customers WHERE email = $1",
      [customer.email]
    );

    if (existingCustomer.rows.length > 0) {
      customerId = existingCustomer.rows[0].id;
      if (process.env.NODE_ENV !== 'production') {
        console.log("   ✅ Existing customer found:", customerId);
      }
    } else {
      // Create new customer
      const newCustomerResult = await client.query(
        "INSERT INTO customers (name, email, website, phone) VALUES ($1, $2, $3, $4) RETURNING id",
        [
          customer.name,
          customer.email,
          customer.website,
          customer.phone || null,
        ]
      );
      customerId = newCustomerResult.rows[0].id;
      if (process.env.NODE_ENV !== 'production') {
        console.log("   ✅ New customer created:", customerId);
      }
    }

    const createdOrders = [];
    let totalCartAmount = 0;

    // Process each cart item as a separate order
    for (let i = 0; i < cart.length; i++) {
      const cartItem = cart[i];
      const {
        serviceId,
        quantity = 1,
        keywords = "SEO optimization, digital marketing",
      } = cartItem;

      if (process.env.NODE_ENV !== 'production') {
        console.log(`   📦 Processing item ${i + 1}:`, cartItem.title || serviceId);
      }

      // Get service tier details
      const serviceTierResult = await client.query(
        `SELECT st.*, s.name as service_name 
         FROM service_tiers st 
         JOIN services s ON st.service_id = s.id 
         WHERE st.id = $1 AND st.is_active = true AND s.is_active = true`,
        [serviceId]
      );

      if (serviceTierResult.rows.length === 0) {
        // Debug: Show available service tiers
        const availableTiers = await client.query(
          "SELECT id, name FROM service_tiers WHERE is_active = true"
        );
        if (process.env.NODE_ENV !== 'production') {
          console.log(
            "   📋 Available service tiers:",
            availableTiers.rows.map((t) => `${t.id}: ${t.name}`)
          );
        }

        await rollbackTransaction(client);
        return res.status(400).json({
          success: false,
          message: `Invalid service selected. Service ID '${serviceId}' not found.`,
        });
      }

      const serviceTier = serviceTierResult.rows[0];
      const itemTotal = serviceTier.price * quantity;
      totalCartAmount += itemTotal;

      if (process.env.NODE_ENV !== 'production') {
        console.log(`   ✅ Found service: ${serviceTier.service_name} - ${serviceTier.name} ($${itemTotal})`);
      }

      // Create order for this cart item
      const orderResult = await client.query(
        `INSERT INTO orders (customer_id, service_tier_id, service_name, service_tier_name, service_price, delivery_days, keywords, quantity, total_amount, status, payment_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [
          customerId,
          serviceId,
          serviceTier.service_name,
          serviceTier.name,
          serviceTier.price,
          serviceTier.delivery_days,
          keywords,
          quantity,
          itemTotal,
          "confirmed", // Skip pending for test orders
          "paid", // Mark as paid for test orders
        ]
      );

      const order = orderResult.rows[0];

      // Create payment record for this order
      await client.query(
        "INSERT INTO payments (order_id, payment_method, payment_id, amount, status) VALUES ($1, $2, $3, $4, $5)",
        [order.id, "paypal", `TEST-${order.tracking_id}`, itemTotal, "paid"]
      );

      createdOrders.push({
        id: order.id,
        trackingId: order.tracking_id,
        serviceName: order.service_name,
        serviceTierName: order.service_tier_name,
        totalAmount: parseFloat(order.total_amount),
        deliveryDays: order.delivery_days,
        status: order.status,
        paymentStatus: order.payment_status,
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log(`   ✅ Order created: ${order.tracking_id}`);
      }
    }

    await commitTransaction(client);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`🎉 Test orders completed: ${createdOrders.length} orders, Total: $${totalCartAmount}`);
    }

    // Format amounts for email display
    // console.log('🔍 Debug createdOrders before formatting:', createdOrders.map(o => ({ 
    //   id: o.id, 
    //   totalAmount: o.totalAmount, 
    //   type: typeof o.totalAmount 
    // })));
    
    // const formattedOrders = createdOrders.map(order => {
    //   console.log(`🔍 Formatting order ${order.id}: totalAmount = ${order.totalAmount} (type: ${typeof order.totalAmount})`);
    //   return {
    //     ...order,
    //     totalAmount: `$${parseFloat(order.totalAmount || 0).toFixed(2)}`
    //   };
    // });

    // Format amounts for email display
    const formattedOrders = createdOrders.map(order => {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🔍 Formatting order ${order.id}: totalAmount = ${order.totalAmount} (type: ${typeof order.totalAmount})`);
      }
      
      // Convert totalAmount to a number, default to 0 if invalid
      const totalAmountNum = parseFloat(order.totalAmount) || 0;
      
      return {
        ...order,
        totalAmount: `$${totalAmountNum.toFixed(2)}`
      };
    });

    // Send confirmation email for the orders
    try {
      await emailService.sendMultipleOrderConfirmation(customer.email, {
        customerName: customer.name,
        orders: formattedOrders,
        totalAmount: `$${parseFloat(totalCartAmount || 0).toFixed(2)}`,
        website: customer.website,
        orderCount: createdOrders.length
      });
      if (process.env.NODE_ENV !== 'production') {
        console.log(`✅ Confirmation email sent to ${customer.email}`);
      }
    } catch (emailError) {
      console.error('❌ Failed to send confirmation email:', emailError);
      // Don't fail the order if email fails
    }

    res.json({
      success: true,
      message: `${createdOrders.length} test orders created successfully`,
      data: {
        orders: createdOrders,
        totalAmount: totalCartAmount,
        orderCount: createdOrders.length,
        customerEmail: customer.email,
        customerName: customer.name,
        // Return first order's tracking ID for redirect compatibility
        trackingId: createdOrders[0]?.trackingId,
      },
    });
  } catch (error) {
    // Only rollback if transaction hasn't been committed
    try {
      await rollbackTransaction(client);
    } catch (rollbackError) {
      console.error("Rollback failed (client may already be released):", rollbackError.message);
    }
    
    console.error("Test order creation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create test order",
      error: error.message
    });
  }
});

// Create Stripe payment intent
router.post("/create-payment-intent", validateOrderCreation, async (req, res) => {
  const client = await beginTransaction();

  try {
    const { cart, customer } = req.body;

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is required and must contain at least one item",
      });
    }

    // Calculate total amount from cart
    let totalAmount = 0;
    const orderItems = [];

    for (const cartItem of cart) {
      const { serviceId, quantity = 1 } = cartItem;

      // Get service tier details
      const serviceTierResult = await client.query(
        `SELECT st.*, s.name as service_name 
         FROM service_tiers st 
         JOIN services s ON st.service_id = s.id 
         WHERE st.id = $1 AND st.is_active = true AND s.is_active = true`,
        [serviceId]
      );

      if (serviceTierResult.rows.length === 0) {
        await rollbackTransaction(client);
        return res.status(400).json({
          success: false,
          message: `Invalid service selected: ${serviceId}`,
        });
      }

      const serviceTier = serviceTierResult.rows[0];
      const itemTotal = serviceTier.price * quantity;
      totalAmount += itemTotal;

      orderItems.push({
        serviceId,
        serviceName: serviceTier.service_name,
        tierName: serviceTier.name,
        price: serviceTier.price,
        quantity,
        total: itemTotal
      });
    }

    await rollbackTransaction(client);

    // Create Stripe payment intent
    const paymentIntent = await stripeService.createPaymentIntent({
      amount: totalAmount,
      currency: 'usd',
      orderId: `TEMP-${Date.now()}`, // Temporary ID, will be replaced with actual order ID
      description: `SEO Services - ${orderItems.length} item(s)`,
      customerEmail: customer.email
    });

    res.json({
      success: true,
      data: {
        clientSecret: paymentIntent.clientSecret,
        paymentIntentId: paymentIntent.paymentIntentId,
        amount: totalAmount,
        orderItems
      }
    });

  } catch (error) {
    await rollbackTransaction(client);
    console.error("Stripe payment intent creation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create payment intent",
    });
  }
});

// Confirm Stripe payment and create order
router.post("/confirm-stripe-payment", async (req, res) => {
  const client = await beginTransaction();

  try {
    const { paymentIntentId, cart, customer } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        message: "Payment intent ID is required",
      });
    }

    // Confirm payment with Stripe
    const paymentInfo = await stripeService.confirmPayment(paymentIntentId);

    if (paymentInfo.status !== 'succeeded') {
      await rollbackTransaction(client);
      return res.status(400).json({
        success: false,
        message: "Payment not completed",
      });
    }

    // Check if customer exists or create new one
    let customerId;
    const existingCustomer = await client.query(
      "SELECT id FROM customers WHERE email = $1",
      [customer.email]
    );

    if (existingCustomer.rows.length > 0) {
      customerId = existingCustomer.rows[0].id;
    } else {
      const newCustomerResult = await client.query(
        "INSERT INTO customers (name, email, website, phone) VALUES ($1, $2, $3, $4) RETURNING id",
        [customer.name, customer.email, customer.website, customer.phone || null]
      );
      customerId = newCustomerResult.rows[0].id;
    }

    const createdOrders = [];
    let totalCartAmount = 0;

    // Create orders for each cart item
    for (const cartItem of cart) {
      const { serviceId, quantity = 1, keywords = "SEO optimization, digital marketing" } = cartItem;

      // Get service tier details
      const serviceTierResult = await client.query(
        `SELECT st.*, s.name as service_name 
         FROM service_tiers st 
         JOIN services s ON st.service_id = s.id 
         WHERE st.id = $1 AND st.is_active = true AND s.is_active = true`,
        [serviceId]
      );

      if (serviceTierResult.rows.length === 0) {
        await rollbackTransaction(client);
        return res.status(400).json({
          success: false,
          message: `Invalid service selected: ${serviceId}`,
        });
      }

      const serviceTier = serviceTierResult.rows[0];
      const itemTotal = serviceTier.price * quantity;
      totalCartAmount += itemTotal;

      // Create order
      const orderResult = await client.query(
        `INSERT INTO orders (customer_id, service_tier_id, service_name, service_tier_name, service_price, delivery_days, keywords, quantity, total_amount, status, payment_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [
          customerId,
          serviceId,
          serviceTier.service_name,
          serviceTier.name,
          serviceTier.price,
          serviceTier.delivery_days,
          keywords,
          quantity,
          itemTotal,
          "confirmed",
          "paid",
        ]
      );

      const order = orderResult.rows[0];

      // Create payment record
      await client.query(
        "INSERT INTO payments (order_id, payment_method, payment_id, amount, status, gateway_response) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          order.id,
          "stripe",
          paymentIntentId,
          itemTotal,
          "paid",
          JSON.stringify(paymentInfo)
        ]
      );

      createdOrders.push({
        id: order.id,
        trackingId: order.tracking_id,
        serviceName: order.service_name,
        serviceTierName: order.service_tier_name,
        totalAmount: order.total_amount,
        deliveryDays: order.delivery_days,
        status: order.status,
        paymentStatus: order.payment_status,
      });
    }

    await commitTransaction(client);

    // Send confirmation email
    try {
      await emailService.sendMultipleOrderConfirmation(customer.email, {
        customerName: customer.name,
        orders: createdOrders,
        totalAmount: totalCartAmount,
        website: customer.website,
        orderCount: createdOrders.length
      });
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
    }

    res.json({
      success: true,
      message: `${createdOrders.length} orders created successfully`,
      data: {
        orders: createdOrders,
        totalAmount: totalCartAmount,
        orderCount: createdOrders.length,
        customerEmail: customer.email,
        customerName: customer.name,
        trackingId: createdOrders[0]?.trackingId,
        paymentInfo
      }
    });

  } catch (error) {
    await rollbackTransaction(client);
    console.error("Stripe payment confirmation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process payment",
    });
  }
});

// Stripe webhook handler
router.post("/webhook/stripe", async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];
    const event = await stripeService.handleWebhook(req.body, signature);

    if (process.env.NODE_ENV !== 'production') {
      console.log('Stripe webhook received:', event.type);
    }

    // Handle different webhook events
    switch (event.type) {
      case 'payment_intent.succeeded':
        if (process.env.NODE_ENV !== 'production') {
          console.log('Stripe payment succeeded:', event.data.object.id);
        }
        // Additional processing if needed
        break;
      
      case 'payment_intent.payment_failed':
        if (process.env.NODE_ENV !== 'production') {
          console.log('Stripe payment failed:', event.data.object.id);
        }
        // Handle failed payment
        break;
      
      default:
        if (process.env.NODE_ENV !== 'production') {
          console.log(`Unhandled Stripe event type: ${event.type}`);
        }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    res.status(400).json({ success: false });
  }
});

export default router;
