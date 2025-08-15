import express from 'express';
import Joi from 'joi';
import { authenticateToken, authorize } from '../middleware/auth.js';
import { 
  PremiumSubscription, 
  CustomEbook, 
  VirtualAiManager, 
  WeeklyAssessment, 
  CrmIntegration,
  defaultPremiumFeatures 
} from '../models/Premium.js';

const router = express.Router();

// Validation schemas
const subscriptionSchema = Joi.object({
  subscriptionTier: Joi.string().valid('basic', 'premium', 'platinum', 'concierge').required(),
  billing: Joi.object({
    frequency: Joi.string().valid('monthly', 'quarterly', 'annually').default('monthly'),
    paymentMethod: Joi.string(),
    autoRenewal: Joi.boolean().default(true)
  })
});

const ebookRequestSchema = Joi.object({
  poolId: Joi.string().required(),
  assessmentId: Joi.string(),
  customization: Joi.object({
    poolSpecifications: Joi.object(),
    climateData: Joi.object(),
    userPreferences: Joi.object()
  })
});

const weeklyAssessmentSchema = Joi.object({
  poolId: Joi.string().required(),
  assessmentType: Joi.string().valid('weekly', 'bi-weekly', 'monthly', 'emergency', 'seasonal').default('weekly'),
  waterSample: Joi.object({
    collectionMethod: Joi.string().valid('self_collected', 'technician_collected', 'smart_sensor'),
    testResults: Joi.object({
      pH: Joi.number().min(0).max(14),
      chlorine: Joi.number().min(0),
      alkalinity: Joi.number().min(0),
      hardness: Joi.number().min(0),
      temperature: Joi.number(),
      turbidity: Joi.number().min(0),
      phosphates: Joi.number().min(0),
      stabilizer: Joi.number().min(0)
    }),
    photoEvidence: Joi.array().items(Joi.string())
  }),
  visualInspection: Joi.object({
    waterClarity: Joi.string().valid('crystal_clear', 'slightly_cloudy', 'cloudy', 'very_cloudy', 'murky'),
    surfaceCondition: Joi.string().valid('clean', 'light_debris', 'moderate_debris', 'heavy_debris'),
    equipmentStatus: Joi.array().items(Joi.object({
      equipment: Joi.string(),
      status: Joi.string(),
      notes: Joi.string()
    })),
    observations: Joi.array().items(Joi.string())
  }),
  clientFeedback: Joi.object({
    satisfaction: Joi.number().min(1).max(5),
    comments: Joi.string(),
    issuesReported: Joi.array().items(Joi.string())
  })
});

