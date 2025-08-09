import mongoose from 'mongoose';

const assessmentQuestionSchema = new mongoose.Schema({
  questionId: {
    type: String,
    required: true,
    unique: true
  },
  category: {
    type: String,
    enum: ['pool_basics', 'water_chemistry', 'equipment', 'maintenance_history', 'usage_patterns', 'budget', 'goals'],
    required: true
  },
  question: {
    type: String,
    required: true
  },
  questionType: {
    type: String,
    enum: ['multiple_choice', 'text', 'number', 'boolean', 'scale', 'file_upload'],
    required: true
  },
  options: [String], // For multiple choice questions
  required: {
    type: Boolean,
    default: true
  },
  weight: {
    type: Number,
    default: 1.0 // Weight for AI scoring
  },
  aiContextTags: [String], // Tags for AI analysis
  order: {
    type: Number,
    default: 0
  }
});

const clientAssessmentSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  pool: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pool'
  },
  assessmentType: {
    type: String,
    enum: ['initial', 'annual', 'problem_specific', 'upgrade_evaluation'],
    default: 'initial'
  },
  responses: {
    type: Map,
    of: mongoose.Schema.Types.Mixed // Flexible to store different response types
  },
  aiAnalysis: {
    overallScore: {
      type: Number,
      min: 0,
      max: 100
    },
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    complexityLevel: {
      type: String,
      enum: ['basic', 'standard', 'advanced', 'expert'],
      default: 'standard'
    },
    recommendedServiceLevel: {
      type: String,
      enum: ['basic', 'premium', 'platinum', 'concierge'],
      default: 'basic'
    },
    specialistRecommendations: [{
      specialistType: {
        type: String,
        enum: ['water_chemist', 'equipment_specialist', 'pool_designer', 'maintenance_expert', 'problem_solver']
      },
      priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent']
      },
      reasoning: String,
      estimatedTime: Number // hours
    }],
    immediateActions: [String],
    longTermRecommendations: [String],
    costEstimate: {
      monthly: Number,
      quarterly: Number,
      annual: Number,
      oneTime: Number
    },
    confidenceScore: {
      type: Number,
      min: 0,
      max: 1
    }
  },
  assignedAgents: [{
    agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    specialization: String,
    priority: {
      type: String,
      enum: ['primary', 'secondary', 'backup']
    },
    assignedDate: {
      type: Date,
      default: Date.now
    },
    expectedResponseTime: Number // hours
  }],
  status: {
    type: String,
    enum: ['draft', 'submitted', 'analyzing', 'completed', 'requires_followup'],
    default: 'draft'
  },
  submittedAt: Date,
  completedAt: Date,
  followUpRequired: {
    type: Boolean,
    default: false
  },
  followUpDate: Date,
  notes: String
}, {
  timestamps: true
});

const characterPersonaSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  characterType: {
    type: String,
    enum: ['historical', 'mythological', 'fictional'],
    required: true
  },
  domain: {
    type: String,
    enum: ['public_domain', 'original', 'licensed'],
    default: 'public_domain'
  },
  specialization: {
    type: String,
    enum: ['water_chemistry', 'equipment', 'leadership', 'strategy', 'problem_solving', 'maintenance'],
    required: true
  },
  personality: {
    tone: {
      type: String,
      enum: ['authoritative', 'wise', 'friendly', 'commanding', 'mysterious', 'practical']
    },
    expertise: [String],
    catchphrases: [String],
    communicationStyle: String
  },
  avatar: {
    imageUrl: String,
    videoUrl: String,
    voiceSettings: {
      accent: String,
      pace: String,
      tone: String
    }
  },
  backstory: String,
  poolManagementRole: String, // How this character relates to pool management
  contentTemplates: {
    introduction: String,
    advice: String,
    troubleshooting: String,
    maintenance: String
  },
  isActive: {
    type: Boolean,
    default: true
  }
});

