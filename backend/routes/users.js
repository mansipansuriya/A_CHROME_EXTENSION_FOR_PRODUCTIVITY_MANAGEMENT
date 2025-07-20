const express = require('express');
const { auth, userRateLimit, validateBody, sanitizeBody, asyncHandler } = require('../middleware/auth');
const User = require('../models/User');
const TrackingData = require('../models/TrackingData');

const router = express.Router();

// Apply authentication and rate limiting
router.use(auth);
router.use(userRateLimit(30, 15 * 60 * 1000)); // 30 requests per 15 minutes per user

/**
 * @route   GET /api/users/profile
 * @desc    Get user profile
 * @access  Private
 */
router.get('/profile', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        user: user.profile
      }
    });

  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   PUT /api/users/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', 
  sanitizeBody(['name', 'preferences']),
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { name, preferences } = req.body;

    try {
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Update fields
      if (name && name.trim()) {
        user.name = name.trim();
      }

      if (preferences && typeof preferences === 'object') {
        user.preferences = { ...user.preferences, ...preferences };
      }

      await user.save();

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: user.profile
        }
      });

    } catch (error) {
      console.error('Update user profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update user profile',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  })
);

/**
 * @route   GET /api/users/preferences
 * @desc    Get user preferences
 * @access  Private
 */
