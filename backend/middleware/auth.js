const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Authentication middleware
 * Verifies JWT token and adds user info to request object
 */
const auth = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'No token provided, authorization denied'
      });
    }

    // Check if token starts with 'Bearer '
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token format'
      });
    }

    // Extract token
    const token = authHeader.substring(7);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided, authorization denied'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    // Check if user exists and is active
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    // Add user info to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name
    };

    next();

  } catch (error) {
    console.error('Auth middleware error:', error);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Optional authentication middleware
 * Adds user info if token is provided, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const user = await User.findById(decoded.id);
    
    if (user && user.isActive) {
      req.user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name
      };
    }

    next();

  } catch (error) {
    // If token is invalid, just continue without user info
    next();
  }
};

/**
 * Admin authentication middleware
 * Requires user to be authenticated and have admin role
 */
const adminAuth = async (req, res, next) => {
  try {
    // First run regular auth
    await new Promise((resolve, reject) => {
      auth(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Check if user has admin role
    const user = await User.findById(req.user.id);
    if (!user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    next();

  } catch (error) {
    console.error('Admin auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Admin authentication failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Rate limiting by user ID
 * Limits requests per user rather than per IP
 */
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const userRequests = new Map();

  return (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const userId = req.user.id;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get user's request history
    let userRequestHistory = userRequests.get(userId) || [];

    // Remove old requests outside the window
    userRequestHistory = userRequestHistory.filter(timestamp => timestamp > windowStart);

    // Check if user has exceeded the limit
    if (userRequestHistory.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests, please try again later',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }

    // Add current request
    userRequestHistory.push(now);
    userRequests.set(userId, userRequestHistory);

    // Clean up old entries periodically
    if (Math.random() < 0.01) { // 1% chance
      const cutoff = now - windowMs * 2;
      for (const [id, history] of userRequests.entries()) {
        const filteredHistory = history.filter(timestamp => timestamp > cutoff);
        if (filteredHistory.length === 0) {
          userRequests.delete(id);
        } else {
          userRequests.set(id, filteredHistory);
        }
      }
    }

    next();
  };
};

/**
 * Validate request body middleware
 * Ensures required fields are present
 */
const validateBody = (requiredFields) => {
  return (req, res, next) => {
    const missingFields = [];

    for (const field of requiredFields) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        missingFields
      });
    }

    next();
  };
};

/**
 * Sanitize request body middleware
 * Removes potentially dangerous fields
 */
const sanitizeBody = (allowedFields) => {
  return (req, res, next) => {
    if (allowedFields) {
      const sanitizedBody = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          sanitizedBody[field] = req.body[field];
        }
      }
      req.body = sanitizedBody;
    }

    // Remove common dangerous fields
    delete req.body._id;
    delete req.body.__v;
    delete req.body.createdAt;
    delete req.body.updatedAt;

    next();
  };
};

/**
 * Error handler middleware for async routes
 * Catches async errors and passes them to error handler
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  auth,
  optionalAuth,
  adminAuth,
  userRateLimit,
  validateBody,
  sanitizeBody,
  asyncHandler
};