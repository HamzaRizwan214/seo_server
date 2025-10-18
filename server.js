import dns from "dns";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import rateLimit from "express-rate-limit";
import fileUpload from "express-fileupload";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Force IPv4 connections to avoid IPv6 issues on Render
dns.setDefaultResultOrder('ipv4first');

// Import configurations and services
import { testConnection, closePool } from "./config/database.js";
import { emailService } from "./services/email.js";
import { paypalService } from "./services/paypal.js";
import { stripeService } from "./services/stripe.js";
import { sanitizeInput } from "./middleware/validation.js";
import { 
  securityHeaders, 
  sanitizeInput as enhancedSanitize, 
  securityLogger,
  secureFileUpload 
} from "./middleware/security.js";
import { authenticateAdmin } from "./middleware/auth.js";

// Import routes
import orderRoutes from "./routes/orders.js";
import adminRoutes from "./routes/admin.js";

// Load environment variables
dotenv.config();


// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express app
const app = express();
const PORT = process.env.PORT || 3005;

// Enhanced Security middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'", "https://js.stripe.com", "https://www.paypal.com"],
        imgSrc: ["'self'", "data:", "https:", "https://cdn.sanity.io"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "https://api.stripe.com", "https://api.paypal.com"],
        frameSrc: ["https://js.stripe.com", "https://www.paypal.com"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
  })
);

// Hide server information
app.disable('x-powered-by');

// CORS configuration
const corsOptions = {
  origin: [
    process.env.FRONTEND_URL || "http://localhost:3000",
    process.env.ADMIN_URL || "http://localhost:5174",
    "http://localhost:3000",
    "http://localhost:3002",
    "http://localhost:5174",
    "http://localhost:5173",
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

app.use(cors(corsOptions));

// Enhanced Rate limiting with different tiers
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // General API requests
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Payment requests (more restrictive)
  message: {
    success: false,
    message: "Too many payment attempts, please try again later.",
  },
  skipSuccessfulRequests: true,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Login attempts (most restrictive)
  message: {
    success: false,
    message: "Too many login attempts, please try again later.",
  },
  skipSuccessfulRequests: true,
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Admin operations
  message: {
    success: false,
    message: "Too many admin requests, please try again later.",
  },
});

// Apply rate limiters
app.use("/api/", generalLimiter);
app.use("/api/admin/login", authLimiter);
app.use("/api/admin/", adminLimiter);
app.use("/api/orders/create-payment-intent", paymentLimiter);
app.use("/api/orders/confirm-stripe-payment", paymentLimiter);
app.use("/api/paypal/", paymentLimiter);

// Stripe webhook needs raw body, so we handle it before other middleware
app.use(
  "/api/orders/webhook/stripe",
  express.raw({ type: "application/json" })
);

// Middleware
app.use(compression());

// Enhanced logging for production
const morganFormat = process.env.NODE_ENV === 'production' 
  ? 'combined' 
  : 'dev';
app.use(morgan(morganFormat));

// Body parsing with security limits
app.use(express.json({ 
  limit: "1mb", // Reduced from 10mb for security
  verify: (req, res, buf) => {
    // Store raw body for webhook verification
    if (req.originalUrl.includes('/webhook/')) {
      req.rawBody = buf;
    }
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: "1mb",
  parameterLimit: 100 // Limit number of parameters
}));

// File upload middleware
app.use(
  fileUpload({
    limits: {
      fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB default
    },
    abortOnLimit: true,
    responseOnLimit: {
      success: false,
      message: "File size exceeds maximum limit",
    },
  })
);

// Enhanced security middleware
app.use(securityHeaders);
app.use(securityLogger);
app.use(enhancedSanitize);
app.use(sanitizeInput);

// Create uploads directory if it doesn't exist
import fs from "fs";
const uploadsDir = path.join(__dirname, process.env.UPLOAD_DIR || "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve static files (uploads)
app.use("/uploads", express.static(uploadsDir));

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    const dbStatus = await testConnection();
    const emailStatus = await emailService.testConnection();
    const paypalStatus = await paypalService.testConnection();
    const stripeStatus = await stripeService.testConnection();

    const health = {
      status: "OK",
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus ? "healthy" : "unhealthy",
        email: emailStatus ? "healthy" : "unhealthy",
        paypal: paypalStatus ? "healthy" : "unhealthy",
        stripe: stripeStatus ? "healthy" : "unhealthy",
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || "1.0.0",
    };

    const overallHealthy =
      dbStatus && emailStatus && paypalStatus && stripeStatus;
    res.status(overallHealthy ? 200 : 503).json(health);
  } catch (error) {
    res.status(503).json({
      status: "ERROR",
      message: "Health check failed",
      error: error.message,
    });
  }
});

