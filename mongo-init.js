// MongoDB initialization script for Docker container
// This script runs when the MongoDB container is first created

db = db.getSiblingDB('vegas-pool-coaches');

// Create collections with validation
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email', 'firstName', 'lastName'],
      properties: {
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
          description: 'must be a valid email address'
        },
        firstName: {
          bsonType: 'string',
          description: 'must be a string'
        },
        lastName: {
          bsonType: 'string',
          description: 'must be a string'
        }
      }
    }
  }
});

db.createCollection('pools');
db.createCollection('maintenancelogs');
db.createCollection('assessments');
db.createCollection('legaldocuments');
db.createCollection('affiliates');
db.createCollection('premiums');

// Create indexes for better performance
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ role: 1 });
db.users.createIndex({ createdAt: -1 });

db.pools.createIndex({ owner: 1 });
db.pools.createIndex({ 'address.city': 1, 'address.state': 1 });
db.pools.createIndex({ needsAttention: 1 });
db.pools.createIndex({ createdAt: -1 });

db.maintenancelogs.createIndex({ pool: 1, scheduledDate: -1 });
db.maintenancelogs.createIndex({ technician: 1, status: 1 });
db.maintenancelogs.createIndex({ status: 1, scheduledDate: 1 });

db.assessments.createIndex({ pool: 1, assessmentDate: -1 });
db.assessments.createIndex({ createdAt: -1 });

db.legaldocuments.createIndex({ client: 1, documentType: 1 });
db.legaldocuments.createIndex({ status: 1 });

db.affiliates.createIndex({ email: 1 }, { unique: true });
db.affiliates.createIndex({ referralCode: 1 }, { unique: true });

db.premiums.createIndex({ user: 1 });
db.premiums.createIndex({ status: 1, tier: 1 });

console.log('MongoDB initialization completed successfully');
console.log('Database: vegas-pool-coaches');
console.log('Collections created with indexes');
