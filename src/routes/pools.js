import express from 'express';
import Joi from 'joi';
import Pool from '../models/Pool.js';
import { authenticateToken, authorize, canAccessPool } from '../middleware/auth.js';

const router = express.Router();

// Validation schemas
const createPoolSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  address: Joi.object({
    street: Joi.string(),
    city: Joi.string(),
    state: Joi.string(),
    zipCode: Joi.string(),
    coordinates: Joi.object({
      latitude: Joi.number().min(-90).max(90),
      longitude: Joi.number().min(-180).max(180)
    })
  }),
  poolType: Joi.string().valid('inground', 'above_ground', 'spa', 'hot_tub', 'commercial').required(),
  surfaceType: Joi.string().valid('concrete', 'vinyl', 'fiberglass', 'tile', 'other'),
  dimensions: Joi.object({
    length: Joi.number().positive(),
    width: Joi.number().positive(),
    depth: Joi.object({
      shallow: Joi.number().positive(),
      deep: Joi.number().positive()
    }),
    volume: Joi.number().positive()
  }),
  maintenanceSchedule: Joi.object({
    frequency: Joi.string().valid('daily', 'weekly', 'bi-weekly', 'monthly').default('weekly'),
    preferredDay: Joi.string().valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'),
    timeSlot: Joi.string()
  }),
  specialInstructions: Joi.string().max(1000)
});

const waterChemistrySchema = Joi.object({
  pH: Joi.number().min(0).max(14).required(),
  chlorine: Joi.number().min(0).required(),
  alkalinity: Joi.number().min(0).required(),
  hardness: Joi.number().min(0).required(),
  cyanuricAcid: Joi.number().min(0).default(0),
  temperature: Joi.number().required(),
  notes: Joi.string().max(500)
});

const equipmentSchema = Joi.object({
  type: Joi.string().valid('pump', 'filter', 'heater', 'chlorinator', 'vacuum', 'skimmer', 'other').required(),
  brand: Joi.string(),
  model: Joi.string(),
  serialNumber: Joi.string(),
  installDate: Joi.date(),
  lastServiceDate: Joi.date(),
  nextServiceDate: Joi.date(),
  warrantyExpiration: Joi.date(),
  status: Joi.string().valid('working', 'needs_attention', 'broken', 'under_maintenance').default('working'),
  notes: Joi.string().max(500)
});

