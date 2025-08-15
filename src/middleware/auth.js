import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Middleware to verify JWT token
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: { message: 'Access token required' }
      });
    }

    // Demo mode handling
    if (req.app.locals.isDemoMode && token.startsWith('demo-token-')) {
      const demoUser = req.app.locals.demoData.users[0];
      req.user = demoUser;
      return next();
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Token refers to non-existent user' }
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: { message: 'Account is deactivated' }
      });
    }

    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        error: { message: 'Account is temporarily locked due to multiple failed login attempts' }
      });
    }

    // Add user to request object
    req.user = user;
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: { message: 'Invalid token' }
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: { message: 'Token expired' }
      });
    }

    return res.status(500).json({
      success: false,
      error: { message: 'Token verification failed' }
    });
  }
};

// Middleware to check user roles
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Access denied. No user context' }
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: { message: `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}` }
      });
    }

    next();
  };
};

// Middleware to check if user can access specific pool
export const canAccessPool = async (req, res, next) => {
  try {
    const { poolId } = req.params;
    const user = req.user;

    // Admins can access all pools
    if (user.role === 'admin') {
      return next();
    }

    // Consultants and technicians can access all pools (for now)
    if (user.role === 'consultant' || user.role === 'technician') {
      return next();
    }

    // Customers can only access their own pools
    if (user.role === 'customer') {
      const Pool = (await import('../models/Pool.js')).default;
      const pool = await Pool.findById(poolId);
      
      if (!pool) {
        return res.status(404).json({
          success: false,
          error: { message: 'Pool not found' }
        });
      }

      if (!pool.owner.equals(user._id)) {
        return res.status(403).json({
          success: false,
          error: { message: 'Access denied. You can only access your own pools' }
        });
      }
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: { message: 'Error checking pool access permissions' }
    });
  }
};

// Optional authentication - continues even if no token provided
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (user && user.isActive && !user.isLocked) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Continue without user context if token is invalid
    next();
  }
};