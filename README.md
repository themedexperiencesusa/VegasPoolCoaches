# VegasPoolCoaches - Pool Management with AI

A comprehensive pool management and consulting platform that combines intelligent water chemistry analysis, automated maintenance scheduling, and AI-powered recommendations to help pool owners and service professionals maintain pristine pools.

## 🌊 Features

### For Pool Owners
- **Smart Dashboard**: Real-time overview of all your pools with health status indicators
- **Water Chemistry Tracking**: Easy logging and monitoring of pH, chlorine, alkalinity, and other chemical levels
- **AI-Powered Analysis**: Get intelligent recommendations based on water chemistry and reported issues
- **Maintenance Scheduling**: Automated scheduling and tracking of pool maintenance activities
- **Equipment Management**: Track pool equipment status, service dates, and warranties
- **Mobile-Friendly**: Responsive design works perfectly on phones, tablets, and desktops

### For Pool Service Professionals
- **Multi-Pool Management**: Manage hundreds of client pools from a single dashboard
- **Advanced Analytics**: Detailed reporting on service quality, chemical trends, and customer satisfaction
- **Route Optimization**: Efficient scheduling and routing for service appointments
- **Customer Communication**: Automated notifications and service reports
- **Quality Scoring**: Performance metrics and quality assessments for each service visit

### AI-Powered Intelligence
- **Water Chemistry Analysis**: Advanced algorithms analyze chemical readings and provide specific recommendations
- **Predictive Maintenance**: AI predicts when equipment might need attention before failures occur
- **Seasonal Optimization**: Automatic adjustments for weather patterns and seasonal changes
- **Cost Optimization**: Recommendations to minimize chemical usage while maintaining water quality

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- MongoDB 4.4+
- OpenAI API Key (optional, for enhanced AI features)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/vegas-pool-coaches.git
   cd vegas-pool-coaches
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/vegas-pool-coaches
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   OPENAI_API_KEY=your-openai-api-key-optional
   ```

4. **Start MongoDB**
   ```bash
   # Using MongoDB service
   sudo systemctl start mongod
   
   # Or using Docker
   docker run -d -p 27017:27017 --name mongodb mongo:latest
   ```

5. **Start the application**
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   ```

6. **Open your browser**
   Navigate to `http://localhost:3000`

## 📖 API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user profile
- `PUT /api/auth/profile` - Update user profile
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token

### Pool Management
- `GET /api/pools` - List user's pools (with filtering and pagination)
- `POST /api/pools` - Create new pool
- `GET /api/pools/:id` - Get pool details with recommendations
- `PUT /api/pools/:id` - Update pool information
- `DELETE /api/pools/:id` - Deactivate pool

### Water Chemistry
- `POST /api/pools/:id/water-chemistry` - Add water test results
- `GET /api/pools/:id/water-chemistry` - Get chemistry history
- `GET /api/pools/:id/recommendations` - Get AI recommendations

### Maintenance Management
- `GET /api/maintenance` - List maintenance activities
- `POST /api/maintenance` - Schedule maintenance
- `PUT /api/maintenance/:id` - Update maintenance log
- `GET /api/maintenance/schedule/:poolId` - Get pool's maintenance schedule

### AI Consulting
- `POST /api/consulting/ai-analysis` - Get AI analysis of water chemistry
- `GET /api/consulting/dashboard` - Consultant dashboard data
- `GET /api/consulting/pool-report/:id` - Generate comprehensive pool report

## 🏗️ Architecture

### Backend (Node.js/Express)
```
src/
├── server.js              # Application entry point
├── models/                # MongoDB schemas
│   ├── User.js            # User authentication & profiles
│   ├── Pool.js            # Pool data & water chemistry
│   └── MaintenanceLog.js  # Service history & tasks
├── routes/                # API endpoints
│   ├── auth.js            # Authentication routes
│   ├── pools.js           # Pool management
│   ├── maintenance.js     # Maintenance scheduling
│   └── consulting.js      # AI analysis & reporting
├── middleware/            # Express middleware
│   ├── auth.js            # JWT authentication
│   ├── errorHandler.js    # Global error handling
│   └── notFoundHandler.js # 404 handling
└── services/              # Business logic
    └── aiService.js       # OpenAI integration
```

