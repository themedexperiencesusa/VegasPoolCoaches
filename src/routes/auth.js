import express from 'express';
import Joi from 'joi';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  firstName: Joi.string().min(2).max(50).required(),
  lastName: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).max(128).required(),
  phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).optional(),
  role: Joi.string().valid('customer', 'technician', 'consultant').default('customer')
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const resetPasswordSchema = Joi.object({
  email: Joi.string().email().required()
});

const updatePasswordSchema = Joi.object({
  token: Joi.string().required(),
  newPassword: Joi.string().min(6).max(128).required()
});

// @route   POST /api/auth/register
// @desc    Register new user
// @access  Public
router.post('/register', async (req, res, next) => {
  try {
    // Validate input
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    const { firstName, lastName, email, password, phone, role } = value;

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: { message: 'User with this email already exists' }
      });
    }

    // Create new user
    const user = new User({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password,
      phone,
      role
    });

    await user.save();

    // Generate email verification token
    const emailToken = user.generateEmailVerificationToken();
    await user.save();

    // Generate auth token
    const token = user.generateAuthToken();

    // Send welcome response (excluding sensitive data)
    const userResponse = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt
    };

    res.status(201).json({
      success: true,
      data: {
        user: userResponse,
        token,
        message: 'Registration successful! Please check your email to verify your account.'
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res, next) => {
  try {
    // Validate input
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    const { email, password } = value;

    // Find user and include password for comparison
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Invalid email or password' }
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        error: { 
          message: 'Account is temporarily locked due to multiple failed login attempts. Please try again later.' 
        }
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: { message: 'Account is deactivated. Please contact support.' }
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      // Increment failed login attempts
      await user.incLoginAttempts();
      
      return res.status(401).json({
        success: false,
        error: { message: 'Invalid email or password' }
      });
    }

    // Reset login attempts on successful login
    if (user.loginAttempts > 0) {
      await user.resetLoginAttempts();
    }

    // Update last login time
    user.lastLoginAt = new Date();
    await user.save();

    // Generate auth token
    const token = user.generateAuthToken();

    // Send response (excluding sensitive data)
    const userResponse = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      lastLoginAt: user.lastLoginAt,
      subscription: user.subscription
    };

    res.json({
      success: true,
      data: {
        user: userResponse,
        token,
        message: 'Login successful'
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    
    res.json({
      success: true,
      data: { user }
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', authenticateToken, async (req, res, next) => {
  try {
    const updateSchema = Joi.object({
      firstName: Joi.string().min(2).max(50),
      lastName: Joi.string().min(2).max(50),
      phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/),
      preferences: Joi.object({
        notifications: Joi.object({
          email: Joi.boolean(),
          sms: Joi.boolean(),
          maintenanceReminders: Joi.boolean(),
          chemicalAlerts: Joi.boolean()
        }),
        timezone: Joi.string(),
        language: Joi.string()
      }),
      address: Joi.object({
        street: Joi.string(),
        city: Joi.string(),
        state: Joi.string(),
        zipCode: Joi.string()
      })
    });

    const { error, value } = updateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: value },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      data: { user },
      message: 'Profile updated successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { error, value } = resetPasswordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    const { email } = value;
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    // Generate password reset token
    const resetToken = user.generatePasswordResetToken();
    await user.save();

    // TODO: Send email with reset token
    // For now, just return success (in production, integrate with email service)
    
    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
      ...(process.env.NODE_ENV === 'development' && { resetToken }) // Only in dev
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post('/reset-password', async (req, res, next) => {
  try {
    const { error, value } = updatePasswordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    const { token, newPassword } = value;

    // Find user with valid reset token
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid or expired password reset token' }
      });
    }

    // Update password
    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successful. You can now log in with your new password.'
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/verify-email
// @desc    Verify email address
// @access  Public
router.post('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: { message: 'Verification token is required' }
      });
    }

    const user = await User.findOne({ emailVerificationToken: token });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid or expired verification token' }
      });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Email verified successfully!'
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post('/logout', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'Logout successful. Please remove the token from client storage.'
  });
});

export default router;