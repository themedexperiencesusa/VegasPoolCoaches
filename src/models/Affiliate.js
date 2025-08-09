import mongoose from 'mongoose';

const affiliatePartnerSchema = new mongoose.Schema({
  businessName: {
    type: String,
    required: true
  },
  legalBusinessName: String,
  businessType: {
    type: String,
    enum: ['pool_repair', 'equipment_supplier', 'chemical_supplier', 'pool_builder', 'landscaping', 'solar', 'other'],
    required: true
  },
  contactInfo: {
    primaryContact: {
      name: {
        type: String,
        required: true
      },
      title: String,
      email: {
        type: String,
        required: true
      },
      phone: String
    },
    businessAddress: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: {
        type: String,
        default: 'USA'
      }
    },
    website: String,
    socialMedia: {
      facebook: String,
      instagram: String,
      linkedin: String,
      youtube: String
    }
  },
  businessDetails: {
    yearsInBusiness: Number,
    numberOfEmployees: String,
    serviceAreas: [String], // Zip codes or cities served
    specializations: [String],
    certifications: [String],
    insuranceInfo: {
      hasLiability: Boolean,
      policyAmount: Number,
      expirationDate: Date,
      certificateUrl: String
    },
    licenses: [{
      type: String,
      number: String,
      state: String,
      expirationDate: Date
    }]
  },
  partnershipTerms: {
    commissionRate: {
      type: Number,
      default: 0.10 // 10% default
    },
    paymentTerms: {
      type: String,
      enum: ['net_30', 'net_45', 'net_60', 'immediate'],
      default: 'net_30'
    },
    minimumOrder: Number,
    preferredCustomer: Boolean,
    exclusiveDeals: Boolean,
    marketingSupport: Boolean
  },
  performanceMetrics: {
    totalReferrals: {
      type: Number,
      default: 0
    },
    successfulReferrals: {
      type: Number,
      default: 0
    },
    totalRevenue: {
      type: Number,
      default: 0
    },
    averageJobValue: Number,
    customerSatisfactionRating: {
      type: Number,
      min: 1,
      max: 5
    },
    responseTime: Number, // hours
    completionRate: {
      type: Number,
      min: 0,
      max: 1
    }
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'suspended', 'terminated'],
    default: 'pending'
  },
  agreementDate: Date,
  lastActivityDate: Date,
  notes: String
}, {
  timestamps: true
});

const sponsorshipPackageSchema = new mongoose.Schema({
  packageName: {
    type: String,
    required: true
  },
  tier: {
    type: String,
    enum: ['bronze', 'silver', 'gold', 'platinum', 'diamond'],
    required: true
  },
  pricing: {
    monthly: Number,
    quarterly: Number,
    annual: Number,
    setup_fee: Number
  },
  benefits: [{
    type: String,
    description: String,
    value: String
  }],
  marketingBenefits: {
    websiteListing: {
      featured: Boolean,
      logo: Boolean,
      description: Boolean,
      contactInfo: Boolean
    },
    youtubeIntegration: {
      videoMentions: Number,
      characterEndorsements: [String],
      customContent: Boolean
    },
    emailMarketing: {
      newsletterMentions: Number,
      dedicatedCampaign: Boolean
    },
    socialMedia: {
      posts: Number,
      stories: Number,
      customContent: Boolean
    },
    assessmentIntegration: {
      preferredProvider: Boolean,
      automatedReferrals: Boolean,
      customRecommendations: Boolean
    }
  },
  limitations: [{
    type: String,
    description: String
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const sponsorshipAgreementSchema = new mongoose.Schema({
  sponsor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AffiliatePartner',
    required: true
  },
  package: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SponsorshipPackage',
    required: true
  },
  customTerms: {
    pricing: {
      monthly: Number,
      quarterly: Number,
      annual: Number
    },
    additionalBenefits: [String],
    exclusions: [String],
    performanceRequirements: {
      minimumLeads: Number,
      minimumRevenue: Number,
      responseTimeRequirement: Number
    }
  },
  contractDetails: {
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    autoRenewal: {
      type: Boolean,
      default: false
    },
    renewalTerms: String,
    terminationClause: String,
    paymentSchedule: {
      type: String,
      enum: ['monthly', 'quarterly', 'annually', 'upfront'],
      default: 'monthly'
    }
  },
  status: {
    type: String,
    enum: ['draft', 'pending_approval', 'active', 'expired', 'terminated'],
    default: 'draft'
  },
  signedDate: Date,
  lastPaymentDate: Date,
  nextPaymentDate: Date,
  totalPaid: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

const referralTrackingSchema = new mongoose.Schema({
  affiliate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AffiliatePartner',
    required: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assessment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClientAssessment'
  },
  referralType: {
    type: String,
    enum: ['manual', 'automated', 'emergency', 'upgrade'],
    default: 'automated'
  },
  serviceCategory: {
    type: String,
    enum: ['equipment_repair', 'chemical_service', 'cleaning', 'construction', 'emergency', 'consultation'],
    required: true
  },
  urgency: {
    type: String,
    enum: ['low', 'medium', 'high', 'emergency'],
    default: 'medium'
  },
  estimatedValue: Number,
  actualValue: Number,
  status: {
    type: String,
    enum: ['sent', 'acknowledged', 'scheduled', 'in_progress', 'completed', 'cancelled'],
    default: 'sent'
  },
  clientFeedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comments: String,
    wouldRecommend: Boolean
  },
  commissionEarned: Number,
  commissionPaid: {
    type: Boolean,
    default: false
  },
  paymentDate: Date,
  notes: String
}, {
  timestamps: true
});

const youtubeIntegrationSchema = new mongoose.Schema({
  channelId: {
    type: String,
    required: true
  },
  channelName: String,
  apiKey: String,
  webhookUrl: String,
  contentCategories: [{
    name: String,
    description: String,
    characters: [String], // Which characters appear in this category
    keywords: [String],
    sponsorOpportunities: Boolean
  }],
  videoTemplates: [{
    templateName: String,
    character: String,
    topic: String,
    duration: String,
    sponsorSlots: [{
      position: String, // 'pre-roll', 'mid-roll', 'post-roll', 'overlay'
      duration: Number,
      maxSponsors: Number
    }]
  }],
  uploadSchedule: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'bi-weekly', 'monthly'],
      default: 'weekly'
    },
    preferredDays: [String],
    preferredTime: String
  },
  analytics: {
    totalViews: Number,
    totalSubscribers: Number,
    averageWatchTime: Number,
    engagementRate: Number,
    lastSyncDate: Date
  }
}, {
  timestamps: true
});

