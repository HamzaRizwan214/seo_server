import { body, param, query as expressQuery, validationResult } from 'express-validator';

// Validation error handler
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Order validation rules
export const validateOrderCreation = [
  body('customerName')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Customer name must be between 2 and 255 characters'),
  
  body('customerEmail')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email address is required'),
  
  body('website')
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('Valid website URL is required'),
  
  body('keywords')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Keywords are required and must be less than 1000 characters'),
  
  body('serviceId')
    .isInt({ min: 1 })
    .withMessage('Valid service ID is required'),
  
  body('quantity')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Quantity must be between 1 and 100'),
  
  handleValidationErrors
];

// Payment validation rules
export const validatePaymentCapture = [
  body('paypalOrderId')
    .trim()
    .isLength({ min: 1 })
    .withMessage('PayPal order ID is required'),
  
  body('orderId')
    .isInt({ min: 1 })
    .withMessage('Valid order ID is required'),
  
  handleValidationErrors
];

// Admin login validation
export const validateAdminLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email address is required'),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  
  handleValidationErrors
];

// Order status update validation
export const validateStatusUpdate = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid order ID is required'),
  
  body('status')
    .isIn(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'])
    .withMessage('Invalid status value'),
  
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes must be less than 1000 characters'),
  
  handleValidationErrors
];

// Query parameter validation
export const validateOrderQuery = [
  expressQuery('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  expressQuery('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  expressQuery('status')
    .optional()
    .custom((value) => {
      if (value === '' || value === undefined) return true;
      return ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'].includes(value);
    })
    .withMessage('Invalid status filter'),
  
  expressQuery('payment_status')
    .optional()
    .custom((value) => {
      if (value === '' || value === undefined) return true;
      return ['pending', 'paid', 'failed', 'refunded'].includes(value);
    })
    .withMessage('Invalid payment status filter'),
  
  expressQuery('search')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Search term must be less than 255 characters'),
  
  handleValidationErrors
];

// File upload validation
export const validateFileUpload = (req, res, next) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No files were uploaded'
    });
  }

  const file = req.files.file;
  const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 10485760; // 10MB default
  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'application/pdf',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed'
  ];

  if (file.size > maxSize) {
    return res.status(400).json({
      success: false,
      message: `File size exceeds maximum limit of ${maxSize / 1048576}MB`
    });
  }

  if (!allowedTypes.includes(file.mimetype)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid file type. Allowed types: Excel, PDF, CSV, ZIP'
    });
  }

  next();
};

// Sanitize input data
export const sanitizeInput = (req, res, next) => {
  // Remove any potential XSS attempts
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  };

  const sanitizeObject = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = sanitizeString(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  };

  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  if (req.params) sanitizeObject(req.params);

  next();
};