// @route   POST /api/premium/subscribe
// @desc    Create premium subscription
// @access  Private
router.post('/subscribe', authenticateToken, async (req, res, next) => {
  try {
    const { error, value } = subscriptionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    // Check if user already has active subscription
    const existingSubscription = await PremiumSubscription.findOne({
      client: req.user._id,
      status: 'active'
    });

    if (existingSubscription) {
      return res.status(409).json({
        success: false,
        error: { message: 'User already has an active subscription' }
      });
    }

    const { subscriptionTier, billing } = value;

    // Get pricing based on tier
    const pricing = getPricingForTier(subscriptionTier, billing.frequency);
    
    // Create subscription
    const subscription = new PremiumSubscription({
      client: req.user._id,
      subscriptionTier,
      features: defaultPremiumFeatures[subscriptionTier] || defaultPremiumFeatures.basic,
      billing: {
        ...billing,
        amount: pricing.amount,
        nextBillingDate: calculateNextBillingDate(billing.frequency)
      }
    });

    await subscription.save();

    // Initialize AI Manager for this client
    await initializeAIManager(req.user._id, subscriptionTier);

    res.status(201).json({
      success: true,
      data: {
        subscription,
        message: 'Premium subscription activated successfully'
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/premium/subscription
// @desc    Get current subscription details
// @access  Private
router.get('/subscription', authenticateToken, async (req, res, next) => {
  try {
    const subscription = await PremiumSubscription.findOne({
      client: req.user._id,
      status: 'active'
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: { message: 'No active subscription found' }
      });
    }

    res.json({
      success: true,
      data: { subscription }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/premium/ebook/request
// @desc    Request custom ebook generation
// @access  Private
router.post('/ebook/request', authenticateToken, async (req, res, next) => {
  try {
    // Check if user has premium subscription
    const subscription = await PremiumSubscription.findOne({
      client: req.user._id,
      status: 'active'
    });

    if (!subscription) {
      return res.status(403).json({
        success: false,
        error: { message: 'Premium subscription required' }
      });
    }

    // Check feature usage limits
    const ebookFeature = subscription.features.find(f => f.featureName.includes('Ebook'));
    if (ebookFeature && ebookFeature.usageLimit !== -1 && ebookFeature.usageCount >= ebookFeature.usageLimit) {
      return res.status(403).json({
        success: false,
        error: { message: 'Ebook generation limit reached for current subscription tier' }
      });
    }

    const { error, value } = ebookRequestSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    const { poolId, assessmentId, customization } = value;

    // Create ebook request
    const ebook = new CustomEbook({
      client: req.user._id,
      pool: poolId,
      assessment: assessmentId,
      customization,
      ebookDetails: {
        title: `Custom Pool Management Guide`,
        subtitle: `Personalized for ${req.user.firstName} ${req.user.lastName}`,
        language: 'en'
      }
    });

    await ebook.save();

    // Update feature usage
    if (ebookFeature && ebookFeature.usageLimit !== -1) {
      ebookFeature.usageCount += 1;
      await subscription.save();
    }

    // Start ebook generation process
    generateCustomEbook(ebook._id);

    res.status(201).json({
      success: true,
      data: {
        ebook,
        message: 'Ebook generation started. You will receive an email when ready.'
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/premium/ebooks
// @desc    Get user's custom ebooks
// @access  Private
router.get('/ebooks', authenticateToken, async (req, res, next) => {
  try {
    const ebooks = await CustomEbook.find({ client: req.user._id })
      .populate('pool', 'name poolType')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: { ebooks }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/premium/ebook/:ebookId/download
// @desc    Download custom ebook
// @access  Private
router.get('/ebook/:ebookId/download', authenticateToken, async (req, res, next) => {
  try {
    const ebook = await CustomEbook.findById(req.params.ebookId);
    
    if (!ebook || ebook.client.toString() !== req.user._id.toString()) {
      return res.status(404).json({
        success: false,
        error: { message: 'Ebook not found' }
      });
    }

    if (ebook.generationStatus.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: { message: 'Ebook is not ready for download' }
      });
    }

    // Check download limits
    if (ebook.downloadInfo.downloadCount >= ebook.downloadInfo.allowedDownloads) {
      return res.status(403).json({
        success: false,
        error: { message: 'Download limit exceeded' }
      });
    }

    // Update download info
    ebook.downloadInfo.downloadCount += 1;
    ebook.downloadInfo.lastDownloadDate = new Date();
    await ebook.save();

    res.json({
      success: true,
      data: {
        downloadUrl: ebook.generationStatus.deliveryUrl,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/premium/assessment/weekly
// @desc    Submit weekly assessment
// @access  Private
router.post('/assessment/weekly', authenticateToken, async (req, res, next) => {
  try {
    // Check subscription and feature limits
    const subscription = await PremiumSubscription.findOne({
      client: req.user._id,
      status: 'active'
    });

    if (!subscription) {
      return res.status(403).json({
        success: false,
        error: { message: 'Premium subscription required' }
      });
    }

    const { error, value } = weeklyAssessmentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    const assessment = new WeeklyAssessment({
      client: req.user._id,
      ...value
    });

    // Perform AI analysis
    const aiAnalysis = await performWeeklyAIAnalysis(value);
    assessment.aiAnalysis = aiAnalysis;

    // Generate follow-up actions if needed
    if (aiAnalysis.alerts && aiAnalysis.alerts.length > 0) {
      assessment.followUpActions = generateFollowUpActions(aiAnalysis.alerts);
    }

    await assessment.save();

    res.status(201).json({
      success: true,
      data: {
        assessment,
        message: 'Weekly assessment completed successfully'
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/premium/assessments/weekly
// @desc    Get weekly assessments
// @access  Private
router.get('/assessments/weekly', authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, poolId, startDate, endDate } = req.query;
    
    let query = { client: req.user._id };
    if (poolId) query.pool = poolId;
    if (startDate || endDate) {
      query.assessmentDate = {};
      if (startDate) query.assessmentDate.$gte = new Date(startDate);
      if (endDate) query.assessmentDate.$lte = new Date(endDate);
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      populate: [{ path: 'pool', select: 'name poolType address' }],
      sort: { assessmentDate: -1 }
    };

    const assessments = await WeeklyAssessment.paginate(query, options);

    res.json({
      success: true,
      data: assessments
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/premium/ai-manager
// @desc    Get AI manager status and capabilities
// @access  Private
router.get('/ai-manager', authenticateToken, async (req, res, next) => {
  try {
    const aiManager = await VirtualAiManager.findOne({
      'clientProfiles.client': req.user._id
    });

    if (!aiManager) {
      return res.status(404).json({
        success: false,
        error: { message: 'AI Manager not initialized' }
      });
    }

    // Get client-specific profile
    const clientProfile = aiManager.clientProfiles.find(
      profile => profile.client.toString() === req.user._id.toString()
    );

    res.json({
      success: true,
      data: {
        name: aiManager.name,
        capabilities: aiManager.capabilities,
        clientProfile,
        activeTasks: aiManager.taskManagement.activeTasks.filter(
          task => task.assignedTo === req.user._id.toString()
        )
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/premium/ai-manager/query
// @desc    Query AI manager
// @access  Private
router.post('/ai-manager/query', authenticateToken, async (req, res, next) => {
  try {
    const { query, context } = req.body;
    
    const aiManager = await VirtualAiManager.findOne({
      'clientProfiles.client': req.user._id
    });

    if (!aiManager) {
      return res.status(404).json({
        success: false,
        error: { message: 'AI Manager not available' }
      });
    }

    // Process query and generate response
    const response = await processAIManagerQuery(query, context, req.user._id);

    // Log interaction
    const clientProfile = aiManager.clientProfiles.find(
      profile => profile.client.toString() === req.user._id.toString()
    );

    if (clientProfile) {
      clientProfile.learningData.interactionHistory.push({
        type: 'query',
        timestamp: new Date(),
        context: context || 'general',
        response: response.text,
        effectiveness: 0.8 // Would be updated based on user feedback
      });
      
      await aiManager.save();
    }

    res.json({
      success: true,
      data: { response }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/premium/analytics
// @desc    Get premium subscription analytics
// @access  Private (Admin/Consultant only)
router.get('/analytics', authenticateToken, authorize(['admin', 'consultant']), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Build date filter
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    // Subscription analytics
    const subscriptionStats = await PremiumSubscription.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$subscriptionTier',
          count: { $sum: 1 },
          totalRevenue: { $sum: '$totalPaid' },
          avgMonthlyValue: { $avg: '$billing.amount' }
        }
      }
    ]);

    // Ebook generation stats
    const ebookStats = await CustomEbook.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$generationStatus.status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Weekly assessment trends
    const assessmentTrends = await WeeklyAssessment.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: {
            year: { $year: '$assessmentDate' },
            month: { $month: '$assessmentDate' }
          },
          count: { $sum: 1 },
          avgGrade: { $avg: { $cond: [
            { $eq: ['$aiAnalysis.overallGrade', 'A+'] }, 97,
            { $cond: [{ $eq: ['$aiAnalysis.overallGrade', 'A'] }, 93,
              { $cond: [{ $eq: ['$aiAnalysis.overallGrade', 'B+'] }, 87,
                { $cond: [{ $eq: ['$aiAnalysis.overallGrade', 'B'] }, 83, 70] }
              ] }
            ] }
          ] }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const analytics = {
      subscriptions: {
        totalActive: await PremiumSubscription.countDocuments({ status: 'active' }),
        byTier: subscriptionStats,
        totalRevenue: subscriptionStats.reduce((sum, tier) => sum + tier.totalRevenue, 0)
      },
      ebooks: {
        totalGenerated: await CustomEbook.countDocuments(),
        statusBreakdown: ebookStats
      },
      assessments: {
        totalWeekly: await WeeklyAssessment.countDocuments(),
        monthlyTrends: assessmentTrends
      }
    };

    res.json({
      success: true,
      data: { analytics }
    });

  } catch (error) {
    next(error);
  }
});

// Helper functions
function getPricingForTier(tier, frequency) {
  const pricing = {
    basic: { monthly: 49, quarterly: 129, annually: 499 },
    premium: { monthly: 149, quarterly: 399, annually: 1499 },
    platinum: { monthly: 299, quarterly: 799, annually: 2999 },
    concierge: { monthly: 599, quarterly: 1599, annually: 5999 }
  };

  return {
    amount: pricing[tier][frequency]
  };
}

function calculateNextBillingDate(frequency) {
  const now = new Date();
  switch (frequency) {
    case 'monthly':
      return new Date(now.setMonth(now.getMonth() + 1));
    case 'quarterly':
      return new Date(now.setMonth(now.getMonth() + 3));
    case 'annually':
      return new Date(now.setFullYear(now.getFullYear() + 1));
    default:
      return new Date(now.setMonth(now.getMonth() + 1));
  }
}

async function initializeAIManager(clientId, subscriptionTier) {
  let aiManager = await VirtualAiManager.findOne();
  
  if (!aiManager) {
    aiManager = new VirtualAiManager({
      capabilities: [
        { name: 'Pool Analysis', description: 'Analyze pool conditions and provide recommendations', enabled: true, version: '1.0' },
        { name: 'Predictive Maintenance', description: 'Predict maintenance needs', enabled: true, version: '1.0' },
        { name: 'Chemical Optimization', description: 'Optimize chemical usage', enabled: true, version: '1.0' }
      ]
    });
  }

  // Add client profile
  const existingProfile = aiManager.clientProfiles.find(
    profile => profile.client.toString() === clientId.toString()
  );

  if (!existingProfile) {
    aiManager.clientProfiles.push({
      client: clientId,
      learningData: {
        interactionHistory: [],
        preferences: {
          communicationStyle: subscriptionTier === 'concierge' ? 'detailed' : 'standard',
          responseFrequency: 'as_needed',
          alertTypes: ['urgent', 'maintenance']
        },
        poolKnowledge: {
          poolType: 'unknown',
          commonIssues: [],
          successfulSolutions: [],
          equipmentHistory: []
        }
      },
      performanceMetrics: {
        accuracyScore: 0.8,
        responsTime: 2, // seconds
        clientSatisfaction: 4.0,
        issueResolutionRate: 0.85
      }
    });

    await aiManager.save();
  }
}

async function generateCustomEbook(ebookId) {
  try {
    const ebook = await CustomEbook.findById(ebookId)
      .populate('client', 'firstName lastName')
      .populate('pool', 'name poolType dimensions equipment address')
      .populate('assessment', 'responses aiAnalysis');

    ebook.generationStatus.status = 'generating';
    ebook.generationStatus.startedAt = new Date();
    await ebook.save();

    // Simulate ebook generation process
    setTimeout(async () => {
      try {
        // Generate content based on pool data and assessment
        const content = await generateEbookContent(ebook);
        
        ebook.content = content;
        ebook.ebookDetails.pageCount = estimatePageCount(content);
        ebook.generationStatus.status = 'completed';
        ebook.generationStatus.completedAt = new Date();
        ebook.generationStatus.progress = 100;
        ebook.generationStatus.deliveryUrl = `/downloads/ebook-${ebookId}.pdf`;
        
        await ebook.save();
        
        // TODO: Send email notification to client
        console.log(`Ebook completed for ${ebook.client.firstName}`);
      } catch (error) {
        ebook.generationStatus.status = 'error';
        ebook.generationStatus.errorMessage = error.message;
        await ebook.save();
      }
    }, 30000); // 30 second simulation

  } catch (error) {
    console.error('Ebook generation error:', error);
  }
}

async function generateEbookContent(ebook) {
  const { client, pool, assessment } = ebook;
  
  return {
    introduction: `Welcome ${client.firstName}! This custom guide is specifically designed for your ${pool.poolType} pool.`,
    chapters: [
      {
        chapterNumber: 1,
        title: 'Your Pool Profile',
        content: `Your ${pool.poolType} pool requires specific maintenance based on its unique characteristics...`,
        characterAdvice: [{
          character: 'Zeus',
          advice: 'A well-maintained pool reflects the divine order of nature itself!',
          context: 'pool_overview'
        }]
      },
      {
        chapterNumber: 2,
        title: 'Water Chemistry Management',
        content: 'Based on your assessment results, here are your specific water chemistry guidelines...',
        characterAdvice: [{
          character: 'Cleopatra',
          advice: 'The secret to perfect water lies in the precise balance of elements, just as I once bathed in perfection.',
          context: 'water_chemistry'
        }]
      }
    ],
    appendices: [
      {
        title: 'Chemical Reference Chart',
        content: 'Quick reference for optimal chemical levels...',
        type: 'chemical_chart'
      }
    ]
  };
}

function estimatePageCount(content) {
  // Simple estimation based on content length
  const totalText = content.introduction.length + 
    content.chapters.reduce((sum, chapter) => sum + chapter.content.length, 0) +
    content.appendices.reduce((sum, appendix) => sum + appendix.content.length, 0);
  
  return Math.ceil(totalText / 2000); // Roughly 2000 characters per page
}

async function performWeeklyAIAnalysis(assessmentData) {
  const { waterSample, visualInspection } = assessmentData;
  
  // Calculate scores
  const chemistryScore = calculateChemistryScore(waterSample?.testResults);
  const clarityScore = calculateClarityScore(visualInspection?.waterClarity);
  const equipmentScore = calculateEquipmentScore(visualInspection?.equipmentStatus);
  
  const overallGrade = calculateOverallGrade(chemistryScore, clarityScore, equipmentScore);
  
  // Generate recommendations
  const recommendations = [];
  const alerts = [];
  
  if (chemistryScore < 70) {
    recommendations.push({
      priority: 'high',
      action: 'Adjust water chemistry',
      reason: 'Chemical levels are outside optimal range',
      estimatedCost: 50,
      timeframe: '24 hours',
      difficulty: 'easy'
    });
    
    alerts.push({
      type: 'chemistry',
      severity: 'warning',
      message: 'Water chemistry requires immediate attention',
      actionRequired: true
    });
  }
  
  return {
    overallGrade,
    chemistryScore,
    clarityScore,
    equipmentScore,
    recommendations,
    alerts,
    trends: [] // Would calculate from historical data
  };
}

function calculateChemistryScore(testResults) {
  if (!testResults) return 50;
  
  let score = 100;
  
  // pH scoring
  if (testResults.pH < 7.2 || testResults.pH > 7.6) score -= 20;
  
  // Chlorine scoring
  if (testResults.chlorine < 1.0 || testResults.chlorine > 3.0) score -= 20;
  
  // Alkalinity scoring
  if (testResults.alkalinity < 80 || testResults.alkalinity > 120) score -= 15;
  
  return Math.max(0, score);
}

function calculateClarityScore(waterClarity) {
  const clarityScores = {
    'crystal_clear': 100,
    'slightly_cloudy': 80,
    'cloudy': 60,
    'very_cloudy': 40,
    'murky': 20
  };
  
  return clarityScores[waterClarity] || 70;
}

function calculateEquipmentScore(equipmentStatus) {
  if (!equipmentStatus || equipmentStatus.length === 0) return 70;
  
  const workingEquipment = equipmentStatus.filter(eq => eq.status === 'working').length;
  const totalEquipment = equipmentStatus.length;
  
  return (workingEquipment / totalEquipment) * 100;
}

function calculateOverallGrade(chemistryScore, clarityScore, equipmentScore) {
  const avgScore = (chemistryScore + clarityScore + equipmentScore) / 3;
  
  if (avgScore >= 97) return 'A+';
  if (avgScore >= 93) return 'A';
  if (avgScore >= 87) return 'B+';
  if (avgScore >= 83) return 'B';
  if (avgScore >= 77) return 'C+';
  if (avgScore >= 73) return 'C';
  if (avgScore >= 67) return 'D';
  return 'F';
}

function generateFollowUpActions(alerts) {
  return alerts.filter(alert => alert.actionRequired).map(alert => ({
    action: `Address ${alert.type} issue`,
    assignedTo: 'system',
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    status: 'pending',
    notes: alert.message
  }));
}

async function processAIManagerQuery(query, context, clientId) {
  // Simplified AI response - would integrate with actual AI service
  const responses = {
    'water chemistry': 'Based on your recent test results, I recommend adjusting your pH levels to the optimal range of 7.2-7.6.',
    'equipment issues': 'Your pump appears to be running efficiently, but consider cleaning the filter cartridge.',
    'maintenance schedule': 'Your next maintenance should include skimming, brushing, and testing water chemistry.',
    'default': 'I\'m here to help with your pool management needs. Could you be more specific about what you\'d like assistance with?'
  };
  
  const lowerQuery = query.toLowerCase();
  let responseText = responses.default;
  
  for (const [key, response] of Object.entries(responses)) {
    if (lowerQuery.includes(key)) {
      responseText = response;
      break;
    }
  }
  
  return {
    text: responseText,
    confidence: 0.8,
    suggestions: [
      'Check water chemistry',
      'Schedule maintenance',
      'Review equipment status'
    ],
    timestamp: new Date()
  };
}

export default router;