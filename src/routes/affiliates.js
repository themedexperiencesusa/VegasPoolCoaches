import express from 'express';
import Joi from 'joi';
import { authenticateToken, authorize } from '../middleware/auth.js';
import { 
  AffiliatePartner, 
  SponsorshipPackage, 
  SponsorshipAgreement, 
  ReferralTracking,
  YoutubeIntegration,
  defaultSponsorshipPackages 
} from '../models/Affiliate.js';

const router = express.Router();

// Validation schemas
const affiliateRegistrationSchema = Joi.object({
  businessName: Joi.string().required(),
  legalBusinessName: Joi.string(),
  businessType: Joi.string().valid('pool_repair', 'equipment_supplier', 'chemical_supplier', 'pool_builder', 'landscaping', 'solar', 'other').required(),
  contactInfo: Joi.object({
    primaryContact: Joi.object({
      name: Joi.string().required(),
      title: Joi.string(),
      email: Joi.string().email().required(),
      phone: Joi.string()
    }).required(),
    businessAddress: Joi.object({
      street: Joi.string(),
      city: Joi.string(),
      state: Joi.string(),
      zipCode: Joi.string(),
      country: Joi.string().default('USA')
    }),
    website: Joi.string().uri(),
    socialMedia: Joi.object({
      facebook: Joi.string(),
      instagram: Joi.string(),
      linkedin: Joi.string(),
      youtube: Joi.string()
    })
  }).required(),
  businessDetails: Joi.object({
    yearsInBusiness: Joi.number(),
    numberOfEmployees: Joi.string(),
    serviceAreas: Joi.array().items(Joi.string()),
    specializations: Joi.array().items(Joi.string()),
    certifications: Joi.array().items(Joi.string())
  })
});

const referralSchema = Joi.object({
  clientId: Joi.string().required(),
  assessmentId: Joi.string(),
  serviceCategory: Joi.string().valid('equipment_repair', 'chemical_service', 'cleaning', 'construction', 'emergency', 'consultation').required(),
  urgency: Joi.string().valid('low', 'medium', 'high', 'emergency').default('medium'),
  estimatedValue: Joi.number(),
  notes: Joi.string()
});

