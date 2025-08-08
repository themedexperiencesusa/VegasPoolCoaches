import mongoose from 'mongoose';

const legalDocumentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['ndanca', 'service_agreement', 'indemnity', 'privacy_policy', 'terms_of_service'],
    required: true
  },
  version: {
    type: String,
    required: true,
    default: '1.0'
  },
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  variables: [{
    name: String,
    description: String,
    type: {
      type: String,
      enum: ['text', 'date', 'number', 'boolean'],
      default: 'text'
    },
    required: {
      type: Boolean,
      default: false
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  effectiveDate: {
    type: Date,
    default: Date.now
  },
  expirationDate: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

const clientAgreementSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  document: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LegalDocument',
    required: true
  },
  documentType: {
    type: String,
    enum: ['ndanca', 'service_agreement', 'indemnity', 'privacy_policy', 'terms_of_service'],
    required: true
  },
  signedContent: {
    type: String,
    required: true
  },
  variableValues: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  status: {
    type: String,
    enum: ['draft', 'sent', 'signed', 'declined', 'expired'],
    default: 'draft'
  },
  docusignEnvelopeId: String,
  docusignStatus: String,
  sentDate: Date,
  signedDate: Date,
  ipAddress: String,
  location: {
    type: String,
    default: 'Electronic Signature'
  },
  witnessInfo: {
    name: String,
    email: String,
    signedDate: Date
  },
  legalRepresentative: {
    name: String,
    title: String,
    barNumber: String,
    state: String
  }
}, {
  timestamps: true
});

const indemnityClauseSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  serviceType: {
    type: String,
    enum: ['pool_maintenance', 'chemical_treatment', 'equipment_repair', 'consultation', 'emergency_service'],
    required: true
  },
  coverageAmount: {
    type: Number,
    default: 1000000 // $1M default coverage
  },
  effectiveDate: {
    type: Date,
    required: true
  },
  expirationDate: {
    type: Date,
    required: true
  },
  terms: {
    clientLiability: {
      type: String,
      default: 'Client agrees to hold harmless and indemnify VegasPoolCoaches from any claims arising from property damage, personal injury, or equipment malfunction not directly caused by gross negligence of service provider.'
    },
    providerLiability: {
      type: String,
      default: 'VegasPoolCoaches maintains professional liability insurance and agrees to remedy any damage directly caused by our services within the scope of coverage.'
    },
    exclusions: [{
      type: String
    }],
    disputeResolution: {
      type: String,
      default: 'Any disputes shall be resolved through binding arbitration in Clark County, Nevada.'
    }
  },
  insuranceCertificate: String,
  status: {
    type: String,
    enum: ['active', 'expired', 'suspended'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Default legal document templates
const defaultTemplates = {
  ndanca: {
    title: 'Non-Disclosure and Non-Compete Agreement',
    content: `
NON-DISCLOSURE AND NON-COMPETE AGREEMENT

This Non-Disclosure and Non-Compete Agreement ("Agreement") is entered into on {{DATE}} between VegasPoolCoaches LLC, a Nevada limited liability company ("Company"), and {{CLIENT_NAME}} ("Client").

1. CONFIDENTIAL INFORMATION
Client acknowledges that Company's proprietary methods, customer lists, pricing strategies, AI algorithms, assessment procedures, and business processes constitute confidential and proprietary information.

2. NON-DISCLOSURE
Client agrees not to disclose, distribute, or use any confidential information obtained through services for any purpose other than the intended pool maintenance services.

3. NON-COMPETE
For a period of {{NON_COMPETE_PERIOD}} months following termination of services, Client agrees not to:
- Directly compete with Company in the pool maintenance industry within {{GEOGRAPHIC_RADIUS}} miles of Las Vegas, Nevada
- Solicit Company's employees, contractors, or clients
- Use Company's proprietary methods or processes

4. REMEDIES
Client acknowledges that breach of this Agreement would cause irreparable harm and agrees to liquidated damages of {{LIQUIDATED_DAMAGES}} in addition to injunctive relief.

5. GOVERNING LAW
This Agreement shall be governed by Nevada state law and disputes resolved in Clark County, Nevada.

By signing below, parties acknowledge they have read, understood, and agree to be bound by this Agreement.

_________________________                    _________________________
{{CLIENT_NAME}}                              VegasPoolCoaches LLC
Date: {{DATE}}                               Date: {{DATE}}
    `,
    variables: [
      { name: 'CLIENT_NAME', description: 'Full legal name of client', type: 'text', required: true },
      { name: 'DATE', description: 'Agreement date', type: 'date', required: true },
      { name: 'NON_COMPETE_PERIOD', description: 'Non-compete period in months', type: 'number', required: true },
      { name: 'GEOGRAPHIC_RADIUS', description: 'Geographic restriction radius in miles', type: 'number', required: true },
      { name: 'LIQUIDATED_DAMAGES', description: 'Liquidated damages amount', type: 'text', required: true }
    ]
  },
  
  service_agreement: {
    title: 'VegasPoolCoaches Service Agreement',
    content: `
VEGASPOOLCOACHES SERVICE AGREEMENT

This Service Agreement ("Agreement") is entered into on {{DATE}} between VegasPoolCoaches LLC ("Company") and {{CLIENT_NAME}} ("Client").

1. SERVICES PROVIDED
Company agrees to provide pool maintenance services including:
- Water chemistry testing and balancing
- Pool cleaning and debris removal  
- Equipment inspection and basic maintenance
- Chemical application and monitoring
- AI-powered analysis and recommendations
- Virtual assessment and reporting

2. SERVICE SCHEDULE
Services will be provided {{SERVICE_FREQUENCY}} beginning {{START_DATE}}.
Emergency services available 24/7 with additional charges.

3. PAYMENT TERMS
- Monthly Service Fee: {{MONTHLY_FEE}}
- Payment due on the {{PAYMENT_DUE_DAY}} of each month
- Late payment fee: {{LATE_FEE}} after {{GRACE_PERIOD}} days
- Accepted payment methods: Credit card, ACH, check

4. CLIENT RESPONSIBILITIES
Client agrees to:
- Provide safe access to pool area
- Maintain adequate chemical storage
- Report equipment malfunctions promptly
- Comply with local health and safety regulations

5. LIABILITY AND INDEMNIFICATION
Client agrees to indemnify Company against claims not arising from Company's gross negligence. Company maintains {{INSURANCE_AMOUNT}} professional liability insurance.

6. TERMINATION
Either party may terminate with {{TERMINATION_NOTICE}} days written notice. Client remains liable for services rendered through termination date.

7. DISPUTE RESOLUTION
Disputes shall be resolved through binding arbitration in Clark County, Nevada under Nevada Revised Statutes.

_________________________                    _________________________
{{CLIENT_NAME}}                              VegasPoolCoaches LLC  
Date: {{DATE}}                               Date: {{DATE}}
    `,
    variables: [
      { name: 'CLIENT_NAME', description: 'Full legal name of client', type: 'text', required: true },
      { name: 'DATE', description: 'Agreement date', type: 'date', required: true },
      { name: 'SERVICE_FREQUENCY', description: 'How often services are provided', type: 'text', required: true },
      { name: 'START_DATE', description: 'Service start date', type: 'date', required: true },
      { name: 'MONTHLY_FEE', description: 'Monthly service fee', type: 'text', required: true },
      { name: 'PAYMENT_DUE_DAY', description: 'Day of month payment is due', type: 'number', required: true },
      { name: 'LATE_FEE', description: 'Late payment fee amount', type: 'text', required: true },
      { name: 'GRACE_PERIOD', description: 'Grace period before late fee', type: 'number', required: true },
      { name: 'INSURANCE_AMOUNT', description: 'Insurance coverage amount', type: 'text', required: true },
      { name: 'TERMINATION_NOTICE', description: 'Required notice period for termination', type: 'number', required: true }
    ]
  }
};

// Indexes
legalDocumentSchema.index({ type: 1, version: 1 });
legalDocumentSchema.index({ isActive: 1 });
clientAgreementSchema.index({ client: 1, documentType: 1 });
clientAgreementSchema.index({ status: 1 });
indemnityClauseSchema.index({ client: 1, serviceType: 1 });
indemnityClauseSchema.index({ status: 1, expirationDate: 1 });

export const LegalDocument = mongoose.model('LegalDocument', legalDocumentSchema);
export const ClientAgreement = mongoose.model('ClientAgreement', clientAgreementSchema);
export const IndemnityClause = mongoose.model('IndemnityClause', indemnityClauseSchema);
export { defaultTemplates };