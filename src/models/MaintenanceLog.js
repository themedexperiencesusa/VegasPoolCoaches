import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

const taskSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  category: {
    type: String,
    enum: ['cleaning', 'chemical', 'equipment', 'inspection', 'repair', 'other'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'skipped', 'failed'],
    default: 'pending'
  },
  estimatedDuration: Number, // in minutes
  actualDuration: Number, // in minutes
  notes: String,
  photoBefore: String,
  photoAfter: String,
  completedAt: Date
});

const maintenanceLogSchema = new mongoose.Schema({
  pool: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pool',
    required: true
  },
  technician: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  scheduledDate: {
    type: Date,
    required: true
  },
  actualStartTime: Date,
  actualEndTime: Date,
  type: {
    type: String,
    enum: ['routine', 'emergency', 'seasonal', 'repair', 'inspection', 'custom'],
    default: 'routine'
  },
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'cancelled', 'no_show'],
    default: 'scheduled'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  tasks: [taskSchema],
  waterChemistryBefore: {
    pH: Number,
    chlorine: Number,
    alkalinity: Number,
    hardness: Number,
    cyanuricAcid: Number,
    temperature: Number
  },
  waterChemistryAfter: {
    pH: Number,
    chlorine: Number,
    alkalinity: Number,
    hardness: Number,
    cyanuricAcid: Number,
    temperature: Number
  },
  chemicalsUsed: [{
    name: String,
    amount: Number,
    unit: String,
    cost: Number,
    notes: String
  }],
  equipmentChecked: [{
    type: String,
    status: {
      type: String,
      enum: ['good', 'needs_attention', 'requires_repair', 'requires_replacement']
    },
    notes: String,
    actionTaken: String
  }],
  issues: [{
    type: {
      type: String,
      enum: ['equipment', 'water_quality', 'structural', 'safety', 'other']
    },
    severity: {
      type: String,
      enum: ['minor', 'moderate', 'major', 'critical']
    },
    description: String,
    resolution: String,
    followUpRequired: Boolean,
    followUpDate: Date,
    photos: [String]
  }],
  recommendations: [{
    type: {
      type: String,
      enum: ['immediate', 'within_week', 'within_month', 'seasonal', 'annual']
    },
    category: String,
    description: String,
    estimatedCost: Number,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent']
    }
  }],
  weather: {
    temperature: Number,
    humidity: Number,
    windSpeed: Number,
    conditions: String, // sunny, cloudy, rainy, etc.
    notes: String
  },
  customerFeedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comments: String,
    concerns: String
  },
  workOrder: {
    number: String,
    estimatedCost: Number,
    actualCost: Number,
    billingStatus: {
      type: String,
      enum: ['pending', 'invoiced', 'paid', 'overdue']
    }
  },
  photos: [{
    url: String,
    caption: String,
    category: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  timeSpent: {
    travel: Number, // minutes
    onSite: Number, // minutes
    total: Number   // minutes
  },
  notes: String,
  internalNotes: String, // Private notes for technicians
  nextServiceDate: Date,
  followUpRequired: {
    type: Boolean,
    default: false
  },
  followUpReason: String,
  signatureUrl: String, // Customer signature for service completion
  isEmergency: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Virtual for total duration
maintenanceLogSchema.virtual('totalDuration').get(function() {
  if (this.actualStartTime && this.actualEndTime) {
    return Math.round((this.actualEndTime - this.actualStartTime) / (1000 * 60)); // in minutes
  }
  return null;
});

// Virtual for completion percentage
maintenanceLogSchema.virtual('completionPercentage').get(function() {
  if (!this.tasks || this.tasks.length === 0) return 0;
  
  const completedTasks = this.tasks.filter(task => task.status === 'completed').length;
  return Math.round((completedTasks / this.tasks.length) * 100);
});

// Method to calculate service quality score
maintenanceLogSchema.methods.calculateQualityScore = function() {
  let score = 100;
  
  // Deduct points for incomplete tasks
  const incompleteTasks = this.tasks.filter(task => 
    task.status === 'failed' || task.status === 'skipped'
  ).length;
  score -= incompleteTasks * 10;
  
  // Deduct points for issues found
  const criticalIssues = this.issues.filter(issue => issue.severity === 'critical').length;
  const majorIssues = this.issues.filter(issue => issue.severity === 'major').length;
  score -= criticalIssues * 20 + majorIssues * 10;
  
  // Add points for customer satisfaction
  if (this.customerFeedback && this.customerFeedback.rating) {
    score += (this.customerFeedback.rating - 3) * 5; // Neutral is 3, so +/- from there
  }
  
  // Ensure score is between 0 and 100
  return Math.max(0, Math.min(100, score));
};

// Method to check if maintenance is overdue
maintenanceLogSchema.methods.isOverdue = function() {
  return this.scheduledDate < new Date() && this.status === 'scheduled';
};

// Method to generate maintenance summary
maintenanceLogSchema.methods.generateSummary = function() {
  const summary = {
    completionStatus: this.status,
    completionPercentage: this.completionPercentage,
    qualityScore: this.calculateQualityScore(),
    totalTasks: this.tasks.length,
    completedTasks: this.tasks.filter(t => t.status === 'completed').length,
    issuesFound: this.issues.length,
    recommendationsGiven: this.recommendations.length,
    chemicalsUsed: this.chemicalsUsed.length,
    timeSpent: this.totalDuration || this.timeSpent?.total || 0
  };
  
  return summary;
};

// Pre-save middleware to update next service date
maintenanceLogSchema.pre('save', function(next) {
  // Auto-calculate total time spent if individual components are provided
  if (this.timeSpent && (this.timeSpent.travel || this.timeSpent.onSite)) {
    this.timeSpent.total = (this.timeSpent.travel || 0) + (this.timeSpent.onSite || 0);
  }
  
  // Set actual end time if status is completed and no end time is set
  if (this.status === 'completed' && this.actualStartTime && !this.actualEndTime) {
    this.actualEndTime = new Date();
  }
  
  next();
});

// Indexes for better query performance
maintenanceLogSchema.index({ pool: 1, scheduledDate: -1 });
maintenanceLogSchema.index({ technician: 1, scheduledDate: -1 });
maintenanceLogSchema.index({ status: 1 });
maintenanceLogSchema.index({ type: 1 });
maintenanceLogSchema.index({ scheduledDate: 1 });
maintenanceLogSchema.index({ priority: 1 });
maintenanceLogSchema.index({ 'workOrder.billingStatus': 1 });

// Add pagination plugin
maintenanceLogSchema.plugin(mongoosePaginate);

export default mongoose.model('MaintenanceLog', maintenanceLogSchema);