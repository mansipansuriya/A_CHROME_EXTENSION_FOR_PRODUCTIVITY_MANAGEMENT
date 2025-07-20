const mongoose = require('mongoose');

const trackingDataSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  date: {
    type: Date,
    required: [true, 'Date is required'],
    index: true
  },
  dateString: {
    type: String,
    required: [true, 'Date string is required'],
    index: true
  },
  sites: [{
    domain: {
      type: String,
      required: [true, 'Domain is required'],
      lowercase: true,
      trim: true
    },
    timeSpent: {
      type: Number,
      required: [true, 'Time spent is required'],
      min: [0, 'Time spent cannot be negative']
    },
    visits: {
      type: Number,
      required: [true, 'Visits count is required'],
      min: [0, 'Visits cannot be negative'],
      default: 1
    },
    category: {
      type: String,
      enum: ['Work', 'Social Media', 'Entertainment', 'News', 'Shopping', 'Education', 'Health', 'Finance', 'Other'],
      default: 'Other'
    },
    productivityScore: {
      type: Number,
      min: [0, 'Productivity score cannot be negative'],
      max: [100, 'Productivity score cannot exceed 100'],
      default: 50
    },
    sessions: [{
      startTime: {
        type: Date,
        required: true
      },
      endTime: {
        type: Date,
        required: true
      },
      duration: {
        type: Number,
        required: true,
        min: 0
      },
      isActive: {
        type: Boolean,
        default: true
      },
      idleTime: {
        type: Number,
        default: 0,
        min: 0
      }
    }],
    firstVisit: {
      type: Date,
      default: Date.now
    },
    lastVisit: {
      type: Date,
      default: Date.now
    }
  }],
  summary: {
    totalTimeSpent: {
      type: Number,
      default: 0,
      min: 0
    },
    totalSitesVisited: {
      type: Number,
      default: 0,
      min: 0
    },
    productivityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    categoryBreakdown: {
      work: { type: Number, default: 0 },
      socialMedia: { type: Number, default: 0 },
      entertainment: { type: Number, default: 0 },
      news: { type: Number, default: 0 },
      shopping: { type: Number, default: 0 },
      education: { type: Number, default: 0 },
      health: { type: Number, default: 0 },
      finance: { type: Number, default: 0 },
      other: { type: Number, default: 0 }
    },
    topSites: [{
      domain: String,
      timeSpent: Number,
      visits: Number,
      category: String
    }],
    focusSessions: [{
      startTime: Date,
      endTime: Date,
      duration: Number,
      completed: Boolean,
      blockedAttempts: Number
    }],
    blockedAttempts: [{
      domain: String,
      timestamp: Date,
      overridden: Boolean
    }]
  },
  metadata: {
    deviceInfo: {
      userAgent: String,
      platform: String,
      language: String,
      timezone: String
    },
    extensionVersion: String,
    syncedAt: {
      type: Date,
      default: Date.now
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
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

// Compound indexes for better query performance
trackingDataSchema.index({ userId: 1, date: -1 });
trackingDataSchema.index({ userId: 1, dateString: 1 }, { unique: true });
trackingDataSchema.index({ 'sites.domain': 1 });
trackingDataSchema.index({ 'summary.totalTimeSpent': -1 });
trackingDataSchema.index({ createdAt: -1 });

// Virtual for formatted date
trackingDataSchema.virtual('formattedDate').get(function() {
  return this.date.toLocaleDateString();
});

// Virtual for total active time (excluding idle time)
trackingDataSchema.virtual('activeTime').get(function() {
  return this.sites.reduce((total, site) => {
    const siteActiveTime = site.sessions.reduce((siteTotal, session) => {
      return siteTotal + (session.duration - (session.idleTime || 0));
    }, 0);
    return total + siteActiveTime;
  }, 0);
});

// Pre-save middleware to update summary and timestamps
trackingDataSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  this.calculateSummary();
  next();
});

