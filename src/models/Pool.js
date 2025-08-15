import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

const waterChemistrySchema = new mongoose.Schema({
  pH: {
    type: Number,
    required: true,
    min: 0,
    max: 14
  },
  chlorine: {
    type: Number,
    required: true,
    min: 0
  },
  alkalinity: {
    type: Number,
    required: true,
    min: 0
  },
  hardness: {
    type: Number,
    required: true,
    min: 0
  },
  cyanuricAcid: {
    type: Number,
    default: 0,
    min: 0
  },
  temperature: {
    type: Number,
    required: true
  },
  testedAt: {
    type: Date,
    default: Date.now
  },
  testedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: String
});

const equipmentSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['pump', 'filter', 'heater', 'chlorinator', 'vacuum', 'skimmer', 'other']
  },
  brand: String,
  model: String,
  serialNumber: String,
  installDate: Date,
  lastServiceDate: Date,
  nextServiceDate: Date,
  warrantyExpiration: Date,
  status: {
    type: String,
    enum: ['working', 'needs_attention', 'broken', 'under_maintenance'],
    default: 'working'
  },
  notes: String
});

const poolSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  poolType: {
    type: String,
    required: true,
    enum: ['inground', 'above_ground', 'spa', 'hot_tub', 'commercial']
  },
  surfaceType: {
    type: String,
    enum: ['concrete', 'vinyl', 'fiberglass', 'tile', 'other']
  },
  dimensions: {
    length: Number,
    width: Number,
    depth: {
      shallow: Number,
      deep: Number
    },
    volume: Number // in gallons
  },
  waterChemistry: [waterChemistrySchema],
  equipment: [equipmentSchema],
  maintenanceSchedule: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'bi-weekly', 'monthly'],
      default: 'weekly'
    },
    preferredDay: {
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    },
    timeSlot: String,
    lastMaintenance: Date,
    nextMaintenance: Date
  },
  specialInstructions: String,
  photos: [{
    url: String,
    caption: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Virtual for latest water chemistry reading
poolSchema.virtual('latestWaterChemistry').get(function() {
  if (this.waterChemistry && this.waterChemistry.length > 0) {
    return this.waterChemistry.sort((a, b) => new Date(b.testedAt) - new Date(a.testedAt))[0];
  }
  return null;
});

// Method to check if pool needs attention
poolSchema.methods.needsAttention = function() {
  const latest = this.latestWaterChemistry;
  if (!latest) return true;
  
  // Check if readings are within acceptable ranges
  const phOk = latest.pH >= 7.2 && latest.pH <= 7.6;
  const chlorineOk = latest.chlorine >= 1.0 && latest.chlorine <= 3.0;
  const alkalinityOk = latest.alkalinity >= 80 && latest.alkalinity <= 120;
  
  // Check if reading is recent (within last 7 days)
  const recentReading = new Date() - new Date(latest.testedAt) <= 7 * 24 * 60 * 60 * 1000;
  
  return !phOk || !chlorineOk || !alkalinityOk || !recentReading;
};

// Method to get AI recommendations
poolSchema.methods.getRecommendations = function() {
  const latest = this.latestWaterChemistry;
  const recommendations = [];
  
  if (!latest) {
    recommendations.push({
      type: 'urgent',
      message: 'Water chemistry test needed immediately'
    });
    return recommendations;
  }
  
  // pH recommendations
  if (latest.pH < 7.2) {
    recommendations.push({
      type: 'chemical',
      message: 'pH is too low. Add sodium carbonate (soda ash) to raise pH.',
      priority: 'high'
    });
  } else if (latest.pH > 7.6) {
    recommendations.push({
      type: 'chemical',
      message: 'pH is too high. Add muriatic acid or sodium bisulfate to lower pH.',
      priority: 'high'
    });
  }
  
  // Chlorine recommendations
  if (latest.chlorine < 1.0) {
    recommendations.push({
      type: 'chemical',
      message: 'Chlorine level is too low. Add chlorine shock or liquid chlorine.',
      priority: 'urgent'
    });
  } else if (latest.chlorine > 3.0) {
    recommendations.push({
      type: 'safety',
      message: 'Chlorine level is too high. Allow levels to decrease before swimming.',
      priority: 'medium'
    });
  }
  
  // Alkalinity recommendations
  if (latest.alkalinity < 80) {
    recommendations.push({
      type: 'chemical',
      message: 'Total alkalinity is low. Add sodium bicarbonate to increase alkalinity.',
      priority: 'medium'
    });
  } else if (latest.alkalinity > 120) {
    recommendations.push({
      type: 'chemical',
      message: 'Total alkalinity is high. Add muriatic acid to decrease alkalinity.',
      priority: 'medium'
    });
  }
  
  return recommendations;
};

// Indexes for better query performance
poolSchema.index({ owner: 1 });
poolSchema.index({ 'address.zipCode': 1 });
poolSchema.index({ poolType: 1 });
poolSchema.index({ isActive: 1 });
poolSchema.index({ 'waterChemistry.testedAt': -1 });

// Add pagination plugin
poolSchema.plugin(mongoosePaginate);

export default mongoose.model('Pool', poolSchema);