### Frontend (Vanilla JS)
```
public/
├── index.html             # Main application shell
├── css/
│   └── styles.css         # Modern, responsive styling
└── js/
    └── app.js             # Single-page application logic
```

### Database Schema
- **Users**: Authentication, profiles, preferences, subscription data
- **Pools**: Physical characteristics, location, equipment, maintenance schedules
- **Water Chemistry**: Historical readings with timestamps and technician info
- **Maintenance Logs**: Detailed service records with tasks, chemicals used, issues found
- **Equipment**: Asset tracking with service history and warranty information

## 🤖 AI Integration

The platform integrates with OpenAI's GPT models to provide intelligent analysis:

### Rule-Based Fallback
When OpenAI is unavailable, the system uses sophisticated rule-based algorithms:
- pH balance recommendations (7.2-7.6 optimal range)
- Chlorine level management (1.0-3.0 ppm)
- Alkalinity optimization (80-120 ppm)
- Seasonal adjustment calculations
- Equipment maintenance predictions

### AI-Enhanced Features
With OpenAI API key configured:
- Natural language analysis of water chemistry issues
- Contextual recommendations based on pool type, weather, and usage patterns
- Seasonal optimization suggestions
- Troubleshooting complex water quality problems
- Predictive maintenance scheduling

## 🔧 Configuration

### Environment Variables
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/vegas-pool-coaches
MONGODB_TEST_URI=mongodb://localhost:27017/vegas-pool-coaches-test

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h

# OpenAI API (for AI-powered consulting)
OPENAI_API_KEY=your-openai-api-key

# Email Configuration (for notifications)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-email-password

# File Upload Configuration
MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads
```

### User Roles
- **Customer**: Pool owners who can manage their own pools
- **Technician**: Service professionals who perform maintenance
- **Consultant**: Pool experts who provide analysis and recommendations
- **Admin**: System administrators with full access

## 🚀 Deployment

### Development
```bash
npm run dev
```

### Production
```bash
# Install production dependencies
npm ci --production

# Start with PM2 process manager
npm install -g pm2
pm2 start src/server.js --name "vegas-pool-coaches"

# Or use Docker
docker build -t vegas-pool-coaches .
docker run -p 3000:3000 -e MONGODB_URI=your-mongo-url vegas-pool-coaches
```

### Environment Setup
- **MongoDB**: Can be hosted locally, on MongoDB Atlas, or other cloud providers
- **OpenAI API**: Optional but recommended for enhanced AI features
- **SSL/HTTPS**: Configure reverse proxy (nginx) for production
- **Backup**: Implement regular MongoDB backups

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm test -- --grep "Pool Management"
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📧 Support

For support and questions:
- Email: support@vegaspoolcoaches.com
- Documentation: [Wiki](https://github.com/your-username/vegas-pool-coaches/wiki)
- Issues: [GitHub Issues](https://github.com/your-username/vegas-pool-coaches/issues)

## 🎯 Roadmap

### Upcoming Features
- [ ] Mobile app for iOS and Android
- [ ] IoT sensor integration for automated water testing
- [ ] Advanced analytics and reporting dashboard
- [ ] Integration with pool equipment manufacturers
- [ ] Multi-language support
- [ ] Advanced notification system with SMS and push notifications
- [ ] Inventory management for chemicals and equipment
- [ ] Customer billing and payment processing
- [ ] Weather integration for predictive maintenance
- [ ] Machine learning models for predictive analysis

---

**VegasPoolCoaches** - Making pool management intelligent, efficient, and effortless. 🌊✨