// Instance method to calculate summary statistics
trackingDataSchema.methods.calculateSummary = function() {
  let totalTimeSpent = 0;
  let totalSitesVisited = this.sites.length;
  let categoryBreakdown = {
    work: 0,
    socialMedia: 0,
    entertainment: 0,
    news: 0,
    shopping: 0,
    education: 0,
    health: 0,
    finance: 0,
    other: 0
  };
  
  // Calculate totals and category breakdown
  this.sites.forEach(site => {
    totalTimeSpent += site.timeSpent;
    
    const categoryKey = site.category.toLowerCase().replace(' ', '');
    if (categoryBreakdown.hasOwnProperty(categoryKey)) {
      categoryBreakdown[categoryKey] += site.timeSpent;
    } else {
      categoryBreakdown.other += site.timeSpent;
    }
  });
  
  // Calculate productivity score
  const productiveTime = categoryBreakdown.work + categoryBreakdown.education;
  const distractingTime = categoryBreakdown.socialMedia + categoryBreakdown.entertainment;
  const productivityScore = totalTimeSpent > 0 
    ? Math.max(0, Math.min(100, Math.round(((productiveTime - distractingTime * 0.5) / totalTimeSpent) * 100)))
    : 0;
  
  // Get top 5 sites
  const topSites = this.sites
    .sort((a, b) => b.timeSpent - a.timeSpent)
    .slice(0, 5)
    .map(site => ({
      domain: site.domain,
      timeSpent: site.timeSpent,
      visits: site.visits,
      category: site.category
    }));
  
  // Update summary
  this.summary = {
    totalTimeSpent,
    totalSitesVisited,
    productivityScore,
    categoryBreakdown,
    topSites,
    focusSessions: this.summary.focusSessions || [],
    blockedAttempts: this.summary.blockedAttempts || []
  };
};

// Instance method to add or update site data
trackingDataSchema.methods.addSiteData = function(siteData) {
  const existingSiteIndex = this.sites.findIndex(site => site.domain === siteData.domain.toLowerCase());
  
  if (existingSiteIndex !== -1) {
    // Update existing site
    const existingSite = this.sites[existingSiteIndex];
    existingSite.timeSpent += siteData.timeSpent || 0;
    existingSite.visits += siteData.visits || 1;
    existingSite.lastVisit = new Date();
    
    if (siteData.session) {
      existingSite.sessions.push(siteData.session);
    }
  } else {
    // Add new site
    this.sites.push({
      domain: siteData.domain.toLowerCase(),
      timeSpent: siteData.timeSpent || 0,
      visits: siteData.visits || 1,
      category: siteData.category || 'Other',
      productivityScore: siteData.productivityScore || 50,
      sessions: siteData.session ? [siteData.session] : [],
      firstVisit: new Date(),
      lastVisit: new Date()
    });
  }
  
  return this.save();
};

// Instance method to add focus session
trackingDataSchema.methods.addFocusSession = function(sessionData) {
  this.summary.focusSessions.push({
    startTime: sessionData.startTime,
    endTime: sessionData.endTime,
    duration: sessionData.duration,
    completed: sessionData.completed || false,
    blockedAttempts: sessionData.blockedAttempts || 0
  });
  
  return this.save();
};

// Instance method to add blocked attempt
trackingDataSchema.methods.addBlockedAttempt = function(domain, overridden = false) {
  this.summary.blockedAttempts.push({
    domain: domain.toLowerCase(),
    timestamp: new Date(),
    overridden
  });
  
  return this.save();
};

// Static method to find or create tracking data for a specific date
trackingDataSchema.statics.findOrCreateByDate = async function(userId, date) {
  const dateString = date.toDateString();
  
  let trackingData = await this.findOne({ userId, dateString });
  
  if (!trackingData) {
    trackingData = new this({
      userId,
      date: new Date(date),
      dateString,
      sites: [],
      summary: {
        totalTimeSpent: 0,
        totalSitesVisited: 0,
        productivityScore: 0,
        categoryBreakdown: {
          work: 0,
          socialMedia: 0,
          entertainment: 0,
          news: 0,
          shopping: 0,
          education: 0,
          health: 0,
          finance: 0,
          other: 0
        },
        topSites: [],
        focusSessions: [],
        blockedAttempts: []
      }
    });
    
    await trackingData.save();
  }
  
  return trackingData;
};

