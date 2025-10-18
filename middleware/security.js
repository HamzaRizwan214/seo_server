import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";

// IP Whitelist for admin access (optional - configure as needed)
const ADMIN_IP_WHITELIST = process.env.ADMIN_IP_WHITELIST?.split(",") || [];

// Security headers middleware
export const securityHeaders = (req, res, next) => {
  // Remove server fingerprinting
  res.removeHeader("X-Powered-By");

  // Additional security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Prevent caching of sensitive data
  if (req.path.includes("/admin/") || req.path.includes("/api/admin/")) {
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }

  next();
};

// Admin IP restriction middleware (optional)
export const adminIPRestriction = (req, res, next) => {
  if (ADMIN_IP_WHITELIST.length === 0) {
    return next(); // Skip if no whitelist configured
  }

  const clientIP =
    req.ip || req.connection.remoteAddress || req.socket.remoteAddress;

  if (!ADMIN_IP_WHITELIST.includes(clientIP)) {
    console.warn(`Unauthorized admin access attempt from IP: ${clientIP}`);
    return res.status(403).json({
      success: false,
      message: "Access denied from this IP address",
    });
  }

  next();
};

// Input sanitization for common attacks
export const sanitizeInput = (req, res, next) => {
  const sanitizeString = (str) => {
    if (typeof str !== "string") return str;

    // Remove potential XSS patterns
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/javascript:/gi, "")
      .replace(/on\w+\s*=/gi, "")
      .replace(/data:text\/html/gi, "")
      .trim();
  };

  const sanitizeObject = (obj) => {
    if (obj && typeof obj === "object") {
      for (const key in obj) {
        if (typeof obj[key] === "string") {
          obj[key] = sanitizeString(obj[key]);
        } else if (typeof obj[key] === "object") {
          sanitizeObject(obj[key]);
        }
      }
    }
  };

  // Sanitize request body
  if (req.body) {
    sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    sanitizeObject(req.query);
  }

  next();
};

// Validation middleware for common inputs
export const validateEmail = body("email")
  .isEmail()
  .normalizeEmail()
  .withMessage("Please provide a valid email address");

export const validatePassword = body("password")
  .isLength({ min: 6 })
  .withMessage("Password must be at least 6 characters long")
  .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  .withMessage(
    "Password must contain at least one uppercase letter, one lowercase letter, and one number"
  );

export const validateOrderInput = [
  body("customer.name")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),
  body("customer.email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email address"),
  body("customer.website")
    .isURL({ protocols: ["http", "https"] })
    .withMessage("Please provide a valid website URL"),
  body("cart")
    .isArray({ min: 1 })
    .withMessage("Cart must contain at least one item"),
];

// Error handling for validation
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }
  next();
};

// Brute force protection for sensitive endpoints
export const bruteForceProtection = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Very restrictive for sensitive operations
  message: {
    success: false,
    message: "Too many attempts, please try again later.",
  },
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
});

// File upload security
export const secureFileUpload = (req, res, next) => {
  if (!req.files) return next();

  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/jpeg",
    "image/png",
    "image/gif",
  ];

  const maxSize = 5 * 1024 * 1024; // 5MB

  for (const fileKey in req.files) {
    const file = req.files[fileKey];

    // Check file type
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: "File type not allowed",
      });
    }

    // Check file size
    if (file.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: "File size too large (max 5MB)",
      });
    }

    // Sanitize filename
    file.name = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  }

  next();
};

// Request logging for security monitoring
export const securityLogger = (req, res, next) => {
  const sensitiveEndpoints = ["/admin/", "/login", "/payment", "/webhook"];
  const isSensitive = sensitiveEndpoints.some((endpoint) =>
    req.path.includes(endpoint)
  );

  if (isSensitive && process.env.NODE_ENV !== "production") {
    console.log(
      `[SECURITY] ${new Date().toISOString()} - ${req.method} ${
        req.path
      } - IP: ${req.ip} - User-Agent: ${req.get("User-Agent")}`
    );
  }

  next();
};

export default {
  securityHeaders,
  adminIPRestriction,
  sanitizeInput,
  validateEmail,
  validatePassword,
  validateOrderInput,
  handleValidationErrors,
  bruteForceProtection,
  secureFileUpload,
  securityLogger,
};