// @route   POST /api/affiliates/register
// @desc    Register as affiliate partner
// @access  Public
router.post('/register', async (req, res, next) => {
  try {
    const { error, value } = affiliateRegistrationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    // Check if business already exists
    const existingAffiliate = await AffiliatePartner.findOne({
      $or: [
        { businessName: value.businessName },
        { 'contactInfo.primaryContact.email': value.contactInfo.primaryContact.email }
      ]
    });

    if (existingAffiliate) {
      return res.status(409).json({
        success: false,
        error: { message: 'Business or email already registered' }
      });
    }

    const affiliate = new AffiliatePartner(value);
    await affiliate.save();

    res.status(201).json({
      success: true,
      data: {
        affiliate,
        message: 'Registration submitted successfully. We will review your application and contact you within 2-3 business days.'
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/affiliates
// @desc    Get affiliate partners
// @access  Private (Admin/Consultant only)
router.get('/', authenticateToken, authorize(['admin', 'consultant']), async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      businessType, 
      serviceArea 
    } = req.query;

    let query = {};
    if (status) query.status = status;
    if (businessType) query.businessType = businessType;
    if (serviceArea) query['businessDetails.serviceAreas'] = serviceArea;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 }
    };

    const affiliates = await AffiliatePartner.paginate(query, options);

    res.json({
      success: true,
      data: affiliates
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/affiliates/:affiliateId
// @desc    Get specific affiliate details
// @access  Private
router.get('/:affiliateId', authenticateToken, async (req, res, next) => {
  try {
    const affiliate = await AffiliatePartner.findById(req.params.affiliateId);
    
    if (!affiliate) {
      return res.status(404).json({
        success: false,
        error: { message: 'Affiliate not found' }
      });
    }

    res.json({
      success: true,
      data: { affiliate }
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/affiliates/:affiliateId/status
// @desc    Update affiliate status
// @access  Private (Admin only)
router.put('/:affiliateId/status', authenticateToken, authorize(['admin']), async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    
    const affiliate = await AffiliatePartner.findById(req.params.affiliateId);
    if (!affiliate) {
      return res.status(404).json({
        success: false,
        error: { message: 'Affiliate not found' }
      });
    }

    affiliate.status = status;
    if (notes) affiliate.notes = notes;
    if (status === 'active') affiliate.agreementDate = new Date();

    await affiliate.save();

    res.json({
      success: true,
      data: { affiliate }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/affiliates/:affiliateId/referral
// @desc    Create referral to affiliate
// @access  Private (Admin/Consultant only)
router.post('/:affiliateId/referral', authenticateToken, authorize(['admin', 'consultant']), async (req, res, next) => {
  try {
    const { error, value } = referralSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    const affiliate = await AffiliatePartner.findById(req.params.affiliateId);
    if (!affiliate || affiliate.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: { message: 'Affiliate not available for referrals' }
      });
    }

    const referral = new ReferralTracking({
      affiliate: req.params.affiliateId,
      ...value,
      referralType: 'manual'
    });

    await referral.save();

    // Update affiliate metrics
    affiliate.performanceMetrics.totalReferrals += 1;
    affiliate.lastActivityDate = new Date();
    await affiliate.save();

    res.status(201).json({
      success: true,
      data: { referral }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/affiliates/:affiliateId/referrals
// @desc    Get referrals for affiliate
// @access  Private
router.get('/:affiliateId/referrals', authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    
    let query = { affiliate: req.params.affiliateId };
    if (status) query.status = status;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      populate: [
        { path: 'client', select: 'firstName lastName email phone' },
        { path: 'assessment', select: 'aiAnalysis.overallScore aiAnalysis.riskLevel' }
      ],
      sort: { createdAt: -1 }
    };

    const referrals = await ReferralTracking.paginate(query, options);

    res.json({
      success: true,
      data: referrals
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/affiliates/referral/:referralId
// @desc    Update referral status
// @access  Private
router.put('/referral/:referralId', authenticateToken, async (req, res, next) => {
  try {
    const { status, actualValue, clientFeedback, notes } = req.body;
    
    const referral = await ReferralTracking.findById(req.params.referralId);
    if (!referral) {
      return res.status(404).json({
        success: false,
        error: { message: 'Referral not found' }
      });
    }

    // Update referral
    if (status) referral.status = status;
    if (actualValue) referral.actualValue = actualValue;
    if (clientFeedback) referral.clientFeedback = clientFeedback;
    if (notes) referral.notes = notes;

    // Calculate commission if completed
    if (status === 'completed' && actualValue) {
      const affiliate = await AffiliatePartner.findById(referral.affiliate);
      if (affiliate) {
        referral.commissionEarned = actualValue * affiliate.partnershipTerms.commissionRate;
        
        // Update affiliate metrics
        affiliate.performanceMetrics.successfulReferrals += 1;
        affiliate.performanceMetrics.totalRevenue += actualValue;
        await affiliate.save();
      }
    }

    await referral.save();

    res.json({
      success: true,
      data: { referral }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/affiliates/packages
// @desc    Get sponsorship packages
// @access  Public
router.get('/packages', async (req, res, next) => {
  try {
    const packages = await SponsorshipPackage.find({ isActive: true }).sort({ tier: 1 });
    
    res.json({
      success: true,
      data: { packages }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/affiliates/:affiliateId/sponsorship
// @desc    Create sponsorship agreement
// @access  Private (Admin only)
router.post('/:affiliateId/sponsorship', authenticateToken, authorize(['admin']), async (req, res, next) => {
  try {
    const { packageId, customTerms, contractDetails } = req.body;
    
    const affiliate = await AffiliatePartner.findById(req.params.affiliateId);
    if (!affiliate) {
      return res.status(404).json({
        success: false,
        error: { message: 'Affiliate not found' }
      });
    }

    const package = await SponsorshipPackage.findById(packageId);
    if (!package || !package.isActive) {
      return res.status(404).json({
        success: false,
        error: { message: 'Sponsorship package not found' }
      });
    }

    const agreement = new SponsorshipAgreement({
      sponsor: req.params.affiliateId,
      package: packageId,
      customTerms,
      contractDetails
    });

    await agreement.save();

    res.status(201).json({
      success: true,
      data: { agreement }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/affiliates/:affiliateId/analytics
// @desc    Get affiliate performance analytics
// @access  Private
router.get('/:affiliateId/analytics', authenticateToken, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    const affiliate = await AffiliatePartner.findById(req.params.affiliateId);
    if (!affiliate) {
      return res.status(404).json({
        success: false,
        error: { message: 'Affiliate not found' }
      });
    }

    // Build date filter
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    // Get referral analytics
    const referralStats = await ReferralTracking.aggregate([
      { $match: { affiliate: affiliate._id, ...dateFilter } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalValue: { $sum: '$actualValue' },
          avgValue: { $avg: '$actualValue' }
        }
      }
    ]);

    // Get monthly trends
    const monthlyTrends = await ReferralTracking.aggregate([
      { $match: { affiliate: affiliate._id, ...dateFilter } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          referrals: { $sum: 1 },
          revenue: { $sum: '$actualValue' },
          commissions: { $sum: '$commissionEarned' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const analytics = {
      affiliate: affiliate.businessName,
      performanceMetrics: affiliate.performanceMetrics,
      referralBreakdown: referralStats,
      monthlyTrends,
      conversionRate: affiliate.performanceMetrics.totalReferrals > 0 
        ? affiliate.performanceMetrics.successfulReferrals / affiliate.performanceMetrics.totalReferrals 
        : 0
    };

    res.json({
      success: true,
      data: { analytics }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/affiliates/youtube/integration
// @desc    Setup YouTube integration
// @access  Private (Admin only)
router.post('/youtube/integration', authenticateToken, authorize(['admin']), async (req, res, next) => {
  try {
    const { channelId, channelName, apiKey, contentCategories } = req.body;
    
    // Check if integration already exists
    const existingIntegration = await YoutubeIntegration.findOne({ channelId });
    if (existingIntegration) {
      return res.status(409).json({
        success: false,
        error: { message: 'YouTube channel already integrated' }
      });
    }

    const integration = new YoutubeIntegration({
      channelId,
      channelName,
      apiKey,
      contentCategories: contentCategories || [
        {
          name: 'Pool Maintenance Tips',
          description: 'Weekly maintenance advice from historical characters',
          characters: ['Zeus', 'Cleopatra'],
          keywords: ['maintenance', 'cleaning', 'weekly'],
          sponsorOpportunities: true
        },
        {
          name: 'Equipment Troubleshooting',
          description: 'Technical advice from equipment specialists',
          characters: ['Poseidon'],
          keywords: ['equipment', 'repair', 'troubleshooting'],
          sponsorOpportunities: true
        }
      ]
    });

    await integration.save();

    res.status(201).json({
      success: true,
      data: { 
        integration,
        message: 'YouTube integration configured successfully'
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/affiliates/marketplace
// @desc    Get public affiliate marketplace
// @access  Public
router.get('/marketplace', async (req, res, next) => {
  try {
    const { businessType, serviceArea, featured } = req.query;
    
    let query = { status: 'active' };
    if (businessType) query.businessType = businessType;
    if (serviceArea) query['businessDetails.serviceAreas'] = serviceArea;
    
    // Get featured partners (those with active sponsorships)
    let affiliates;
    if (featured === 'true') {
      const sponsoredPartners = await SponsorshipAgreement.find({ 
        status: 'active',
        'contractDetails.endDate': { $gt: new Date() }
      }).populate('sponsor').select('sponsor');
      
      const sponsoredIds = sponsoredPartners.map(s => s.sponsor._id);
      query._id = { $in: sponsoredIds };
    }
    
    affiliates = await AffiliatePartner.find(query)
      .select('businessName businessType contactInfo.website businessDetails.specializations performanceMetrics.customerSatisfactionRating')
      .sort({ 'performanceMetrics.customerSatisfactionRating': -1 })
      .limit(20);

    res.json({
      success: true,
      data: { affiliates }
    });

  } catch (error) {
    next(error);
  }
});

export default router;