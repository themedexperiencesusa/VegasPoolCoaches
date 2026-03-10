import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

// Import routes
import authRoutes from './routes/auth.js';
import poolRoutes from './routes/pools.js';
import consultingRoutes from './routes/consulting.js';
import maintenanceRoutes from './routes/maintenance.js';
import legalRoutes from './routes/legal.js';
import assessmentRoutes from './routes/assessments.js';
import affiliateRoutes from './routes/affiliates.js';
import premiumRoutes from './routes/premium.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Demo mode flag and in-memory storage
let isDemoMode = false;
const demoData = {
  users: [],
  pools: [],
  maintenance: []
};

// Set demo mode flag
app.locals.isDemoMode = false;
app.locals.demoData = demoData;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://vegaspoolcoaches.com'] 
    : ['http://localhost:3000', 'http://localhost:8080'],
  credentials: true
}));

// Logging middleware
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Connect to MongoDB with retry logic
const connectDB = async (retries = 5, delay = 5000) => {
  const mongoURI = process.env.NODE_ENV === 'test' 
    ? process.env.MONGODB_TEST_URI 
    : process.env.MONGODB_URI;
  
  // MongoDB connection options
  const options = {
    serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    family: 4, // Use IPv4, skip trying IPv6
    maxPoolSize: 10, // Maintain up to 10 socket connections
    minPoolSize: 2, // Maintain at least 2 socket connections
    retryWrites: true, // Retry failed writes
    retryReads: true, // Retry failed reads
  };

  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(mongoURI, options);
      console.log('📦 Connected to MongoDB');
      console.log(`🔗 Connection pool: min ${options.minPoolSize}, max ${options.maxPoolSize}`);
      
      // Set up connection event handlers
      mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err.message);
      });
      
      mongoose.connection.on('disconnected', () => {
        console.warn('⚠️  MongoDB disconnected. Attempting to reconnect...');
      });
      
      mongoose.connection.on('reconnected', () => {
        console.log('✅ MongoDB reconnected successfully');
      });
      
      return true;
    } catch (error) {
      console.warn(`⚠️  MongoDB connection attempt ${i + 1}/${retries} failed:`, error.message);
      
      if (i < retries - 1) {
        console.log(`🔄 Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.warn('❌ All MongoDB connection attempts failed');
        console.log('🔄 Starting in demo mode without database...');
        console.log('📝 To use full features, please install and start MongoDB:');
        console.log('   sudo apt install mongodb-server');
        console.log('   sudo service mongodb start');
        console.log('📝 Or configure MONGODB_URI in your .env file');
        return false;
      }
    }
  }
  
  return false;
};

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/pools', poolRoutes);
app.use('/api/consulting', consultingRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/legal', legalRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/affiliates', affiliateRoutes);
app.use('/api/premium', premiumRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Serve React app in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });
}

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const startServer = async () => {
  const isDbConnected = await connectDB();
  
  // Set demo mode if database is not connected
  if (!isDbConnected) {
    isDemoMode = true;
    app.locals.isDemoMode = true;
    
    // Initialize demo data
    demoData.users = [
      {
        _id: 'demo-user-1',
        firstName: 'Demo',
        lastName: 'User',
        email: 'demo@vegaspoolcoaches.com',
        role: 'customer',
        isEmailVerified: true,
        preferences: {
          notifications: {
            email: true,
            sms: false,
            maintenanceReminders: true,
            chemicalAlerts: true
          }
        }
      }
    ];
    
    demoData.pools = [
      {
        _id: 'demo-pool-1',
        name: 'Demo Pool',
        owner: 'demo-user-1',
        poolType: 'inground',
        surfaceType: 'concrete',
        dimensions: { length: 32, width: 16, volume: 20000 },
        address: { city: 'Las Vegas', state: 'NV' },
        waterChemistry: [
          {
            pH: 7.4,
            chlorine: 2.2,
            alkalinity: 100,
            temperature: 78,
            testedAt: new Date()
          }
        ],
        needsAttention: false,
        recommendations: []
      }
    ];
  }
  
  app.listen(PORT, () => {
    console.log(`🚀 VegasPoolCoaches server running on port ${PORT}`);
    console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 Web interface: http://localhost:${PORT}`);
    console.log(`🔌 API available at: http://localhost:${PORT}/api`);
    
    if (!isDbConnected) {
      console.log(`⚠️  Running in DEMO MODE - some features may be limited`);
      console.log(`💡 The web interface will still work for demonstration`);
      console.log(`👤 Demo login: demo@vegaspoolcoaches.com / password: demo123`);
    }
  });
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down gracefully');
  mongoose.connection.close(() => {
    console.log('📦 MongoDB connection closed');
    process.exit(0);
  });
});

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;