import express from 'express';
import Joi from 'joi';
import MaintenanceLog from '../models/MaintenanceLog.js';
import Pool from '../models/Pool.js';
import { authenticateToken, authorize, canAccessPool } from '../middleware/auth.js';

const router = express.Router();

// Validation schemas
const createMaintenanceSchema = Joi.object({
  pool: Joi.string().required(),
  scheduledDate: Joi.date().required(),
  type: Joi.string().valid('routine', 'emergency', 'seasonal', 'repair', 'inspection', 'custom').default('routine'),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent').default('normal'),
  tasks: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    description: Joi.string(),
    category: Joi.string().valid('cleaning', 'chemical', 'equipment', 'inspection', 'repair', 'other').required(),
    estimatedDuration: Joi.number().positive()
  })).default([]),
  notes: Joi.string().max(1000),
  isEmergency: Joi.boolean().default(false)
});

const updateMaintenanceSchema = Joi.object({
  status: Joi.string().valid('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show'),
  actualStartTime: Joi.date(),
  actualEndTime: Joi.date(),
  tasks: Joi.array().items(Joi.object({
    _id: Joi.string(),
    name: Joi.string(),
    description: Joi.string(),
    category: Joi.string().valid('cleaning', 'chemical', 'equipment', 'inspection', 'repair', 'other'),
    status: Joi.string().valid('pending', 'in_progress', 'completed', 'skipped', 'failed'),
    actualDuration: Joi.number().positive(),
    notes: Joi.string(),
    completedAt: Joi.date()
  })),
  waterChemistryBefore: Joi.object({
    pH: Joi.number().min(0).max(14),
    chlorine: Joi.number().min(0),
    alkalinity: Joi.number().min(0),
    hardness: Joi.number().min(0),
    cyanuricAcid: Joi.number().min(0),
    temperature: Joi.number()
  }),
  waterChemistryAfter: Joi.object({
    pH: Joi.number().min(0).max(14),
    chlorine: Joi.number().min(0),
    alkalinity: Joi.number().min(0),
    hardness: Joi.number().min(0),
    cyanuricAcid: Joi.number().min(0),
    temperature: Joi.number()
  }),
  chemicalsUsed: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    amount: Joi.number().positive().required(),
    unit: Joi.string().required(),
    cost: Joi.number().positive(),
    notes: Joi.string()
  })),
  issues: Joi.array().items(Joi.object({
    type: Joi.string().valid('equipment', 'water_quality', 'structural', 'safety', 'other').required(),
    severity: Joi.string().valid('minor', 'moderate', 'major', 'critical').required(),
    description: Joi.string().required(),
    resolution: Joi.string(),
    followUpRequired: Joi.boolean().default(false),
    followUpDate: Joi.date()
  })),
  recommendations: Joi.array().items(Joi.object({
    type: Joi.string().valid('immediate', 'within_week', 'within_month', 'seasonal', 'annual').required(),
    category: Joi.string().required(),
    description: Joi.string().required(),
    estimatedCost: Joi.number().positive(),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium')
  })),
  customerFeedback: Joi.object({
    rating: Joi.number().min(1).max(5),
    comments: Joi.string(),
    concerns: Joi.string()
  }),
  timeSpent: Joi.object({
    travel: Joi.number().positive(),
    onSite: Joi.number().positive()
  }),
  notes: Joi.string().max(2000),
  internalNotes: Joi.string().max(2000)
});

