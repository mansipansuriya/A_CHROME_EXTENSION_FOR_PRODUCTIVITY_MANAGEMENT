const express = require('express');
const { auth, userRateLimit, validateBody, asyncHandler } = require('../middleware/auth');
const TrackingData = require('../models/TrackingData');
const User = require('../models/User');

const router = express.Router();

// Apply authentication and rate limiting
router.use(auth);
router.use(userRateLimit(100, 15 * 60 * 1000)); // 100 requests per 15 minutes per user

/**
 * @route   GET /api/tracking/today
 * @desc    Get today's tracking data
 * @access  Private
 */
router.get('/today', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const today = new Date();

  try {
    const trackingData = await TrackingData.findOrCreateByDate(userId, today);

    res.json({
      success: true,
      data: {
        date: trackingData.date,
        sites: trackingData.sites,
        summary: trackingData.summary,
        activeTime: trackingData.activeTime
      }
    });

  } catch (error) {
    console.error('Get today tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get today\'s tracking data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   GET /api/tracking/date/:date
 * @desc    Get tracking data for specific date
 * @access  Private
 */
router.get('/date/:date', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { date } = req.params;

  try {
    const targetDate = new Date(date);
    
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }

    const trackingData = await TrackingData.findOne({
      userId,
      dateString: targetDate.toDateString()
    });

    if (!trackingData) {
      return res.json({
        success: true,
        data: {
          date: targetDate,
          sites: [],
          summary: {
            totalTimeSpent: 0,
            totalSitesVisited: 0,
            productivityScore: 0,
            categoryBreakdown: {},
            topSites: [],
            focusSessions: [],
            blockedAttempts: []
          }
        }
      });
    }

    res.json({
      success: true,
      data: {
        date: trackingData.date,
        sites: trackingData.sites,
        summary: trackingData.summary,
        activeTime: trackingData.activeTime
      }
    });

  } catch (error) {
    console.error('Get date tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get tracking data for date',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   GET /api/tracking/range
 * @desc    Get tracking data for date range
 * @access  Private
 */
router.get('/range', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { startDate, endDate, limit = 30 } = req.query;

  try {
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'Start date must be before end date'
      });
    }

    const trackingData = await TrackingData.getDateRange(userId, start, end)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: trackingData.map(day => ({
        date: day.date,
        sites: day.sites,
        summary: day.summary,
        activeTime: day.activeTime
      }))
    });

  } catch (error) {
    console.error('Get range tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get tracking data for range',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   GET /api/tracking/weekly/:weekStart
 * @desc    Get weekly summary
 * @access  Private
 */
router.get('/weekly/:weekStart', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { weekStart } = req.params;

  try {
    const weekStartDate = new Date(weekStart);
    
    if (isNaN(weekStartDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid week start date'
      });
    }

    const weeklySummary = await TrackingData.getWeeklySummary(userId, weekStartDate);

    res.json({
      success: true,
      data: weeklySummary
    });

  } catch (error) {
    console.error('Get weekly summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get weekly summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   POST /api/tracking/site
 * @desc    Add or update site tracking data
 * @access  Private
 */
router.post('/site', validateBody(['domain', 'timeSpent']), asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { domain, timeSpent, visits, category, date, session } = req.body;

  try {
    const trackingDate = date ? new Date(date) : new Date();
    const trackingData = await TrackingData.findOrCreateByDate(userId, trackingDate);

    await trackingData.addSiteData({
      domain,
      timeSpent,
      visits: visits || 1,
      category: category || 'Other',
      session
    });

    res.json({
      success: true,
      message: 'Site data added successfully',
      data: {
        domain,
        timeSpent,
        addedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Add site tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add site tracking data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   GET /api/tracking/stats
 * @desc    Get user's tracking statistics
 * @access  Private
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { days = 30 } = req.query;

  try {
    const stats = await TrackingData.getUserStats(userId, parseInt(days));
    const user = await User.findById(userId).select('stats');

    res.json({
      success: true,
      data: {
        period: {
          days: parseInt(days),
          ...stats
        },
        overall: user.stats
      }
    });

  } catch (error) {
    console.error('Get tracking stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get tracking statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   GET /api/tracking/categories
 * @desc    Get category breakdown for date range
 * @access  Private
 */
router.get('/categories', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { startDate, endDate } = req.query;

  try {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const trackingData = await TrackingData.getDateRange(userId, start, end);

    const categoryBreakdown = {
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

    let totalTime = 0;

    trackingData.forEach(day => {
      Object.keys(categoryBreakdown).forEach(category => {
        const time = day.summary.categoryBreakdown[category] || 0;
        categoryBreakdown[category] += time;
        totalTime += time;
      });
    });

    // Calculate percentages
    const categoryPercentages = {};
    Object.keys(categoryBreakdown).forEach(category => {
      categoryPercentages[category] = totalTime > 0 
        ? Math.round((categoryBreakdown[category] / totalTime) * 100)
        : 0;
    });

    res.json({
      success: true,
      data: {
        breakdown: categoryBreakdown,
        percentages: categoryPercentages,
        totalTime,
        dateRange: { start, end }
      }
    });

  } catch (error) {
    console.error('Get category breakdown error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get category breakdown',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   GET /api/tracking/top-sites
 * @desc    Get top sites for date range
 * @access  Private
 */
router.get('/top-sites', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { startDate, endDate, limit = 10 } = req.query;

  try {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const trackingData = await TrackingData.getDateRange(userId, start, end);

    const siteAggregation = {};

    trackingData.forEach(day => {
      day.sites.forEach(site => {
        if (!siteAggregation[site.domain]) {
          siteAggregation[site.domain] = {
            domain: site.domain,
            timeSpent: 0,
            visits: 0,
            category: site.category,
            averageProductivityScore: 0,
            scoreCount: 0
          };
        }

        siteAggregation[site.domain].timeSpent += site.timeSpent;
        siteAggregation[site.domain].visits += site.visits;
        
        if (site.productivityScore) {
          siteAggregation[site.domain].averageProductivityScore += site.productivityScore;
          siteAggregation[site.domain].scoreCount += 1;
        }
      });
    });

    // Calculate average productivity scores and sort
    const topSites = Object.values(siteAggregation)
      .map(site => ({
        ...site,
        averageProductivityScore: site.scoreCount > 0 
          ? Math.round(site.averageProductivityScore / site.scoreCount)
          : 0
      }))
      .sort((a, b) => b.timeSpent - a.timeSpent)
      .slice(0, parseInt(limit))
      .map(({ scoreCount, ...site }) => site);

    res.json({
      success: true,
      data: {
        topSites,
        dateRange: { start, end },
        totalSites: Object.keys(siteAggregation).length
      }
    });

  } catch (error) {
    console.error('Get top sites error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get top sites',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   DELETE /api/tracking/date/:date
 * @desc    Delete tracking data for specific date
 * @access  Private
 */
router.delete('/date/:date', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { date } = req.params;

  try {
    const targetDate = new Date(date);
    
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }

    const result = await TrackingData.deleteOne({
      userId,
      dateString: targetDate.toDateString()
    });

    res.json({
      success: true,
      message: result.deletedCount > 0 ? 'Tracking data deleted successfully' : 'No data found for the specified date',
      data: {
        deletedCount: result.deletedCount,
        date: targetDate
      }
    });

  } catch (error) {
    console.error('Delete tracking data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete tracking data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

module.exports = router;