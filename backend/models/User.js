const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't include password in queries by default
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  preferences: {
    trackingEnabled: {
      type: Boolean,
      default: true
    },
    blockingEnabled: {
      type: Boolean,
      default: true
    },
    syncEnabled: {
      type: Boolean,
      default: true
    },
    focusNotifications: {
      type: Boolean,
      default: true
    },
    idleThreshold: {
      type: Number,
      default: 30,
      min: [10, 'Idle threshold must be at least 10 seconds'],
      max: [300, 'Idle threshold cannot exceed 300 seconds']
    },
    minVisitTime: {
      type: Number,
      default: 5,
      min: [1, 'Minimum visit time must be at least 1 second'],
      max: [60, 'Minimum visit time cannot exceed 60 seconds']
    },
    syncInterval: {
      type: Number,
      default: 30,
      enum: [15, 30, 60, 120]
    },
    timezone: {
      type: String,
      default: 'UTC'
    }
  },
  blockedSites: [{
    domain: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    category: {
      type: String,
      enum: ['Social Media', 'Entertainment', 'News', 'Shopping', 'Other'],
      default: 'Other'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'premium'],
      default: 'free'
    },
    startDate: Date,
    endDate: Date,
    isActive: {
      type: Boolean,
      default: false
    }
  },
  stats: {
    totalTimeTracked: {
      type: Number,
      default: 0
    },
    totalSitesVisited: {
      type: Number,
      default: 0
    },
    averageProductivityScore: {
      type: Number,
      default: 0
    },
    focusSessionsCompleted: {
      type: Number,
      default: 0
    },
    lastActiveDate: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
userSchema.index({ email: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'stats.lastActiveDate': -1 });

// Virtual for user's full profile
userSchema.virtual('profile').get(function() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    preferences: this.preferences,
    subscription: this.subscription,
    stats: this.stats,
    createdAt: this.createdAt
  };
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  // Only hash password if it's modified
  if (!this.isModified('password')) return next();
  
  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware to update timestamps
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Instance method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Instance method to generate JWT token
userSchema.methods.generateAuthToken = function() {
  const payload = {
    id: this._id,
    email: this.email,
    name: this.name
  };
  
  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'your-secret-key',
    { 
      expiresIn: process.env.JWT_EXPIRE || '7d',
      issuer: 'productivity-tracker'
    }
  );
};

// Instance method to generate refresh token
userSchema.methods.generateRefreshToken = function() {
  const payload = {
    id: this._id,
    type: 'refresh'
  };
  
  return jwt.sign(
    payload,
    process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
    { 
      expiresIn: '30d',
      issuer: 'productivity-tracker'
    }
  );
};

// Instance method to update user stats
userSchema.methods.updateStats = function(newStats) {
  if (newStats.totalTimeTracked) {
    this.stats.totalTimeTracked += newStats.totalTimeTracked;
  }
  if (newStats.sitesVisited) {
    this.stats.totalSitesVisited += newStats.sitesVisited;
  }
  if (newStats.productivityScore !== undefined) {
    // Calculate running average
    const currentAvg = this.stats.averageProductivityScore || 0;
    const newAvg = (currentAvg + newStats.productivityScore) / 2;
    this.stats.averageProductivityScore = Math.round(newAvg);
  }
  if (newStats.focusSessionCompleted) {
    this.stats.focusSessionsCompleted += 1;
  }
  
  this.stats.lastActiveDate = new Date();
  return this.save();
};

// Instance method to add blocked site
userSchema.methods.addBlockedSite = function(domain, category = 'Other') {
  const existingSite = this.blockedSites.find(site => site.domain === domain.toLowerCase());
  
  if (!existingSite) {
    this.blockedSites.push({
      domain: domain.toLowerCase(),
      category,
      addedAt: new Date()
    });
  }
  
  return this.save();
};

// Instance method to remove blocked site
userSchema.methods.removeBlockedSite = function(domain) {
  this.blockedSites = this.blockedSites.filter(
    site => site.domain !== domain.toLowerCase()
  );
  
  return this.save();
};

// Static method to find user by email
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Static method to find active users
userSchema.statics.findActiveUsers = function() {
  return this.find({ 
    isActive: true,
    'stats.lastActiveDate': {
      $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
    }
  });
};

// Static method to get user statistics
userSchema.statics.getUserStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        activeUsers: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$isActive', true] },
                  {
                    $gte: [
                      '$stats.lastActiveDate',
                      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                    ]
                  }
                ]
              },
              1,
              0
            ]
          }
        },
        premiumUsers: {
          $sum: {
            $cond: [
              { $eq: ['$subscription.plan', 'premium'] },
              1,
              0
            ]
          }
        },
        averageProductivityScore: { $avg: '$stats.averageProductivityScore' },
        totalTimeTracked: { $sum: '$stats.totalTimeTracked' },
        totalFocusSessions: { $sum: '$stats.focusSessionsCompleted' }
      }
    }
  ]);
  
  return stats[0] || {
    totalUsers: 0,
    activeUsers: 0,
    premiumUsers: 0,
    averageProductivityScore: 0,
    totalTimeTracked: 0,
    totalFocusSessions: 0
  };
};

module.exports = mongoose.model('User', userSchema);