// @route   GET /api/pools
// @desc    Get all pools (filtered by user role)
// @access  Private
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, poolType, status, search } = req.query;
    
    let query = {};
    
    // Filter based on user role
    if (req.user.role === 'customer') {
      query.owner = req.user._id;
    } else if (req.user.role === 'technician') {
      // Technicians see pools they're assigned to (could add assignment logic)
      query.isActive = true;
    }
    // Admins and consultants see all pools
    
    // Apply additional filters
    if (poolType) query.poolType = poolType;
    if (status !== undefined) query.isActive = status === 'true';
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'address.city': { $regex: search, $options: 'i' } },
        { 'address.zipCode': { $regex: search, $options: 'i' } }
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      populate: [
        { path: 'owner', select: 'firstName lastName email phone' },
        { path: 'createdBy', select: 'firstName lastName' }
      ],
      sort: { createdAt: -1 }
    };

    const pools = await Pool.paginate(query, options);

    res.json({
      success: true,
      data: pools
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/pools/:poolId
// @desc    Get single pool
// @access  Private
router.get('/:poolId', authenticateToken, canAccessPool, async (req, res, next) => {
  try {
    const pool = await Pool.findById(req.params.poolId)
      .populate('owner', 'firstName lastName email phone')
      .populate('createdBy', 'firstName lastName')
      .populate('waterChemistry.testedBy', 'firstName lastName');

    if (!pool) {
      return res.status(404).json({
        success: false,
        error: { message: 'Pool not found' }
      });
    }

    // Add computed properties
    const poolData = pool.toObject();
    poolData.needsAttention = pool.needsAttention();
    poolData.recommendations = pool.getRecommendations();
    poolData.latestWaterChemistry = pool.latestWaterChemistry;

    res.json({
      success: true,
      data: { pool: poolData }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/pools
// @desc    Create new pool
// @access  Private (customers, consultants, admins)
router.post('/', authenticateToken, authorize('customer', 'consultant', 'admin'), async (req, res, next) => {
  try {
    // Validate input
    const { error, value } = createPoolSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    // For customers, owner is themselves; consultants can specify owner
    let ownerId = req.user._id;
    if (req.user.role !== 'customer' && req.body.ownerId) {
      ownerId = req.body.ownerId;
    }

    const pool = new Pool({
      ...value,
      owner: ownerId,
      createdBy: req.user._id
    });

    await pool.save();
    await pool.populate('owner', 'firstName lastName email phone');

    res.status(201).json({
      success: true,
      data: { pool },
      message: 'Pool created successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/pools/:poolId
// @desc    Update pool information
// @access  Private
router.put('/:poolId', authenticateToken, canAccessPool, async (req, res, next) => {
  try {
    const updateSchema = createPoolSchema.fork(['name', 'poolType'], schema => schema.optional());
    
    const { error, value } = updateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    const pool = await Pool.findByIdAndUpdate(
      req.params.poolId,
      { $set: value },
      { new: true, runValidators: true }
    ).populate('owner', 'firstName lastName email phone');

    if (!pool) {
      return res.status(404).json({
        success: false,
        error: { message: 'Pool not found' }
      });
    }

    res.json({
      success: true,
      data: { pool },
      message: 'Pool updated successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/pools/:poolId
// @desc    Delete pool (soft delete)
// @access  Private (owner, consultant, admin)
router.delete('/:poolId', authenticateToken, canAccessPool, async (req, res, next) => {
  try {
    const pool = await Pool.findByIdAndUpdate(
      req.params.poolId,
      { isActive: false },
      { new: true }
    );

    if (!pool) {
      return res.status(404).json({
        success: false,
        error: { message: 'Pool not found' }
      });
    }

    res.json({
      success: true,
      message: 'Pool deactivated successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/pools/:poolId/water-chemistry
// @desc    Add water chemistry reading
// @access  Private
router.post('/:poolId/water-chemistry', authenticateToken, canAccessPool, async (req, res, next) => {
  try {
    const { error, value } = waterChemistrySchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    const pool = await Pool.findById(req.params.poolId);
    if (!pool) {
      return res.status(404).json({
        success: false,
        error: { message: 'Pool not found' }
      });
    }

    const waterChemistry = {
      ...value,
      testedBy: req.user._id,
      testedAt: new Date()
    };

    pool.waterChemistry.push(waterChemistry);
    await pool.save();

    // Get updated pool with latest chemistry
    const updatedPool = await Pool.findById(pool._id)
      .populate('waterChemistry.testedBy', 'firstName lastName');

    const recommendations = updatedPool.getRecommendations();

    res.status(201).json({
      success: true,
      data: { 
        waterChemistry: waterChemistry,
        recommendations 
      },
      message: 'Water chemistry reading added successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/pools/:poolId/water-chemistry
// @desc    Get water chemistry history
// @access  Private
router.get('/:poolId/water-chemistry', authenticateToken, canAccessPool, async (req, res, next) => {
  try {
    const { limit = 10, days = 30 } = req.query;
    
    const pool = await Pool.findById(req.params.poolId)
      .populate('waterChemistry.testedBy', 'firstName lastName');

    if (!pool) {
      return res.status(404).json({
        success: false,
        error: { message: 'Pool not found' }
      });
    }

    // Filter chemistry readings by date range
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

    const readings = pool.waterChemistry
      .filter(reading => reading.testedAt >= cutoffDate)
      .sort((a, b) => new Date(b.testedAt) - new Date(a.testedAt))
      .slice(0, parseInt(limit));

    res.json({
      success: true,
      data: { readings }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/pools/:poolId/equipment
// @desc    Add equipment to pool
// @access  Private
router.post('/:poolId/equipment', authenticateToken, canAccessPool, async (req, res, next) => {
  try {
    const { error, value } = equipmentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    const pool = await Pool.findByIdAndUpdate(
      req.params.poolId,
      { $push: { equipment: value } },
      { new: true, runValidators: true }
    );

    if (!pool) {
      return res.status(404).json({
        success: false,
        error: { message: 'Pool not found' }
      });
    }

    res.status(201).json({
      success: true,
      data: { equipment: pool.equipment[pool.equipment.length - 1] },
      message: 'Equipment added successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/pools/:poolId/equipment/:equipmentId
// @desc    Update equipment status
// @access  Private
router.put('/:poolId/equipment/:equipmentId', authenticateToken, canAccessPool, async (req, res, next) => {
  try {
    const updateEquipmentSchema = equipmentSchema.fork(['type'], schema => schema.optional());
    
    const { error, value } = updateEquipmentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    const pool = await Pool.findOneAndUpdate(
      { 
        _id: req.params.poolId,
        'equipment._id': req.params.equipmentId 
      },
      { 
        $set: Object.keys(value).reduce((acc, key) => {
          acc[`equipment.$.${key}`] = value[key];
          return acc;
        }, {})
      },
      { new: true, runValidators: true }
    );

    if (!pool) {
      return res.status(404).json({
        success: false,
        error: { message: 'Pool or equipment not found' }
      });
    }

    const updatedEquipment = pool.equipment.id(req.params.equipmentId);

    res.json({
      success: true,
      data: { equipment: updatedEquipment },
      message: 'Equipment updated successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/pools/:poolId/recommendations
// @desc    Get AI recommendations for pool
// @access  Private
router.get('/:poolId/recommendations', authenticateToken, canAccessPool, async (req, res, next) => {
  try {
    const pool = await Pool.findById(req.params.poolId);
    if (!pool) {
      return res.status(404).json({
        success: false,
        error: { message: 'Pool not found' }
      });
    }

    const recommendations = pool.getRecommendations();
    const needsAttention = pool.needsAttention();

    res.json({
      success: true,
      data: { 
        recommendations,
        needsAttention,
        latestReading: pool.latestWaterChemistry
      }
    });

  } catch (error) {
    next(error);
  }
});

export default router;