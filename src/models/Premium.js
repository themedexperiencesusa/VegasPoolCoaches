import mongoose from 'mongoose';

const premiumSubscriptionSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subscriptionTier: {
    type: String,
    enum: ['basic', 'premium', 'platinum', 'concierge'],
    required: true
  },
  features: [{
    featureName: String,
    enabled: Boolean,
    usageLimit: Number,
    usageCount: {
      type: Number,
      default: 0
    }
  }],
  billing: {
    amount: {
      type: Number,
      required: true
    },
    frequency: {
      type: String,
      enum: ['monthly', 'quarterly', 'annually'],
      default: 'monthly'
    },
    nextBillingDate: Date,
    paymentMethod: String,
    autoRenewal: {
      type: Boolean,
      default: true
    }
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'cancelled', 'expired'],
    default: 'active'
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: Date,
  totalPaid: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

const customEbookSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  pool: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pool',
    required: true
  },
  assessment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClientAssessment'
  },
  ebookDetails: {
    title: String,
    subtitle: String,
    coverImage: String,
    pageCount: Number,
    language: {
      type: String,
      default: 'en'
    }
  },
  content: {
    introduction: String,
    chapters: [{
      chapterNumber: Number,
      title: String,
      content: String,
      images: [String],
      characterAdvice: [{
        character: String,
        advice: String,
        context: String
      }]
    }],
    appendices: [{
      title: String,
      content: String,
      type: String // 'chemical_chart', 'maintenance_schedule', 'troubleshooting_guide'
    }]
  },
  customization: {
    poolSpecifications: {
      type: String,
      poolSize: String,
      equipment: [String],
      specialFeatures: [String]
    },
    climateData: {
      region: String,
      averageTemperature: String,
      rainfall: String,
      seasonalConsiderations: [String]
    },
    userPreferences: {
      maintenanceFrequency: String,
      budgetRange: String,
      experienceLevel: String,
      goals: [String]
    }
  },
  generationStatus: {
    status: {
      type: String,
      enum: ['queued', 'generating', 'completed', 'error', 'delivered'],
      default: 'queued'
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    startedAt: Date,
    completedAt: Date,
    errorMessage: String,
    deliveryUrl: String
  },
  downloadInfo: {
    downloadCount: {
      type: Number,
      default: 0
    },
    lastDownloadDate: Date,
    allowedDownloads: {
      type: Number,
      default: 5
    }
  }
}, {
  timestamps: true
});

const virtualAiManagerSchema = new mongoose.Schema({
  name: {
    type: String,
    default: 'ARIA' // AI Responsible for Intelligent Assistance
  },
  capabilities: [{
    name: String,
    description: String,
    enabled: Boolean,
    version: String
  }],
  clientProfiles: [{
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    learningData: {
      interactionHistory: [{
        type: String,
        timestamp: Date,
        context: String,
        response: String,
        effectiveness: Number
      }],
      preferences: {
        communicationStyle: String,
        responseFrequency: String,
        alertTypes: [String]
      },
      poolKnowledge: {
        poolType: String,
        commonIssues: [String],
        successfulSolutions: [String],
        equipmentHistory: [String]
      }
    },
    performanceMetrics: {
      accuracyScore: Number,
      responsTime: Number,
      clientSatisfaction: Number,
      issueResolutionRate: Number
    }
  }],
  taskManagement: {
    activeTasks: [{
      taskId: String,
      type: String,
      priority: String,
      assignedTo: String,
      dueDate: Date,
      status: String,
      description: String
    }],
    completedTasks: Number,
    averageCompletionTime: Number
  },
  learningSystem: {
    knowledgeBase: [{
      topic: String,
      content: String,
      confidence: Number,
      sources: [String],
      lastUpdated: Date
    }],
    improvementAreas: [String],
    trainingData: [{
      scenario: String,
      correctResponse: String,
      actualResponse: String,
      feedback: String,
      learned: Boolean
    }]
  }
}, {
  timestamps: true
});

const weeklyAssessmentSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  pool: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pool',
    required: true
  },
  assessmentDate: {
    type: Date,
    default: Date.now
  },
  assessmentType: {
    type: String,
    enum: ['weekly', 'bi-weekly', 'monthly', 'emergency', 'seasonal'],
    default: 'weekly'
  },
  waterSample: {
    collectionMethod: {
      type: String,
      enum: ['self_collected', 'technician_collected', 'smart_sensor']
    },
    collectionDate: Date,
    testResults: {
      pH: Number,
      chlorine: Number,
      alkalinity: Number,
      hardness: Number,
      temperature: Number,
      turbidity: Number,
      phosphates: Number,
      stabilizer: Number
    },
    photoEvidence: [String]
  },
  visualInspection: {
    waterClarity: {
      type: String,
      enum: ['crystal_clear', 'slightly_cloudy', 'cloudy', 'very_cloudy', 'murky']
    },
    surfaceCondition: {
      type: String,
      enum: ['clean', 'light_debris', 'moderate_debris', 'heavy_debris']
    },
    equipmentStatus: [{
      equipment: String,
      status: String,
      notes: String
    }],
    observations: [String]
  },
  aiAnalysis: {
    overallGrade: {
      type: String,
      enum: ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F']
    },
    chemistryScore: Number,
    clarityScore: Number,
    equipmentScore: Number,
    recommendations: [{
      priority: String,
      action: String,
      reason: String,
      estimatedCost: Number,
      timeframe: String,
      difficulty: String
    }],
    trends: [{
      parameter: String,
      direction: String, // 'improving', 'stable', 'declining'
      prediction: String
    }],
    alerts: [{
      type: String,
      severity: String,
      message: String,
      actionRequired: Boolean
    }]
  },
  followUpActions: [{
    action: String,
    assignedTo: String,
    dueDate: Date,
    status: String,
    notes: String
  }],
  clientFeedback: {
    satisfaction: Number,
    comments: String,
    issuesReported: [String]
  }
}, {
  timestamps: true
});