// Default sponsorship packages
const defaultSponsorshipPackages = [
  {
    packageName: 'Bronze Partner',
    tier: 'bronze',
    pricing: {
      monthly: 299,
      quarterly: 799,
      annual: 2999,
      setup_fee: 99
    },
    benefits: [
      { type: 'listing', description: 'Basic website listing', value: 'included' },
      { type: 'referrals', description: 'Assessment-based referrals', value: 'standard_queue' },
      { type: 'support', description: 'Email support', value: 'business_hours' }
    ],
    marketingBenefits: {
      websiteListing: {
        featured: false,
        logo: true,
        description: true,
        contactInfo: true
      },
      youtubeIntegration: {
        videoMentions: 2,
        characterEndorsements: [],
        customContent: false
      },
      emailMarketing: {
        newsletterMentions: 1,
        dedicatedCampaign: false
      },
      assessmentIntegration: {
        preferredProvider: false,
        automatedReferrals: true,
        customRecommendations: false
      }
    }
  },
  {
    packageName: 'Gold Partner',
    tier: 'gold',
    pricing: {
      monthly: 799,
      quarterly: 2199,
      annual: 7999,
      setup_fee: 199
    },
    benefits: [
      { type: 'listing', description: 'Featured website placement', value: 'homepage_featured' },
      { type: 'referrals', description: 'Priority referrals', value: 'priority_queue' },
      { type: 'content', description: 'Custom character endorsements', value: '2_characters' },
      { type: 'support', description: 'Phone support', value: '24_7' }
    ],
    marketingBenefits: {
      websiteListing: {
        featured: true,
        logo: true,
        description: true,
        contactInfo: true
      },
      youtubeIntegration: {
        videoMentions: 8,
        characterEndorsements: ['Zeus', 'Poseidon'],
        customContent: true
      },
      emailMarketing: {
        newsletterMentions: 4,
        dedicatedCampaign: true
      },
      assessmentIntegration: {
        preferredProvider: true,
        automatedReferrals: true,
        customRecommendations: true
      }
    }
  }
];

// Indexes
affiliatePartnerSchema.index({ businessType: 1, status: 1 });
affiliatePartnerSchema.index({ 'contactInfo.businessAddress.zipCode': 1 });
sponsorshipAgreementSchema.index({ sponsor: 1, status: 1 });
referralTrackingSchema.index({ affiliate: 1, status: 1 });
referralTrackingSchema.index({ client: 1, createdAt: -1 });
youtubeIntegrationSchema.index({ channelId: 1 });

export const AffiliatePartner = mongoose.model('AffiliatePartner', affiliatePartnerSchema);
export const SponsorshipPackage = mongoose.model('SponsorshipPackage', sponsorshipPackageSchema);
export const SponsorshipAgreement = mongoose.model('SponsorshipAgreement', sponsorshipAgreementSchema);
export const ReferralTracking = mongoose.model('ReferralTracking', referralTrackingSchema);
export const YoutubeIntegration = mongoose.model('YoutubeIntegration', youtubeIntegrationSchema);
export { defaultSponsorshipPackages };