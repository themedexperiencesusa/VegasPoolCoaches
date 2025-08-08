import express from 'express';
import Joi from 'joi';
import { authenticateToken, authorize } from '../middleware/auth.js';
import { LegalDocument, ClientAgreement, IndemnityClause, defaultTemplates } from '../models/LegalDocument.js';

const router = express.Router();

// Validation schemas
const generateDocumentSchema = Joi.object({
  documentType: Joi.string().valid('ndanca', 'service_agreement', 'indemnity', 'privacy_policy', 'terms_of_service').required(),
  clientId: Joi.string().required(),
  variables: Joi.object().required(),
  autoSend: Joi.boolean().default(false)
});

const docusignSchema = Joi.object({
  envelopeId: Joi.string().required(),
  status: Joi.string().required(),
  signedDate: Joi.date(),
  ipAddress: Joi.string(),
  location: Joi.string()
});

// @route   GET /api/legal/templates
// @desc    Get available document templates
// @access  Private
router.get('/templates', authenticateToken, async (req, res, next) => {
  try {
    const templates = await LegalDocument.find({ isActive: true }).select('type title version variables');
    
    res.json({
      success: true,
      data: { templates }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/legal/generate
// @desc    Generate a legal document for a client
// @access  Private (Admin/Consultant only)
router.post('/generate', authenticateToken, authorize(['admin', 'consultant']), async (req, res, next) => {
  try {
    const { error, value } = generateDocumentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    const { documentType, clientId, variables, autoSend } = value;

    // Get the document template
    let template = await LegalDocument.findOne({ 
      type: documentType, 
      isActive: true 
    }).sort({ version: -1 });

    // If no custom template, use default
    if (!template && defaultTemplates[documentType]) {
      template = {
        ...defaultTemplates[documentType],
        type: documentType,
        version: '1.0'
      };
    }

    if (!template) {
      return res.status(404).json({
        success: false,
        error: { message: 'Document template not found' }
      });
    }

    // Replace variables in template
    let processedContent = template.content;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      processedContent = processedContent.replace(new RegExp(placeholder, 'g'), value);
    }

    // Create client agreement
    const clientAgreement = new ClientAgreement({
      client: clientId,
      document: template._id,
      documentType,
      signedContent: processedContent,
      variableValues: variables,
      status: autoSend ? 'sent' : 'draft',
      sentDate: autoSend ? new Date() : undefined
    });

    await clientAgreement.save();

    // TODO: Integrate with DocuSign if autoSend is true
    if (autoSend) {
      // Placeholder for DocuSign integration
      console.log('Would send to DocuSign:', clientAgreement._id);
    }

    res.status(201).json({
      success: true,
      data: {
        agreement: clientAgreement,
        message: autoSend ? 'Document sent for signature' : 'Document generated successfully'
      }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/legal/agreements/:clientId
// @desc    Get all agreements for a client
// @access  Private
router.get('/agreements/:clientId', authenticateToken, async (req, res, next) => {
  try {
    const { clientId } = req.params;

    // Check permissions
    if (req.user.role === 'customer' && req.user._id.toString() !== clientId) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied' }
      });
    }

    const agreements = await ClientAgreement.find({ client: clientId })
      .populate('document', 'title type version')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: { agreements }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/legal/agreement/:agreementId
// @desc    Get specific agreement details
// @access  Private
router.get('/agreement/:agreementId', authenticateToken, async (req, res, next) => {
  try {
    const { agreementId } = req.params;

    const agreement = await ClientAgreement.findById(agreementId)
      .populate('client', 'firstName lastName email')
      .populate('document', 'title type version');

    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: { message: 'Agreement not found' }
      });
    }

    // Check permissions
    if (req.user.role === 'customer' && req.user._id.toString() !== agreement.client._id.toString()) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied' }
      });
    }

    res.json({
      success: true,
      data: { agreement }
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/legal/docusign-webhook
// @desc    Handle DocuSign webhook notifications
// @access  Public (webhook)
router.post('/docusign-webhook', async (req, res, next) => {
  try {
    // TODO: Verify webhook authenticity
    const { error, value } = docusignSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    const { envelopeId, status, signedDate, ipAddress, location } = value;

    // Find agreement by DocuSign envelope ID
    const agreement = await ClientAgreement.findOne({ docusignEnvelopeId: envelopeId });
    
    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: { message: 'Agreement not found for envelope' }
      });
    }

    // Update agreement status
    agreement.docusignStatus = status;
    
    if (status === 'completed') {
      agreement.status = 'signed';
      agreement.signedDate = signedDate || new Date();
      agreement.ipAddress = ipAddress;
      agreement.location = location || 'Electronic Signature';
    } else if (status === 'declined') {
      agreement.status = 'declined';
    }

    await agreement.save();

    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    next(error);
  }
});

// @route   POST /api/legal/indemnity
// @desc    Create indemnity clause for client
// @access  Private (Admin/Consultant only)
router.post('/indemnity', authenticateToken, authorize(['admin', 'consultant']), async (req, res, next) => {
  try {
    const { error, value } = Joi.object({
      clientId: Joi.string().required(),
      serviceType: Joi.string().valid('pool_maintenance', 'chemical_treatment', 'equipment_repair', 'consultation', 'emergency_service').required(),
      coverageAmount: Joi.number().default(1000000),
      effectiveDate: Joi.date().required(),
      expirationDate: Joi.date().required(),
      customTerms: Joi.object()
    }).validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: { message: error.details[0].message }
      });
    }

    const indemnityClause = new IndemnityClause({
      client: value.clientId,
      serviceType: value.serviceType,
      coverageAmount: value.coverageAmount,
      effectiveDate: value.effectiveDate,
      expirationDate: value.expirationDate,
      ...(value.customTerms && { terms: { ...indemnityClause.terms, ...value.customTerms } })
    });

    await indemnityClause.save();

    res.status(201).json({
      success: true,
      data: { indemnityClause }
    });

  } catch (error) {
    next(error);
  }
});

// @route   GET /api/legal/compliance/:clientId
// @desc    Get client compliance status
// @access  Private
router.get('/compliance/:clientId', authenticateToken, async (req, res, next) => {
  try {
    const { clientId } = req.params;

    // Check permissions
    if (req.user.role === 'customer' && req.user._id.toString() !== clientId) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied' }
      });
    }

    // Get all agreements for client
    const agreements = await ClientAgreement.find({ client: clientId });
    const indemnityClause = await IndemnityClause.findOne({ 
      client: clientId, 
      status: 'active',
      expirationDate: { $gt: new Date() }
    });

    // Check compliance status
    const requiredDocuments = ['service_agreement', 'indemnity'];
    const signedDocuments = agreements
      .filter(agreement => agreement.status === 'signed')
      .map(agreement => agreement.documentType);

    const compliance = {
      isCompliant: requiredDocuments.every(doc => signedDocuments.includes(doc)) && !!indemnityClause,
      signedDocuments,
      missingDocuments: requiredDocuments.filter(doc => !signedDocuments.includes(doc)),
      indemnityStatus: indemnityClause ? 'active' : 'missing',
      lastUpdated: new Date()
    };

    res.json({
      success: true,
      data: { compliance }
    });

  } catch (error) {
    next(error);
  }
});

export default router;