// API Routes
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);

// File upload endpoint for deliverables (secured)
app.post("/api/admin/orders/:orderId/deliverables", 
  authenticateAdmin, 
  secureFileUpload, 
  async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No files were uploaded",
      });
    }

    const { orderId } = req.params;
    const file = req.files.file;

    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `${timestamp}-${file.name}`;
    const filePath = path.join(uploadsDir, fileName);

    // Move file to uploads directory
    await file.mv(filePath);

    // Save file info to database
    const { query } = await import("./config/database.js");
    await query(
      "INSERT INTO deliverables (order_id, file_name, file_path, file_type, file_size, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6)",
      [orderId, file.name, fileName, file.mimetype, file.size, req.admin?.id]
    );

    res.json({
      success: true,
      message: "File uploaded successfully",
      data: {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.mimetype,
      },
    });
  } catch (error) {
    console.error("File upload error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upload file",
    });
  }
});

// Send deliverables via email (secured)
app.post("/api/admin/orders/:orderId/send-deliverables", 
  authenticateAdmin, 
  async (req, res) => {
  try {
    const { orderId } = req.params;

    const { query } = await import("./config/database.js");

    // Get order and customer details
    const orderResult = await query(
      `
      SELECT o.*, c.name as customer_name, c.email as customer_email
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.id = $1
    `,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const order = orderResult.rows[0];

    // Get deliverables
    const deliverablesResult = await query(
      "SELECT * FROM deliverables WHERE order_id = $1",
      [orderId]
    );

    if (deliverablesResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No deliverables found for this order",
      });
    }

    // Prepare attachments
    const attachments = deliverablesResult.rows.map((deliverable) => ({
      filename: deliverable.file_name,
      path: path.join(uploadsDir, deliverable.file_path),
    }));

    // Send email with deliverables
    await emailService.sendDeliverable(
      order.customer_email,
      {
        trackingId: order.tracking_id,
        customerName: order.customer_name,
        serviceName: order.service_name,
      },
      attachments
    );

    // Update order status to completed
    await query(
      "UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      ["completed", orderId]
    );

    // Add status history
    await query(
      "INSERT INTO order_status_history (order_id, status, notes, changed_by) VALUES ($1, $2, $3, $4)",
      [orderId, "completed", "Deliverables sent to customer", req.admin?.id]
    );

    res.json({
      success: true,
      message: "Deliverables sent successfully",
    });
  } catch (error) {
    console.error("Send deliverables error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send deliverables",
    });
  }
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error("Global error handler:", error);

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === "development";

  res.status(error.status || 500).json({
    success: false,
    message: error.message || "Internal server error",
    ...(isDevelopment && { stack: error.stack }),
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n📡 Received ${signal}. Starting graceful shutdown...`);

  try {
    // Close database connections
    await closePool();

    // Close server
    server.close(() => {
      console.log("✅ Server closed successfully");
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      console.log("❌ Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Start server
const server = app.listen(PORT, async () => {
  console.log("\n🚀 SEO Order Management Server Starting...\n");

  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error("❌ Database connection failed. Exiting...");
    process.exit(1);
  }

  // Test email service
  try {
    const emailConnected = await emailService.testConnection();
    if (!emailConnected) {
      console.warn(
        "⚠️  Email service connection failed. Email features may not work."
      );
    }
  } catch (error) {
    console.warn("⚠️  Email service disabled for development");
  }

  // Test PayPal service
  try {
    const paypalConnected = await paypalService.testConnection();
    if (!paypalConnected) {
      console.warn(
        "⚠️  PayPal service connection failed. Payment features may not work."
      );
    }
  } catch (error) {
    console.warn("⚠️  PayPal service disabled for development");
  }

  // Test Stripe service
  try {
    const stripeConnected = await stripeService.testConnection();
    if (!stripeConnected) {
      console.warn(
        "⚠️  Stripe service connection failed. Payment features may not work."
      );
    }
  } catch (error) {
    console.warn("⚠️  Stripe service disabled for development");
  }

  console.log(`\n✅ Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`📋 API Base URL: http://localhost:${PORT}/api`);
  console.log(
    `🔧 Admin Panel: ${process.env.ADMIN_URL || "http://localhost:3002"}`
  );
  console.log(
    `🛒 Frontend: ${process.env.FRONTEND_URL || "http://localhost:3000"}\n`
  );
});

export default app;
