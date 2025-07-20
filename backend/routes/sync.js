const express = require('express');
const { auth, userRateLimit, validateBody, asyncHandler } = require('../middleware/auth');
const User = require('../models/User');
const TrackingData = require('../models/TrackingData');

const router = express.Router();

// Apply authentication and rate limiting to all sync routes
router.use(auth);
router.use(userRateLimit(50, 15 * 60 * 1000)); // 50 requests per 15 minutes per user

/**
 * @route   POST /api/sync
 * @desc    Sync extension data with backend
 * @access  Private
 */
router.post('/', validateBody(['dailyStats']), asyncHandler(async (req, res) => {
  const { dailyStats, blockedSites, preferences, timestamp } = req.body;
  const userId = req.user.id;

  try {
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update user preferences if provided
    if (preferences) {
      user.preferences = { ...user.preferences, ...preferences };
    }

    // Update blocked sites if provided
    if (blockedSites && Array.isArray(blockedSites)) {
      user.blockedSites = blockedSites.map(site => ({
        domain: typeof site === 'string' ? site : site.domain,
        category: typeof site === 'object' ? site.category || 'Other' : 'Other',
        addedAt: typeof site === 'object' ? site.addedAt || new Date() : new Date()
      }));
    }

    // Process daily stats
    const syncResults = [];
    let totalTimeAdded = 0;
    let totalSitesAdded = 0;

    for (const [dateString, siteData] of Object.entries(dailyStats)) {
      try {
        const date = new Date(dateString);
        
        // Validate date
        if (isNaN(date.getTime())) {
          console.warn(`Invalid date string: ${dateString}`);
          continue;
        }

        // Find or create tracking data for this date
        let trackingData = await TrackingData.findOrCreateByDate(userId, date);

        // Process each site's data
        for (const [domain, stats] of Object.entries(siteData)) {
          if (stats.timeSpent && stats.timeSpent > 0) {
            await trackingData.addSiteData({
              domain,
              timeSpent: stats.timeSpent,
              visits: stats.visits || 1,
              category: stats.category || 'Other',
              productivityScore: stats.productivityScore || 50
            });

            totalTimeAdded += stats.timeSpent;
            totalSitesAdded += 1;
          }
        }

        syncResults.push({
          date: dateString,
          sitesProcessed: Object.keys(siteData).length,
          success: true
        });

      } catch (dateError) {
        console.error(`Error processing date ${dateString}:`, dateError);
        syncResults.push({
          date: dateString,
          success: false,
          error: dateError.message
        });
      }
    }

    // Update user stats
    await user.updateStats({
      totalTimeTracked: totalTimeAdded,
      sitesVisited: totalSitesAdded
    });

    await user.save();

    res.json({
      success: true,
      message: 'Data synced successfully',
      data: {
        syncResults,
        totalTimeAdded,
        totalSitesAdded,
        syncedAt: new Date(),
        serverTimestamp: Date.now()
      }
    });

  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Sync failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   GET /api/sync/data
 * @desc    Get user's synced data
 * @access  Private
 */
router.get('/data', asyncHandler(async (req, res) => {
  const { startDate, endDate, limit = 30 } = req.query;
  const userId = req.user.id;

  try {
    // Build query
    let query = { userId };
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    // Get tracking data
    const trackingData = await TrackingData.find(query)
      .sort({ date: -1 })
      .limit(parseInt(limit))
      .lean();

    // Get user data
    const user = await User.findById(userId);

    // Format data for extension
    const dailyStats = {};
    trackingData.forEach(day => {
      const dateString = day.date.toDateString();
      dailyStats[dateString] = {};
      
      day.sites.forEach(site => {
        dailyStats[dateString][site.domain] = {
          timeSpent: site.timeSpent,
          visits: site.visits,
          category: site.category,
          productivityScore: site.productivityScore
        };
      });
    });

    res.json({
      success: true,
      data: {
        dailyStats,
        blockedSites: user.blockedSites.map(site => site.domain),
        preferences: user.preferences,
        stats: user.stats,
        lastSyncedAt: new Date(),
        serverTimestamp: Date.now()
      }
    });

  } catch (error) {
    console.error('Get sync data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sync data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   POST /api/sync/focus-session
 * @desc    Sync focus session data
 * @access  Private
 */
router.post('/focus-session', validateBody(['startTime', 'duration']), asyncHandler(async (req, res) => {
  const { startTime, endTime, duration, completed, blockedAttempts } = req.body;
  const userId = req.user.id;

  try {
    const sessionStart = new Date(startTime);
    const sessionEnd = endTime ? new Date(endTime) : new Date(sessionStart.getTime() + duration);
    
    // Find or create tracking data for the session date
    const trackingData = await TrackingData.findOrCreateByDate(userId, sessionStart);

    // Add focus session
    await trackingData.addFocusSession({
      startTime: sessionStart,
      endTime: sessionEnd,
      duration,
      completed: completed || false,
      blockedAttempts: blockedAttempts || 0
    });

    // Update user stats if session was completed
    if (completed) {
      const user = await User.findById(userId);
      await user.updateStats({ focusSessionCompleted: true });
    }

    res.json({
      success: true,
      message: 'Focus session synced successfully',
      data: {
        sessionId: trackingData._id,
        syncedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Focus session sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync focus session',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   POST /api/sync/blocked-attempt
 * @desc    Log blocked site attempt
 * @access  Private
 */
router.post('/blocked-attempt', validateBody(['domain']), asyncHandler(async (req, res) => {
  const { domain, overridden, timestamp } = req.body;
  const userId = req.user.id;

  try {
    const attemptTime = timestamp ? new Date(timestamp) : new Date();
    
    // Find or create tracking data for today
    const trackingData = await TrackingData.findOrCreateByDate(userId, attemptTime);

    // Add blocked attempt
    await trackingData.addBlockedAttempt(domain, overridden || false);

    res.json({
      success: true,
      message: 'Blocked attempt logged successfully',
      data: {
        domain,
        overridden: overridden || false,
        loggedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Blocked attempt log error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log blocked attempt',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   GET /api/sync/status
 * @desc    Get sync status and server info
 * @access  Private
 */
router.get('/status', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  try {
    // Get user's latest tracking data
    const latestData = await TrackingData.findOne({ userId })
      .sort({ date: -1 })
      .select('date updatedAt metadata.syncedAt')
      .lean();

    // Get user info
    const user = await User.findById(userId)
      .select('stats preferences lastLogin')
      .lean();

    res.json({
      success: true,
      data: {
        serverTime: new Date(),
        serverTimestamp: Date.now(),
        lastDataSync: latestData ? latestData.updatedAt : null,
        lastLogin: user.lastLogin,
        syncEnabled: user.preferences.syncEnabled,
        totalTimeTracked: user.stats.totalTimeTracked,
        totalSitesVisited: user.stats.totalSitesVisited,
        lastActiveDate: user.stats.lastActiveDate
      }
    });

  } catch (error) {
    console.error('Sync status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sync status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   DELETE /api/sync/data
 * @desc    Clear user's synced data
 * @access  Private
 */
router.delete('/data', asyncHandler(async (req, res) => {
  const { dateRange, confirmDelete } = req.body;
  const userId = req.user.id;

  if (!confirmDelete) {
    return res.status(400).json({
      success: false,
      message: 'Confirmation required to delete data'
    });
  }

  try {
    let deleteQuery = { userId };

    if (dateRange) {
      deleteQuery.date = {};
      if (dateRange.startDate) deleteQuery.date.$gte = new Date(dateRange.startDate);
      if (dateRange.endDate) deleteQuery.date.$lte = new Date(dateRange.endDate);
    }

    const deleteResult = await TrackingData.deleteMany(deleteQuery);

    // Reset user stats if all data was deleted
    if (!dateRange) {
      const user = await User.findById(userId);
      user.stats = {
        totalTimeTracked: 0,
        totalSitesVisited: 0,
        averageProductivityScore: 0,
        focusSessionsCompleted: 0,
        lastActiveDate: new Date()
      };
      await user.save();
    }

    res.json({
      success: true,
      message: 'Data deleted successfully',
      data: {
        deletedCount: deleteResult.deletedCount,
        deletedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Delete sync data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete sync data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   POST /api/sync/bulk
 * @desc    Bulk sync multiple days of data
 * @access  Private
 */
router.post('/bulk', validateBody(['data']), asyncHandler(async (req, res) => {
  const { data, overwrite = false } = req.body;
  const userId = req.user.id;

  try {
    const results = [];
    let totalProcessed = 0;
    let totalErrors = 0;

    // Process each day's data
    for (const dayData of data) {
      try {
        const { date, sites, focusSessions, blockedAttempts } = dayData;
        
        if (!date || !sites) {
          results.push({
            date,
            success: false,
            error: 'Missing required fields'
          });
          totalErrors++;
          continue;
        }

        const trackingDate = new Date(date);
        let trackingData;

        if (overwrite) {
          // Delete existing data for this date
          await TrackingData.deleteOne({ userId, dateString: trackingDate.toDateString() });
        }

        trackingData = await TrackingData.findOrCreateByDate(userId, trackingDate);

        // Add site data
        for (const [domain, siteStats] of Object.entries(sites)) {
          await trackingData.addSiteData({
            domain,
            timeSpent: siteStats.timeSpent || 0,
            visits: siteStats.visits || 1,
            category: siteStats.category || 'Other',
            productivityScore: siteStats.productivityScore || 50
          });
        }

        // Add focus sessions
        if (focusSessions && Array.isArray(focusSessions)) {
          for (const session of focusSessions) {
            await trackingData.addFocusSession(session);
          }
        }

        // Add blocked attempts
        if (blockedAttempts && Array.isArray(blockedAttempts)) {
          for (const attempt of blockedAttempts) {
            await trackingData.addBlockedAttempt(attempt.domain, attempt.overridden);
          }
        }

        results.push({
          date,
          success: true,
          sitesProcessed: Object.keys(sites).length
        });
        totalProcessed++;

      } catch (dayError) {
        console.error(`Error processing day ${dayData.date}:`, dayError);
        results.push({
          date: dayData.date,
          success: false,
          error: dayError.message
        });
        totalErrors++;
      }
    }

    res.json({
      success: true,
      message: 'Bulk sync completed',
      data: {
        totalProcessed,
        totalErrors,
        results,
        syncedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Bulk sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Bulk sync failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

module.exports = router;