const crmIntegrationSchema = new mongoose.Schema({
  crmSystem: {
    type: String,
    enum: ['custom', 'salesforce', 'hubspot', 'pipedrive', 'zoho'],
    default: 'custom'
  },
  configuration: {
    apiKey: String,
    webhookUrl: String,
    syncFrequency: {
      type: String,
      enum: ['real_time', 'hourly', 'daily', 'weekly'],
      default: 'daily'
    },
    fieldMappings: [{
      localField: String,
      crmField: String,
      dataType: String,
      required: Boolean
    }]
  },
  syncStatus: {
    lastSync: Date,
    status: {
      type: String,
      enum: ['success', 'partial', 'failed', 'in_progress'],
      default: 'success'
    },
    recordsSynced: Number,
    errors: [String]
  },
  leadManagement: {
    leadSources: [{
      source: String,
      count: Number,
      conversionRate: Number
    }],
    conversionFunnel: [{
      stage: String,
      count: Number,
      dropoffRate: Number
    }],
    automatedActions: [{
      trigger: String,
      action: String,
      enabled: Boolean
    }]
  }
}, {
  timestamps: true
});

// Default premium features
const defaultPremiumFeatures = {
  basic: [
    { featureName: 'Monthly Water Analysis', enabled: true, usageLimit: 1 },
    { featureName: 'Basic Ebook', enabled: true, usageLimit: 1 },
    { featureName: 'Standard Support', enabled: true, usageLimit: -1 }
  ],
  premium: [
    { featureName: 'Weekly Water Analysis', enabled: true, usageLimit: 4 },
    { featureName: 'Custom Ebook with Characters', enabled: true, usageLimit: 1 },
    { featureName: 'AI Manager Access', enabled: true, usageLimit: -1 },
    { featureName: 'Priority Support', enabled: true, usageLimit: -1 },
    { featureName: 'Affiliate Referrals', enabled: true, usageLimit: 3 }
  ],
  platinum: [
    { featureName: 'Bi-weekly Water Analysis', enabled: true, usageLimit: 8 },
    { featureName: 'Premium Custom Ebook', enabled: true, usageLimit: 2 },
    { featureName: 'Advanced AI Manager', enabled: true, usageLimit: -1 },
    { featureName: '24/7 Support', enabled: true, usageLimit: -1 },
    { featureName: 'Unlimited Affiliate Referrals', enabled: true, usageLimit: -1 },
    { featureName: 'Emergency Response', enabled: true, usageLimit: 2 }
  ],
  concierge: [
    { featureName: 'Weekly Water Analysis', enabled: true, usageLimit: -1 },
    { featureName: 'Unlimited Custom Ebooks', enabled: true, usageLimit: -1 },
    { featureName: 'Dedicated AI Manager', enabled: true, usageLimit: -1 },
    { featureName: 'Concierge Support', enabled: true, usageLimit: -1 },
    { featureName: 'Unlimited Affiliate Referrals', enabled: true, usageLimit: -1 },
    { featureName: 'Emergency Response', enabled: true, usageLimit: -1 },
    { featureName: 'On-site Visits', enabled: true, usageLimit: 4 }
  ]
};

// Indexes
premiumSubscriptionSchema.index({ client: 1, status: 1 });
customEbookSchema.index({ client: 1, 'generationStatus.status': 1 });
weeklyAssessmentSchema.index({ client: 1, assessmentDate: -1 });
virtualAiManagerSchema.index({ 'clientProfiles.client': 1 });
crmIntegrationSchema.index({ crmSystem: 1 });

export const PremiumSubscription = mongoose.model('PremiumSubscription', premiumSubscriptionSchema);
export const CustomEbook = mongoose.model('CustomEbook', customEbookSchema);
export const VirtualAiManager = mongoose.model('VirtualAiManager', virtualAiManagerSchema);
export const WeeklyAssessment = mongoose.model('WeeklyAssessment', weeklyAssessmentSchema);
export const CrmIntegration = mongoose.model('CrmIntegration', crmIntegrationSchema);
export { defaultPremiumFeatures };