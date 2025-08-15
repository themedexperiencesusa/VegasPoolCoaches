import express from 'express';
import Joi from 'joi';
import { authenticateToken, authorize } from '../middleware/auth.js';
import { AssessmentQuestion, ClientAssessment, CharacterPersona, defaultAssessmentQuestions, defaultCharacters } from '../models/Assessment.js';
import User from '../models/User.js';

const router = express.Router();

// Validation schemas
const assessmentSubmissionSchema = Joi.object({
  poolId: Joi.string(),
  assessmentType: Joi.string().valid('initial', 'annual', 'problem_specific', 'upgrade_evaluation').default('initial'),
  responses: Joi.object().required()
});

const updateAssessmentSchema = Joi.object({
  responses: Joi.object(),
  status: Joi.string().valid('draft', 'submitted', 'analyzing', 'completed', 'requires_followup'),
  notes: Joi.string()
});

// @route   GET /api/assessments/questions
// @desc    Get assessment questions
// @access  Private
router.get('/questions', authenticateToken, async (req, res, next) => {
  try {
    const { category } = req.query;
    
    let query = {};
    if (category) {
      query.category = category;
    }

    const questions = await AssessmentQuestion.find(query).sort({ order: 1 });
    
    res.json({
      success: true,
      data: { questions }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/assessments
// @desc    Submit new assessment
// @access  Private
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const { error, value } = assessmentSubmissionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    const { poolId, assessmentType, responses } = value;

    // Create assessment
    const assessment = new ClientAssessment({
      client: req.user._id,
      pool: poolId,
      assessmentType,
      responses,
      status: 'submitted',
      submittedAt: new Date()
    });

    // Run AI analysis
    const aiAnalysis = await performAIAnalysis(responses, assessmentType);
    assessment.aiAnalysis = aiAnalysis;

    // Assign agents based on AI recommendations
    const assignedAgents = await assignSpecialists(aiAnalysis.specialistRecommendations);
    assessment.assignedAgents = assignedAgents;

    assessment.status = 'completed';
    assessment.completedAt = new Date();

    await assessment.save();

    res.status(201).json({
      success: true,
      data: { 
        assessment,
        message: 'Assessment completed successfully'
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/assessments
// @desc    Get client assessments
// @access  Private
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, assessmentType } = req.query;
    
    let query = {};
    
    // Filter based on user role
    if (req.user.role === 'customer') {
      query.client = req.user._id;
    } else if (req.user.role === 'technician') {
      // Technicians see assessments where they're assigned
      query['assignedAgents.agent'] = req.user._id;
    }
    // Admins and consultants see all

    if (status) query.status = status;
    if (assessmentType) query.assessmentType = assessmentType;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      populate: [
        { path: 'client', select: 'firstName lastName email' },
        { path: 'pool', select: 'name poolType address' },
        { path: 'assignedAgents.agent', select: 'firstName lastName email' }
      ],
      sort: { createdAt: -1 }
    };

    const assessments = await ClientAssessment.paginate(query, options);

    res.json({
      success: true,
      data: assessments
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/assessments/:assessmentId
// @desc    Get specific assessment
// @access  Private
router.get('/:assessmentId', authenticateToken, async (req, res, next) => {
  try {
    const assessment = await ClientAssessment.findById(req.params.assessmentId)
      .populate('client', 'firstName lastName email phone')
      .populate('pool', 'name poolType dimensions address equipment')
      .populate('assignedAgents.agent', 'firstName lastName email specialization');

    if (!assessment) {
      return res.status(404).json({
        success: false,
        error: { message: 'Assessment not found' }
      });
    }

    // Check permissions
    if (req.user.role === 'customer' && req.user._id.toString() !== assessment.client._id.toString()) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied' }
      });
    }

    res.json({
      success: true,
      data: { assessment }
    });

  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/assessments/:assessmentId
// @desc    Update assessment
// @access  Private
router.put('/:assessmentId', authenticateToken, async (req, res, next) => {
  try {
    const { error, value } = updateAssessmentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    const assessment = await ClientAssessment.findById(req.params.assessmentId);
    
    if (!assessment) {
      return res.status(404).json({
        success: false,
        error: { message: 'Assessment not found' }
      });
    }

    // Check permissions
    if (req.user.role === 'customer' && req.user._id.toString() !== assessment.client.toString()) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied' }
      });
    }

    // Update fields
    Object.assign(assessment, value);
    
    // Re-run AI analysis if responses changed
    if (value.responses) {
      const aiAnalysis = await performAIAnalysis(assessment.responses, assessment.assessmentType);
      assessment.aiAnalysis = aiAnalysis;
      
      // Reassign agents if needed
      const assignedAgents = await assignSpecialists(aiAnalysis.specialistRecommendations);
      assessment.assignedAgents = assignedAgents;
    }

    await assessment.save();

    res.json({
      success: true,
      data: { assessment }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/assessments/characters
// @desc    Get character personas for AI advice
// @access  Private
router.get('/characters', authenticateToken, async (req, res, next) => {
  try {
    const characters = await CharacterPersona.find({ isActive: true });
    
    res.json({
      success: true,
      data: { characters }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/assessments/:assessmentId/character-advice
// @desc    Get character-based advice for assessment
// @access  Private
router.post('/:assessmentId/character-advice', authenticateToken, async (req, res, next) => {
  try {
    const { character, context } = req.body;
    
    const assessment = await ClientAssessment.findById(req.params.assessmentId);
    if (!assessment) {
      return res.status(404).json({
        success: false,
        error: { message: 'Assessment not found' }
      });
    }

    const characterPersona = await CharacterPersona.findOne({ name: character, isActive: true });
    if (!characterPersona) {
      return res.status(404).json({
        success: false,
        error: { message: 'Character not found' }
      });
    }

    // Generate character-specific advice
    const advice = generateCharacterAdvice(characterPersona, assessment, context);

    res.json({
      success: true,
      data: { 
        character: characterPersona.name,
        advice,
        context
      }
    });

  } catch (error) {
    next(error);
  }
});

// AI Analysis Functions
async function performAIAnalysis(responses, assessmentType) {
  try {
    // This would integrate with actual AI service in production
    const analysis = {
      overallScore: calculateOverallScore(responses),
      riskLevel: determineRiskLevel(responses),
      complexityLevel: determineComplexityLevel(responses),
      recommendedServiceLevel: recommendServiceLevel(responses),
      specialistRecommendations: generateSpecialistRecommendations(responses),
      immediateActions: generateImmediateActions(responses),
      longTermRecommendations: generateLongTermRecommendations(responses),
      costEstimate: estimateCosts(responses),
      confidenceScore: 0.85 // Mock confidence score
    };

    return analysis;
  } catch (error) {
    console.error('AI Analysis Error:', error);
    // Fallback to rule-based analysis
    return generateRuleBasedAnalysis(responses);
  }
}

function calculateOverallScore(responses) {
  let score = 70; // Base score
  
  // Adjust based on current issues
  if (responses.current_issues && responses.current_issues !== 'No current issues') {
    score -= 20;
  }
  
  // Adjust based on equipment condition
  if (responses.equipment_condition) {
    score += (parseInt(responses.equipment_condition) - 3) * 10;
  }
  
  // Adjust based on maintenance frequency
  const maintenanceFreq = responses.maintenance_frequency;
  if (maintenanceFreq === 'Daily' || maintenanceFreq === '2-3 times per week') {
    score += 15;
  } else if (maintenanceFreq === 'Rarely' || maintenanceFreq === 'Never') {
    score -= 25;
  }
  
  return Math.max(0, Math.min(100, score));
}

function determineRiskLevel(responses) {
  const currentIssues = responses.current_issues;
  const equipmentCondition = parseInt(responses.equipment_condition) || 3;
  const maintenanceFreq = responses.maintenance_frequency;
  
  if (currentIssues && currentIssues.includes('Green/algae') || equipmentCondition <= 2) {
    return 'high';
  } else if (currentIssues && currentIssues !== 'No current issues') {
    return 'medium';
  } else if (maintenanceFreq === 'Rarely' || maintenanceFreq === 'Never') {
    return 'medium';
  }
  
  return 'low';
}

function determineComplexityLevel(responses) {
  const poolType = responses.pool_type;
  const experience = responses.experience_level;
  
  if (poolType && poolType.includes('Infinity') || poolType.includes('Natural')) {
    return 'expert';
  } else if (experience === 'Complete beginner') {
    return 'standard';
  } else if (experience === 'Professional level') {
    return 'basic';
  }
  
  return 'standard';
}

function recommendServiceLevel(responses) {
  const budget = responses.budget_range;
  const goals = responses.primary_goals;
  
  if (budget && budget.includes('Over $750')) {
    return 'platinum';
  } else if (goals && goals.includes('Full-service management')) {
    return 'premium';
  } else if (budget && budget.includes('Under $100')) {
    return 'basic';
  }
  
  return 'premium';
}

function generateSpecialistRecommendations(responses) {
  const recommendations = [];
  
  if (responses.current_issues && responses.current_issues !== 'No current issues') {
    recommendations.push({
      specialistType: 'water_chemist',
      priority: 'high',
      reasoning: 'Water quality issues detected requiring immediate attention',
      estimatedTime: 2
    });
  }
  
  if (responses.equipment_condition && parseInt(responses.equipment_condition) <= 3) {
    recommendations.push({
      specialistType: 'equipment_specialist',
      priority: 'medium',
      reasoning: 'Equipment condition needs assessment and potential repairs',
      estimatedTime: 3
    });
  }
  
  if (responses.experience_level === 'Complete beginner') {
    recommendations.push({
      specialistType: 'maintenance_expert',
      priority: 'medium',
      reasoning: 'Client needs education and guidance on pool maintenance',
      estimatedTime: 1
    });
  }
  
  return recommendations;
}

function generateImmediateActions(responses) {
  const actions = [];
  
  if (responses.current_issues && responses.current_issues.includes('Green/algae')) {
    actions.push('Shock treatment required immediately');
    actions.push('Test and balance water chemistry');
  }
  
  if (responses.maintenance_frequency === 'Never' || responses.maintenance_frequency === 'Rarely') {
    actions.push('Establish regular maintenance schedule');
    actions.push('Inspect all equipment for safety');
  }
  
  return actions;
}

function generateLongTermRecommendations(responses) {
  const recommendations = [];
  
  recommendations.push('Implement weekly water testing routine');
  recommendations.push('Schedule quarterly professional inspection');
  
  if (responses.budget_range && !responses.budget_range.includes('Under $100')) {
    recommendations.push('Consider upgrading to automated chemical system');
  }
  
  return recommendations;
}

function estimateCosts(responses) {
  const budget = responses.budget_range;
  let monthly = 200;
  
  if (budget && budget.includes('Under $100')) {
    monthly = 75;
  } else if (budget && budget.includes('Over $750')) {
    monthly = 500;
  }
  
  return {
    monthly,
    quarterly: monthly * 3,
    annual: monthly * 12,
    oneTime: 150 // Initial setup
  };
}

async function assignSpecialists(recommendations) {
  const assignments = [];
  
  for (const rec of recommendations) {
    // Find available specialists
    const specialists = await User.find({
      role: 'technician',
      isActive: true,
      // Could add specialization matching here
    }).limit(1);
    
    if (specialists.length > 0) {
      assignments.push({
        agent: specialists[0]._id,
        specialization: rec.specialistType,
        priority: rec.priority === 'high' ? 'primary' : 'secondary',
        expectedResponseTime: rec.estimatedTime || 24
      });
    }
  }
  
  return assignments;
}

function generateCharacterAdvice(character, assessment, context) {
  const { personality, contentTemplates, poolManagementRole } = character;
  
  let advice = contentTemplates.advice || `As ${character.name}, I advise attention to your pool's needs.`;
  
  // Customize based on assessment data
  if (assessment.aiAnalysis.riskLevel === 'high') {
    advice = contentTemplates.troubleshooting || 
      `${character.name} says: This situation requires immediate action! ` + advice;
  }
  
  // Add character-specific touch
  if (personality.catchphrases && personality.catchphrases.length > 0) {
    advice += ` ${personality.catchphrases[0]}`;
  }
  
  return {
    advice,
    characterRole: poolManagementRole,
    tone: personality.tone,
    context: context || 'general'
  };
}

function generateRuleBasedAnalysis(responses) {
  return {
    overallScore: calculateOverallScore(responses),
    riskLevel: determineRiskLevel(responses),
    complexityLevel: 'standard',
    recommendedServiceLevel: 'premium',
    specialistRecommendations: [],
    immediateActions: ['Schedule professional assessment'],
    longTermRecommendations: ['Implement regular maintenance schedule'],
    costEstimate: { monthly: 200, quarterly: 600, annual: 2400, oneTime: 150 },
    confidenceScore: 0.7
  };
}

export default router;