// Static method to get user's tracking data for a date range
trackingDataSchema.statics.getDateRange = function(userId, startDate, endDate) {
  return this.find({
    userId,
    date: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  }).sort({ date: -1 });
};

// Static method to get user's weekly summary
trackingDataSchema.statics.getWeeklySummary = async function(userId, weekStart) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  
  const weeklyData = await this.getDateRange(userId, weekStart, weekEnd);
  
  const summary = {
    totalTime: 0,
    averageProductivityScore: 0,
    topSites: {},
    categoryBreakdown: {
      work: 0,
      socialMedia: 0,
      entertainment: 0,
      news: 0,
      shopping: 0,
      education: 0,
      health: 0,
      finance: 0,
      other: 0
    },
    dailyBreakdown: [],
    focusSessionsCompleted: 0,
    totalBlockedAttempts: 0
  };
  
  weeklyData.forEach(day => {
    summary.totalTime += day.summary.totalTimeSpent;
    summary.averageProductivityScore += day.summary.productivityScore;
    summary.focusSessionsCompleted += day.summary.focusSessions.filter(s => s.completed).length;
    summary.totalBlockedAttempts += day.summary.blockedAttempts.length;
    
    // Aggregate category breakdown
    Object.keys(summary.categoryBreakdown).forEach(category => {
      summary.categoryBreakdown[category] += day.summary.categoryBreakdown[category] || 0;
    });
    
    // Aggregate top sites
    day.sites.forEach(site => {
      if (!summary.topSites[site.domain]) {
        summary.topSites[site.domain] = {
          timeSpent: 0,
          visits: 0,
          category: site.category
        };
      }
      summary.topSites[site.domain].timeSpent += site.timeSpent;
      summary.topSites[site.domain].visits += site.visits;
    });
    
    summary.dailyBreakdown.push({
      date: day.date,
      totalTime: day.summary.totalTimeSpent,
      productivityScore: day.summary.productivityScore,
      sitesVisited: day.summary.totalSitesVisited
    });
  });
  
  // Calculate averages
  if (weeklyData.length > 0) {
    summary.averageProductivityScore = Math.round(summary.averageProductivityScore / weeklyData.length);
  }
  
  // Convert topSites object to sorted array
  summary.topSites = Object.entries(summary.topSites)
    .map(([domain, data]) => ({ domain, ...data }))
    .sort((a, b) => b.timeSpent - a.timeSpent)
    .slice(0, 10);
  
  return summary;
};

// Static method to get user statistics
trackingDataSchema.statics.getUserStats = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const stats = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        date: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        totalTime: { $sum: '$summary.totalTimeSpent' },
        averageProductivityScore: { $avg: '$summary.productivityScore' },
        totalSites: { $sum: '$summary.totalSitesVisited' },
        totalFocusSessions: { $sum: { $size: '$summary.focusSessions' } },
        completedFocusSessions: {
          $sum: {
            $size: {
              $filter: {
                input: '$summary.focusSessions',
                cond: { $eq: ['$$this.completed', true] }
              }
            }
          }
        },
        totalBlockedAttempts: { $sum: { $size: '$summary.blockedAttempts' } },
        activeDays: { $sum: 1 }
      }
    }
  ]);
  
  return stats[0] || {
    totalTime: 0,
    averageProductivityScore: 0,
    totalSites: 0,
    totalFocusSessions: 0,
    completedFocusSessions: 0,
    totalBlockedAttempts: 0,
    activeDays: 0
  };
};

module.exports = mongoose.model('TrackingData', trackingDataSchema);