// Default assessment questions
const defaultAssessmentQuestions = [
  {
    questionId: 'pool_type',
    category: 'pool_basics',
    question: 'What type of pool do you have?',
    questionType: 'multiple_choice',
    options: ['Inground Concrete', 'Inground Vinyl', 'Inground Fiberglass', 'Above Ground', 'Spa/Hot Tub', 'Infinity Pool', 'Natural Pool'],
    weight: 2.0,
    aiContextTags: ['pool_type', 'maintenance_complexity'],
    order: 1
  },
  {
    questionId: 'pool_age',
    category: 'pool_basics',
    question: 'How old is your pool?',
    questionType: 'multiple_choice',
    options: ['Less than 1 year', '1-5 years', '6-10 years', '11-20 years', 'Over 20 years', 'Unknown'],
    weight: 1.5,
    aiContextTags: ['age', 'maintenance_needs'],
    order: 2
  },
  {
    questionId: 'pool_volume',
    category: 'pool_basics',
    question: 'What is your pool volume in gallons (approximate)?',
    questionType: 'number',
    weight: 1.5,
    aiContextTags: ['size', 'chemical_requirements'],
    order: 3
  },
  {
    questionId: 'current_issues',
    category: 'water_chemistry',
    question: 'What water quality issues are you currently experiencing?',
    questionType: 'multiple_choice',
    options: ['Cloudy water', 'Green/algae', 'Strong chlorine smell', 'Skin/eye irritation', 'Scaling', 'Staining', 'No current issues'],
    weight: 3.0,
    aiContextTags: ['water_quality', 'urgent_needs'],
    order: 4
  },
  {
    questionId: 'maintenance_frequency',
    category: 'maintenance_history',
    question: 'How often do you currently maintain your pool?',
    questionType: 'multiple_choice',
    options: ['Daily', '2-3 times per week', 'Weekly', 'Bi-weekly', 'Monthly', 'Rarely', 'Never'],
    weight: 2.0,
    aiContextTags: ['maintenance_frequency', 'owner_involvement'],
    order: 5
  },
  {
    questionId: 'equipment_condition',
    category: 'equipment',
    question: 'What is the overall condition of your pool equipment?',
    questionType: 'scale',
    options: ['1', '2', '3', '4', '5'], // 1=Poor, 5=Excellent
    weight: 2.0,
    aiContextTags: ['equipment_condition', 'repair_needs'],
    order: 6
  },
  {
    questionId: 'budget_range',
    category: 'budget',
    question: 'What is your monthly budget for pool maintenance?',
    questionType: 'multiple_choice',
    options: ['Under $100', '$100-200', '$200-300', '$300-500', '$500-750', 'Over $750', 'No specific budget'],
    weight: 2.5,
    aiContextTags: ['budget', 'service_level'],
    order: 7
  },
  {
    questionId: 'usage_pattern',
    category: 'usage_patterns',
    question: 'How often is your pool used?',
    questionType: 'multiple_choice',
    options: ['Daily', 'Several times per week', 'Weekly', 'Occasionally', 'Seasonally', 'Rarely'],
    weight: 1.5,
    aiContextTags: ['usage', 'maintenance_intensity'],
    order: 8
  },
  {
    questionId: 'experience_level',
    category: 'goals',
    question: 'What is your experience level with pool maintenance?',
    questionType: 'multiple_choice',
    options: ['Complete beginner', 'Some basic knowledge', 'Moderate experience', 'Very experienced', 'Professional level'],
    weight: 2.0,
    aiContextTags: ['experience', 'education_needs'],
    order: 9
  },
  {
    questionId: 'primary_goals',
    category: 'goals',
    question: 'What are your primary goals for pool management?',
    questionType: 'multiple_choice',
    options: ['Minimize maintenance time', 'Reduce costs', 'Perfect water quality', 'Equipment optimization', 'Learn to DIY', 'Full-service management'],
    weight: 2.0,
    aiContextTags: ['goals', 'service_preference'],
    order: 10
  }
];