// @route   GET /api/maintenance
// @desc    Get maintenance logs (filtered by user role)
// @access  Private
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      type, 
      priority, 
      poolId, 
      technicianId,
      startDate,
      endDate 
    } = req.query;

    // Demo mode handling
    if (req.app.locals.isDemoMode) {
      const demoMaintenance = req.app.locals.demoData.maintenance || [];
      return res.json({
        success: true,
        data: {
          docs: demoMaintenance,
          totalDocs: demoMaintenance.length,
          limit: parseInt(limit),
          page: parseInt(page),
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false
        }
      });
    }

    let query = {};

    // Filter based on user role
    if (req.user.role === 'customer') {
      // Customers see maintenance for their pools only
      const userPools = await Pool.find({ owner: req.user._id }).select('_id');
      query.pool = { $in: userPools.map(p => p._id) };
    } else if (req.user.role === 'technician') {
      // Technicians see their assigned maintenance
      query.technician = req.user._id;
    }
    // Consultants and admins see all maintenance

    // Apply filters
    if (status) query.status = status;
    if (type) query.type = type;
    if (priority) query.priority = priority;
    if (poolId) query.pool = poolId;
    if (technicianId) query.technician = technicianId;

    // Date range filter
    if (startDate || endDate) {
      query.scheduledDate = {};
      if (startDate) query.scheduledDate.$gte = new Date(startDate);
      if (endDate) query.scheduledDate.$lte = new Date(endDate);
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      populate: [
        { path: 'pool', select: 'name address poolType owner' },
        { path: 'technician', select: 'firstName lastName phone email' }
      ],
      sort: { scheduledDate: -1 }
    };

    const maintenance = await MaintenanceLog.paginate(query, options);

    // Add computed properties
    const maintenanceWithStats = maintenance.docs.map(log => {
      const logObj = log.toObject();
      logObj.completionPercentage = log.completionPercentage;
      logObj.qualityScore = log.calculateQualityScore();
      logObj.isOverdue = log.isOverdue();
      logObj.summary = log.generateSummary();
      return logObj;
    });

    res.json({
      success: true,
      data: {
        ...maintenance,
        docs: maintenanceWithStats
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/maintenance/:maintenanceId
// @desc    Get single maintenance log
// @access  Private
router.get('/:maintenanceId', authenticateToken, async (req, res, next) => {
  try {
    const maintenance = await MaintenanceLog.findById(req.params.maintenanceId)
      .populate('pool', 'name address poolType owner')
      .populate('technician', 'firstName lastName phone email profile.avatar');

    if (!maintenance) {
      return res.status(404).json({
        success: false,
        error: { message: 'Maintenance log not found' }
      });
    }

    // Check access permissions
    if (req.user.role === 'customer') {
      const pool = await Pool.findById(maintenance.pool._id || maintenance.pool);
      if (!pool.owner.equals(req.user._id)) {
        return res.status(403).json({
          success: false,
          error: { message: 'Access denied' }
        });
      }
    } else if (req.user.role === 'technician') {
      if (!maintenance.technician._id.equals(req.user._id)) {
        return res.status(403).json({
          success: false,
          error: { message: 'Access denied. You can only view your own maintenance logs' }
        });
      }
    }

    // Add computed properties
    const maintenanceData = maintenance.toObject();
    maintenanceData.completionPercentage = maintenance.completionPercentage;
    maintenanceData.qualityScore = maintenance.calculateQualityScore();
    maintenanceData.isOverdue = maintenance.isOverdue();
    maintenanceData.summary = maintenance.generateSummary();
    maintenanceData.totalDuration = maintenance.totalDuration;

    res.json({
      success: true,
      data: { maintenance: maintenanceData }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/maintenance
// @desc    Create new maintenance log
// @access  Private (technicians, consultants, admins)
router.post('/', authenticateToken, authorize('technician', 'consultant', 'admin'), async (req, res, next) => {
  try {
    const { error, value } = createMaintenanceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    // Verify pool exists and user has access
    const pool = await Pool.findById(value.pool);
    if (!pool) {
      return res.status(404).json({
        success: false,
        error: { message: 'Pool not found' }
      });
    }

    // For technicians, assign to themselves; others can specify technician
    let technicianId = req.user._id;
    if (req.user.role !== 'technician' && req.body.technicianId) {
      technicianId = req.body.technicianId;
    }

    const maintenance = new MaintenanceLog({
      ...value,
      technician: technicianId
    });

    await maintenance.save();
    await maintenance.populate([
      { path: 'pool', select: 'name address poolType owner' },
      { path: 'technician', select: 'firstName lastName phone email' }
    ]);

    res.status(201).json({
      success: true,
      data: { maintenance },
      message: 'Maintenance scheduled successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/maintenance/:maintenanceId
// @desc    Update maintenance log
// @access  Private
router.put('/:maintenanceId', authenticateToken, async (req, res, next) => {
  try {
    const maintenance = await MaintenanceLog.findById(req.params.maintenanceId);
    
    if (!maintenance) {
      return res.status(404).json({
        success: false,
        error: { message: 'Maintenance log not found' }
      });
    }

    // Check permissions
    if (req.user.role === 'technician' && !maintenance.technician.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You can only update your own maintenance logs' }
      });
    }

    if (req.user.role === 'customer') {
      // Customers can only update feedback
      const allowedFields = ['customerFeedback'];
      const updates = Object.keys(req.body);
      const isValidUpdate = updates.every(update => allowedFields.includes(update));
      
      if (!isValidUpdate) {
        return res.status(403).json({
          success: false,
          error: { message: 'Customers can only update feedback' }
        });
      }
    }

    const { error, value } = updateMaintenanceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    // If maintenance is being completed, update pool water chemistry
    if (value.status === 'completed' && value.waterChemistryAfter) {
      const pool = await Pool.findById(maintenance.pool);
      if (pool) {
        pool.waterChemistry.push({
          ...value.waterChemistryAfter,
          testedBy: req.user._id,
          testedAt: new Date(),
          notes: 'Recorded during maintenance'
        });
        await pool.save();
      }
    }

    const updatedMaintenance = await MaintenanceLog.findByIdAndUpdate(
      req.params.maintenanceId,
      { $set: value },
      { new: true, runValidators: true }
    ).populate([
      { path: 'pool', select: 'name address poolType owner' },
      { path: 'technician', select: 'firstName lastName phone email' }
    ]);

    // Add computed properties
    const maintenanceData = updatedMaintenance.toObject();
    maintenanceData.completionPercentage = updatedMaintenance.completionPercentage;
    maintenanceData.qualityScore = updatedMaintenance.calculateQualityScore();
    maintenanceData.summary = updatedMaintenance.generateSummary();

    res.json({
      success: true,
      data: { maintenance: maintenanceData },
      message: 'Maintenance log updated successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/maintenance/:maintenanceId
// @desc    Cancel maintenance
// @access  Private (technician, consultant, admin)
router.delete('/:maintenanceId', authenticateToken, async (req, res, next) => {
  try {
    const maintenance = await MaintenanceLog.findById(req.params.maintenanceId);
    
    if (!maintenance) {
      return res.status(404).json({
        success: false,
        error: { message: 'Maintenance log not found' }
      });
    }

    // Check permissions
    if (req.user.role === 'technician' && !maintenance.technician.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied' }
      });
    }

    // Don't allow deletion of completed maintenance
    if (maintenance.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: { message: 'Cannot cancel completed maintenance' }
      });
    }

    maintenance.status = 'cancelled';
    await maintenance.save();

    res.json({
      success: true,
      message: 'Maintenance cancelled successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/maintenance/schedule/:poolId
// @desc    Get maintenance schedule for a pool
// @access  Private
router.get('/schedule/:poolId', authenticateToken, canAccessPool, async (req, res, next) => {
  try {
    const { months = 3 } = req.query;
    
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + parseInt(months));

    const scheduledMaintenance = await MaintenanceLog.find({
      pool: req.params.poolId,
      scheduledDate: { $gte: startDate, $lte: endDate },
      status: { $in: ['scheduled', 'in_progress'] }
    })
    .populate('technician', 'firstName lastName phone')
    .sort({ scheduledDate: 1 });

    const overdueMaintenance = await MaintenanceLog.find({
      pool: req.params.poolId,
      scheduledDate: { $lt: startDate },
      status: 'scheduled'
    })
    .populate('technician', 'firstName lastName phone')
    .sort({ scheduledDate: 1 });

    res.json({
      success: true,
      data: {
        upcoming: scheduledMaintenance,
        overdue: overdueMaintenance,
        period: {
          start: startDate,
          end: endDate
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/maintenance/analytics
// @desc    Get maintenance analytics
// @access  Private (consultants, admins)
router.get('/analytics', authenticateToken, authorize('consultant', 'admin'), async (req, res, next) => {
  try {
    const { startDate, endDate, poolId, technicianId } = req.query;
    
    let matchQuery = {};
    
    if (startDate || endDate) {
      matchQuery.scheduledDate = {};
      if (startDate) matchQuery.scheduledDate.$gte = new Date(startDate);
      if (endDate) matchQuery.scheduledDate.$lte = new Date(endDate);
    }
    
    if (poolId) matchQuery.pool = mongoose.Types.ObjectId(poolId);
    if (technicianId) matchQuery.technician = mongoose.Types.ObjectId(technicianId);

    const analytics = await MaintenanceLog.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalMaintenance: { $sum: 1 },
          completedMaintenance: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          cancelledMaintenance: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          },
          avgQualityScore: { $avg: '$qualityScore' },
          totalIssues: { $sum: { $size: { $ifNull: ['$issues', []] } } },
          totalRecommendations: { $sum: { $size: { $ifNull: ['$recommendations', []] } } },
          avgTimeSpent: { $avg: '$timeSpent.total' }
        }
      }
    ]);

    // Get maintenance by type
    const maintenanceByType = await MaintenanceLog.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          avgQualityScore: { $avg: '$qualityScore' }
        }
      }
    ]);

    // Get monthly trends
    const monthlyTrends = await MaintenanceLog.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            year: { $year: '$scheduledDate' },
            month: { $month: '$scheduledDate' }
          },
          count: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          avgQualityScore: { $avg: '$qualityScore' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.json({
      success: true,
      data: {
        summary: analytics[0] || {
          totalMaintenance: 0,
          completedMaintenance: 0,
          cancelledMaintenance: 0,
          avgQualityScore: 0,
          totalIssues: 0,
          totalRecommendations: 0,
          avgTimeSpent: 0
        },
        byType: maintenanceByType,
        monthlyTrends
      }
    });

  } catch (error) {
    next(error);
  }
});

export default router;