router.get('/preferences', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId).select('preferences');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        preferences: user.preferences
      }
    });

  } catch (error) {
    console.error('Get user preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user preferences',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   PUT /api/users/preferences
 * @desc    Update user preferences
 * @access  Private
 */
router.put('/preferences',
  validateBody(['preferences']),
  sanitizeBody(['preferences']),
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { preferences } = req.body;

    try {
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Validate preferences structure
      const validPreferences = {};
      const allowedPrefs = [
        'trackingEnabled', 'blockingEnabled', 'syncEnabled', 'focusNotifications',
        'idleThreshold', 'minVisitTime', 'syncInterval', 'timezone'
      ];

      allowedPrefs.forEach(pref => {
        if (preferences[pref] !== undefined) {
          validPreferences[pref] = preferences[pref];
        }
      });

      user.preferences = { ...user.preferences, ...validPreferences };
      await user.save();

      res.json({
        success: true,
        message: 'Preferences updated successfully',
        data: {
          preferences: user.preferences
        }
      });

    } catch (error) {
      console.error('Update user preferences error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update user preferences',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  })
);

/**
 * @route   GET /api/users/blocked-sites
 * @desc    Get user's blocked sites
 * @access  Private
 */
router.get('/blocked-sites', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId).select('blockedSites');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        blockedSites: user.blockedSites
      }
    });

  } catch (error) {
    console.error('Get blocked sites error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get blocked sites',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   POST /api/users/blocked-sites
 * @desc    Add blocked site
 * @access  Private
 */
router.post('/blocked-sites',
  validateBody(['domain']),
  sanitizeBody(['domain', 'category']),
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { domain, category } = req.body;

    try {
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Clean domain
      const cleanDomain = domain.toLowerCase().trim()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '');

      // Check if already blocked
      const existingSite = user.blockedSites.find(site => site.domain === cleanDomain);
      if (existingSite) {
        return res.status(400).json({
          success: false,
          message: 'Site is already blocked'
        });
      }

      await user.addBlockedSite(cleanDomain, category);

      res.json({
        success: true,
        message: 'Site blocked successfully',
        data: {
          domain: cleanDomain,
          category: category || 'Other'
        }
      });

    } catch (error) {
      console.error('Add blocked site error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to add blocked site',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  })
);

/**
 * @route   DELETE /api/users/blocked-sites/:domain
 * @desc    Remove blocked site
 * @access  Private
 */
router.delete('/blocked-sites/:domain', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { domain } = req.params;

  try {
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const cleanDomain = domain.toLowerCase().trim();
    const existingSite = user.blockedSites.find(site => site.domain === cleanDomain);
    
    if (!existingSite) {
      return res.status(404).json({
        success: false,
        message: 'Site not found in blocked list'
      });
    }

    await user.removeBlockedSite(cleanDomain);

    res.json({
      success: true,
      message: 'Site unblocked successfully',
      data: {
        domain: cleanDomain
      }
    });

  } catch (error) {
    console.error('Remove blocked site error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove blocked site',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   PUT /api/users/blocked-sites
 * @desc    Update all blocked sites
 * @access  Private
 */
router.put('/blocked-sites',
  validateBody(['blockedSites']),
  sanitizeBody(['blockedSites']),
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { blockedSites } = req.body;

    try {
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!Array.isArray(blockedSites)) {
        return res.status(400).json({
          success: false,
          message: 'Blocked sites must be an array'
        });
      }

      // Clean and validate domains
      const cleanedSites = blockedSites.map(site => {
        const domain = typeof site === 'string' ? site : site.domain;
        return {
          domain: domain.toLowerCase().trim()
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, ''),
          category: typeof site === 'object' ? site.category || 'Other' : 'Other',
          addedAt: typeof site === 'object' ? site.addedAt || new Date() : new Date()
        };
      });

      user.blockedSites = cleanedSites;
      await user.save();

      res.json({
        success: true,
        message: 'Blocked sites updated successfully',
        data: {
          blockedSites: user.blockedSites
        }
      });

    } catch (error) {
      console.error('Update blocked sites error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update blocked sites',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  })
);

/**
 * @route   GET /api/users/stats
 * @desc    Get user statistics
 * @access  Private
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { days = 30 } = req.query;

  try {
    const user = await User.findById(userId).select('stats');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get period stats
    const periodStats = await TrackingData.getUserStats(userId, parseInt(days));

    res.json({
      success: true,
      data: {
        overall: user.stats,
        period: {
          days: parseInt(days),
          ...periodStats
        }
      }
    });

  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   GET /api/users/dashboard
 * @desc    Get user dashboard data
 * @access  Private
 */
router.get('/dashboard', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get today's data
    const today = new Date();
    const todayData = await TrackingData.findOrCreateByDate(userId, today);

    // Get this week's data
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weeklyData = await TrackingData.getWeeklySummary(userId, weekStart);

    // Get recent stats
    const recentStats = await TrackingData.getUserStats(userId, 7);

    const dashboardData = {
      user: user.profile,
      today: {
        totalTime: todayData.summary.totalTimeSpent,
        sitesVisited: todayData.summary.totalSitesVisited,
        productivityScore: todayData.summary.productivityScore,
        topSites: todayData.summary.topSites.slice(0, 5),
        focusSessions: todayData.summary.focusSessions.length,
        blockedAttempts: todayData.summary.blockedAttempts.length
      },
      thisWeek: {
        totalTime: weeklyData.totalTime,
        averageProductivityScore: weeklyData.averageProductivityScore,
        focusSessionsCompleted: weeklyData.focusSessionsCompleted,
        activeDays: weeklyData.dailyBreakdown.length
      },
      recent: recentStats,
      preferences: user.preferences,
      blockedSitesCount: user.blockedSites.length
    };

    res.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('Get user dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   DELETE /api/users/data
 * @desc    Delete user data
 * @access  Private
 */
router.delete('/data', 
  validateBody(['confirmDelete']),
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { confirmDelete, dataType } = req.body;

    if (!confirmDelete) {
      return res.status(400).json({
        success: false,
        message: 'Confirmation required to delete data'
      });
    }

    try {
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      let deletedCount = 0;

      switch (dataType) {
        case 'tracking':
          const trackingResult = await TrackingData.deleteMany({ userId });
          deletedCount = trackingResult.deletedCount;
          
          // Reset user stats
          user.stats = {
            totalTimeTracked: 0,
            totalSitesVisited: 0,
            averageProductivityScore: 0,
            focusSessionsCompleted: 0,
            lastActiveDate: new Date()
          };
          await user.save();
          break;

        case 'blocked-sites':
          user.blockedSites = [];
          await user.save();
          break;

        case 'all':
          const allTrackingResult = await TrackingData.deleteMany({ userId });
          deletedCount = allTrackingResult.deletedCount;
          
          user.blockedSites = [];
          user.stats = {
            totalTimeTracked: 0,
            totalSitesVisited: 0,
            averageProductivityScore: 0,
            focusSessionsCompleted: 0,
            lastActiveDate: new Date()
          };
          await user.save();
          break;

        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid data type. Use: tracking, blocked-sites, or all'
          });
      }

      res.json({
        success: true,
        message: 'Data deleted successfully',
        data: {
          dataType,
          deletedCount,
          deletedAt: new Date()
        }
      });

    } catch (error) {
      console.error('Delete user data error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete user data',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  })
);

module.exports = router;