// Default character personas
const defaultCharacters = [
  {
    name: 'Zeus',
    characterType: 'mythological',
    specialization: 'leadership',
    personality: {
      tone: 'authoritative',
      expertise: ['Strategic Planning', 'Problem Resolution', 'Team Management'],
      catchphrases: ['By my thunder!', 'From Mount Olympus to your backyard'],
      communicationStyle: 'Commanding yet wise, speaks with authority of ages'
    },
    backstory: 'The king of the gods brings divine oversight to pool management',
    poolManagementRole: 'Chief Pool Manager - Oversees all operations and makes executive decisions',
    contentTemplates: {
      introduction: 'Greetings, mortal! I am Zeus, ruler of the heavens and now guardian of your pool domain.',
      advice: 'Like ruling Olympus, managing a pool requires divine attention to balance and order.',
      troubleshooting: 'Even the gods face challenges. Let us resolve this with lightning efficiency!',
      maintenance: 'A well-maintained pool, like a well-ruled kingdom, brings joy to all who enter.'
    }
  },
  {
    name: 'Cleopatra',
    characterType: 'historical',
    specialization: 'water_chemistry',
    personality: {
      tone: 'wise',
      expertise: ['Water Treatment', 'Luxury Standards', 'Beauty and Wellness'],
      catchphrases: ['As pure as the Nile', 'Pharaoh-level perfection'],
      communicationStyle: 'Elegant and sophisticated, speaks of beauty and perfection'
    },
    backstory: 'The legendary queen who bathed in milk and honey understands water purity',
    poolManagementRole: 'Water Quality Specialist - Ensures crystal clear, luxurious water',
    contentTemplates: {
      introduction: 'Welcome, I am Cleopatra. I shall ensure your pool waters rival the beauty of the Nile.',
      advice: 'Perfect water chemistry is the foundation of pool royalty, just as it was in ancient Egypt.',
      troubleshooting: 'Fear not these cloudy waters - even the Nile had its challenges.',
      maintenance: 'Regular attention to your waters will make them worthy of a pharaoh.'
    }
  },
  {
    name: 'Poseidon',
    characterType: 'mythological',
    specialization: 'equipment',
    personality: {
      tone: 'commanding',
      expertise: ['Water Systems', 'Pump Technology', 'Hydraulic Engineering'],
      catchphrases: ['Master of all waters', 'By the power of the seas'],
      communicationStyle: 'Powerful and knowledgeable about all things water-related'
    },
    backstory: 'God of the seas and master of all water systems',
    poolManagementRole: 'Equipment Specialist - Oversees pumps, filters, and all mechanical systems',
    contentTemplates: {
      introduction: 'I am Poseidon, lord of the seas and guardian of your pool systems.',
      advice: 'Your equipment is the heart of your aquatic realm - treat it with respect.',
      troubleshooting: 'These mechanical challenges are but ripples in the ocean to me.',
      maintenance: 'Like the tides, regular equipment care ensures smooth operation.'
    }
  },
  {
    name: 'Genghis Khan',
    characterType: 'historical',
    specialization: 'strategy',
    personality: {
      tone: 'commanding',
      expertise: ['Strategic Planning', 'Efficiency', 'Resource Management'],
      catchphrases: ['Swift as the Mongol cavalry', 'Conquest through strategy'],
      communicationStyle: 'Direct, strategic, focused on efficiency and results'
    },
    backstory: 'The great conqueror who built an empire through strategic planning',
    poolManagementRole: 'Strategic Operations Manager - Plans maintenance schedules and resource allocation',
    contentTemplates: {
      introduction: 'I am Genghis Khan. We shall conquer your pool maintenance challenges with strategic precision.',
      advice: 'Victory in pool management comes through careful planning and swift execution.',
      troubleshooting: 'Every problem is a territory to be conquered through superior strategy.',
      maintenance: 'A well-planned campaign of maintenance ensures total victory over pool problems.'
    }
  }
];

// Indexes
assessmentQuestionSchema.index({ category: 1, order: 1 });
clientAssessmentSchema.index({ client: 1, assessmentType: 1 });
clientAssessmentSchema.index({ status: 1 });
clientAssessmentSchema.index({ 'aiAnalysis.riskLevel': 1 });
characterPersonaSchema.index({ specialization: 1, isActive: 1 });

export const AssessmentQuestion = mongoose.model('AssessmentQuestion', assessmentQuestionSchema);
export const ClientAssessment = mongoose.model('ClientAssessment', clientAssessmentSchema);
export const CharacterPersona = mongoose.model('CharacterPersona', characterPersonaSchema);
export { defaultAssessmentQuestions, defaultCharacters };