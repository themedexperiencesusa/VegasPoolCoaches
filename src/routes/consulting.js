import express from 'express';
import Joi from 'joi';
import OpenAI from 'openai';
import Pool from '../models/Pool.js';
import MaintenanceLog from '../models/MaintenanceLog.js';
import { authenticateToken, authorize, canAccessPool } from '../middleware/auth.js';

const router = express.Router();

// Initialize OpenAI (if API key is provided)
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Validation schemas
const consultationRequestSchema = Joi.object({
  poolId: Joi.string().required(),
  issues: Joi.array().items(Joi.string()).optional(),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
  description: Joi.string().max(1000).optional(),
  photos: Joi.array().items(Joi.string()).optional()
});

const aiAnalysisSchema = Joi.object({
  waterChemistry: Joi.object({
    pH: Joi.number().min(0).max(14),
    chlorine: Joi.number().min(0),
    alkalinity: Joi.number().min(0),
    hardness: Joi.number().min(0),
    cyanuricAcid: Joi.number().min(0),
    temperature: Joi.number()
  }).optional(),
  symptoms: Joi.array().items(Joi.string()).optional(),
  urgency: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium')
});

// @route   GET /api/consulting/dashboard
// @desc    Get consulting dashboard data
// @access  Private (consultants, admins)
router.get('/dashboard', authenticateToken, authorize('consultant', 'admin'), async (req, res, next) => {
  try {
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get pools that need attention
    const poolsNeedingAttention = await Pool.find({ isActive: true }).populate('owner', 'firstName lastName email');
    const urgentPools = poolsNeedingAttention.filter(pool => pool.needsAttention());

    // Get recent maintenance logs
    const recentMaintenance = await MaintenanceLog.find({
      createdAt: { $gte: startOfWeek }
    })
    .populate('pool', 'name')
    .populate('technician', 'firstName lastName')
    .sort({ createdAt: -1 })
    .limit(10);

    // Calculate statistics
    const totalPools = await Pool.countDocuments({ isActive: true });
    const poolsWithIssues = urgentPools.length;
    const completedMaintenanceThisWeek = await MaintenanceLog.countDocuments({
      status: 'completed',
      actualEndTime: { $gte: startOfWeek }
    });
    const avgQualityScore = await MaintenanceLog.aggregate([
      { $match: { status: 'completed', actualEndTime: { $gte: startOfMonth } } },
      { $group: { _id: null, avgScore: { $avg: '$qualityScore' } } }
    ]);

    // Group pools by issue type
    const issueBreakdown = {
      waterChemistry: 0,
      equipment: 0,
      maintenance: 0,
      other: 0
    };

    urgentPools.forEach(pool => {
      const recommendations = pool.getRecommendations();
      recommendations.forEach(rec => {
        if (rec.type === 'chemical') issueBreakdown.waterChemistry++;
        else if (rec.type === 'equipment') issueBreakdown.equipment++;
        else if (rec.type === 'maintenance') issueBreakdown.maintenance++;
        else issueBreakdown.other++;
      });
    });

    res.json({
      success: true,
      data: {
        overview: {
          totalPools,
          poolsWithIssues,
          completedMaintenanceThisWeek,
          avgQualityScore: avgQualityScore[0]?.avgScore || 0
        },
        urgentPools: urgentPools.map(pool => ({
          _id: pool._id,
          name: pool.name,
          owner: pool.owner,
          recommendations: pool.getRecommendations(),
          lastChemistryTest: pool.latestWaterChemistry?.testedAt,
          address: pool.address
        })),
        recentMaintenance,
        issueBreakdown
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/consulting/ai-analysis
// @desc    Get AI-powered pool analysis and recommendations
// @access  Private
router.post('/ai-analysis', authenticateToken, async (req, res, next) => {
  try {
    const { error, value } = aiAnalysisSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    const { waterChemistry, symptoms, urgency } = value;

    if (!openai) {
      // Fallback to rule-based analysis if no OpenAI API key
      return res.json({
        success: true,
        data: {
          analysis: generateRuleBasedAnalysis(waterChemistry, symptoms),
          source: 'rule-based'
        }
      });
    }

    // Prepare context for AI analysis
    const context = {
      waterChemistry,
      symptoms: symptoms || [],
      urgency,
      timestamp: new Date().toISOString()
    };

    const prompt = `
You are an expert pool maintenance consultant. Analyze the following pool data and provide detailed recommendations:

Water Chemistry:
${waterChemistry ? JSON.stringify(waterChemistry, null, 2) : 'No recent data available'}

Reported Symptoms/Issues:
${symptoms && symptoms.length > 0 ? symptoms.join(', ') : 'None reported'}

Urgency Level: ${urgency}

Please provide:
1. Assessment of water chemistry balance
2. Immediate actions needed
3. Long-term maintenance recommendations
4. Potential causes of any issues
5. Prevention strategies

Format your response as a structured analysis with clear priorities and actionable steps.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a professional pool maintenance expert with 20+ years of experience. Provide practical, safe, and effective recommendations."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.7
    });

    const aiAnalysis = completion.choices[0].message.content;

    res.json({
      success: true,
      data: {
        analysis: aiAnalysis,
        context,
        source: 'openai',
        model: 'gpt-3.5-turbo'
      }
    });

  } catch (error) {
    console.error('AI Analysis Error:', error);
    
    // Fallback to rule-based analysis on AI failure
    const { waterChemistry, symptoms } = req.body;
    res.json({
      success: true,
      data: {
        analysis: generateRuleBasedAnalysis(waterChemistry, symptoms),
        source: 'rule-based-fallback',
        error: 'AI service temporarily unavailable'
      }
    });
  }
});

// @route   POST /api/consulting/consultation-request
// @desc    Submit a consultation request
// @access  Private
router.post('/consultation-request', authenticateToken, async (req, res, next) => {
  try {
    const { error, value } = consultationRequestSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    const { poolId, issues, priority, description, photos } = value;

    // Verify pool access
    const pool = await Pool.findById(poolId);
    if (!pool) {
      return res.status(404).json({
        success: false,
        error: { message: 'Pool not found' }
      });
    }

    // Check if user can access this pool
    if (req.user.role === 'customer' && !pool.owner.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied' }
      });
    }

    // Create consultation log (could be a separate model in production)
    const consultationData = {
      pool: poolId,
      requestedBy: req.user._id,
      issues: issues || [],
      priority,
      description,
      photos: photos || [],
      status: 'pending',
      requestedAt: new Date()
    };

    // In a real application, you'd save this to a ConsultationRequest model
    // For now, we'll just return immediate analysis

    const analysis = pool.getRecommendations();
    const needsAttention = pool.needsAttention();

    res.status(201).json({
      success: true,
      data: {
        consultation: consultationData,
        immediateAnalysis: {
          needsAttention,
          recommendations: analysis,
          poolData: {
            name: pool.name,
            type: pool.poolType,
            lastMaintenance: pool.maintenanceSchedule?.lastMaintenance,
            latestChemistry: pool.latestWaterChemistry
          }
        }
      },
      message: 'Consultation request submitted successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/consulting/pool-report/:poolId
// @desc    Generate comprehensive pool report
// @access  Private
router.get('/pool-report/:poolId', authenticateToken, canAccessPool, async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    
    const pool = await Pool.findById(req.params.poolId)
      .populate('owner', 'firstName lastName email phone')
      .populate('waterChemistry.testedBy', 'firstName lastName');

    if (!pool) {
      return res.status(404).json({
        success: false,
        error: { message: 'Pool not found' }
      });
    }

    // Get maintenance history
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

    const maintenanceHistory = await MaintenanceLog.find({
      pool: pool._id,
      createdAt: { $gte: cutoffDate }
    })
    .populate('technician', 'firstName lastName')
    .sort({ scheduledDate: -1 });

    // Calculate statistics
    const stats = {
      totalMaintenance: maintenanceHistory.length,
      completedMaintenance: maintenanceHistory.filter(m => m.status === 'completed').length,
      avgQualityScore: maintenanceHistory.length > 0 
        ? maintenanceHistory.reduce((sum, m) => sum + (m.calculateQualityScore() || 0), 0) / maintenanceHistory.length
        : 0,
      issuesFound: maintenanceHistory.reduce((sum, m) => sum + m.issues.length, 0),
      chemicalReadings: pool.waterChemistry.filter(c => c.testedAt >= cutoffDate).length
    };

    // Get water chemistry trends
    const recentChemistry = pool.waterChemistry
      .filter(c => c.testedAt >= cutoffDate)
      .sort((a, b) => new Date(b.testedAt) - new Date(a.testedAt))
      .slice(0, 10);

    // Generate recommendations
    const recommendations = pool.getRecommendations();
    const needsAttention = pool.needsAttention();

    // Equipment status summary
    const equipmentSummary = pool.equipment.reduce((acc, eq) => {
      acc[eq.status] = (acc[eq.status] || 0) + 1;
      return acc;
    }, {});

    const report = {
      pool: {
        _id: pool._id,
        name: pool.name,
        type: pool.poolType,
        owner: pool.owner,
        address: pool.address,
        dimensions: pool.dimensions
      },
      period: {
        days: parseInt(days),
        startDate: cutoffDate,
        endDate: new Date()
      },
      statistics: stats,
      currentStatus: {
        needsAttention,
        recommendations,
        latestChemistry: pool.latestWaterChemistry,
        equipmentSummary
      },
      history: {
        maintenance: maintenanceHistory.map(m => ({
          date: m.scheduledDate,
          type: m.type,
          status: m.status,
          technician: m.technician,
          qualityScore: m.calculateQualityScore(),
          issuesFound: m.issues.length,
          summary: m.generateSummary()
        })),
        waterChemistry: recentChemistry
      },
      trends: {
        // Calculate trends for pH, chlorine, etc.
        phTrend: calculateTrend(recentChemistry, 'pH'),
        chlorineTrend: calculateTrend(recentChemistry, 'chlorine'),
        alkalinityTrend: calculateTrend(recentChemistry, 'alkalinity')
      }
    };

    res.json({
      success: true,
      data: { report }
    });

  } catch (error) {
    next(error);
  }
});

// Helper function for rule-based analysis
function generateRuleBasedAnalysis(waterChemistry, symptoms = []) {
  let analysis = "Pool Analysis (Rule-Based System)\n\n";
  const issues = [];
  const recommendations = [];

  if (waterChemistry) {
    // pH Analysis
    if (waterChemistry.pH < 7.2) {
      issues.push("pH is too low (acidic)");
      recommendations.push("Add sodium carbonate (soda ash) to raise pH to 7.2-7.6 range");
    } else if (waterChemistry.pH > 7.6) {
      issues.push("pH is too high (basic)");
      recommendations.push("Add muriatic acid or sodium bisulfate to lower pH to 7.2-7.6 range");
    } else {
      analysis += "✓ pH level is within optimal range (7.2-7.6)\n";
    }

    // Chlorine Analysis
    if (waterChemistry.chlorine < 1.0) {
      issues.push("Free chlorine is too low");
      recommendations.push("URGENT: Add chlorine shock or liquid chlorine to reach 1.0-3.0 ppm");
    } else if (waterChemistry.chlorine > 3.0) {
      issues.push("Free chlorine is too high");
      recommendations.push("Allow chlorine to naturally decrease before swimming, or add neutralizer");
    } else {
      analysis += "✓ Free chlorine level is adequate (1.0-3.0 ppm)\n";
    }

    // Alkalinity Analysis
    if (waterChemistry.alkalinity < 80) {
      issues.push("Total alkalinity is low");
      recommendations.push("Add sodium bicarbonate to increase alkalinity to 80-120 ppm");
    } else if (waterChemistry.alkalinity > 120) {
      issues.push("Total alkalinity is high");
      recommendations.push("Add muriatic acid carefully to decrease alkalinity");
    } else {
      analysis += "✓ Total alkalinity is within range (80-120 ppm)\n";
    }
  }

  // Symptoms analysis
  if (symptoms.length > 0) {
    analysis += "\nReported Issues:\n";
    symptoms.forEach(symptom => {
      analysis += `- ${symptom}\n`;
      
      if (symptom.toLowerCase().includes('algae')) {
        recommendations.push("Shock treatment with chlorine, brush walls, and run filtration 24/7 until clear");
      }
      if (symptom.toLowerCase().includes('cloudy')) {
        recommendations.push("Check and clean filter, test water chemistry, consider clarifier treatment");
      }
      if (symptom.toLowerCase().includes('smell')) {
        recommendations.push("Test chlorine levels, shock if needed, check pH balance");
      }
    });
  }

  if (issues.length > 0) {
    analysis += "\n⚠️ Issues Found:\n";
    issues.forEach(issue => analysis += `- ${issue}\n`);
  }

  if (recommendations.length > 0) {
    analysis += "\n🔧 Recommended Actions:\n";
    recommendations.forEach((rec, index) => analysis += `${index + 1}. ${rec}\n`);
  }

  analysis += "\n💡 General Maintenance Tips:\n";
  analysis += "- Test water chemistry 2-3 times per week\n";
  analysis += "- Clean skimmer and pump baskets weekly\n";
  analysis += "- Brush walls and vacuum weekly\n";
  analysis += "- Maintain proper water level\n";
  analysis += "- Run filtration system 8-12 hours daily\n";

  return analysis;
}

// Helper function to calculate trends
function calculateTrend(readings, parameter) {
  if (readings.length < 2) return 'insufficient_data';
  
  const values = readings.map(r => r[parameter]).filter(v => v !== undefined);
  if (values.length < 2) return 'insufficient_data';
  
  const recent = values.slice(0, Math.ceil(values.length / 2));
  const older = values.slice(Math.ceil(values.length / 2));
  
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
  
  const percentChange = ((recentAvg - olderAvg) / olderAvg) * 100;
  
  if (Math.abs(percentChange) < 5) return 'stable';
  return percentChange > 0 ? 'increasing' : 'decreasing';
}

export default router;