const express = require('express');
const { auth, userRateLimit, asyncHandler } = require('../middleware/auth');
const TrackingData = require('../models/TrackingData');
const User = require('../models/User');

const router = express.Router();

// Apply authentication and rate limiting
router.use(auth);
router.use(userRateLimit(50, 15 * 60 * 1000)); // 50 requests per 15 minutes per user

/**
 * @route   GET /api/reports/daily/:date
 * @desc    Generate daily report
 * @access  Private
 */
router.get('/daily/:date', asyncHandler(async (req, res) => {
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
          summary: {
            totalTimeSpent: 0,
            totalSitesVisited: 0,
            productivityScore: 0,
            focusSessionsCompleted: 0,
            blockedAttempts: 0
          },
          topSites: [],
          categoryBreakdown: {},
          hourlyBreakdown: [],
          insights: []
        }
      });
    }

    // Generate insights
    const insights = generateDailyInsights(trackingData);

    // Generate hourly breakdown
    const hourlyBreakdown = generateHourlyBreakdown(trackingData);

    const report = {
      date: trackingData.date,
      summary: {
        totalTimeSpent: trackingData.summary.totalTimeSpent,
        totalSitesVisited: trackingData.summary.totalSitesVisited,
        productivityScore: trackingData.summary.productivityScore,
        focusSessionsCompleted: trackingData.summary.focusSessions.filter(s => s.completed).length,
        blockedAttempts: trackingData.summary.blockedAttempts.length
      },
      topSites: trackingData.summary.topSites,
      categoryBreakdown: trackingData.summary.categoryBreakdown,
      hourlyBreakdown,
      insights,
      focusSessions: trackingData.summary.focusSessions,
      blockedAttempts: trackingData.summary.blockedAttempts
    };

    res.json({
      success: true,
      data: report
    });

  } catch (error) {
    console.error('Daily report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate daily report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   GET /api/reports/weekly
 * @desc    Generate weekly report
 * @access  Private
 */
router.get('/weekly', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { weekStart } = req.query;

  try {
    const weekStartDate = weekStart ? new Date(weekStart) : getWeekStart(new Date());
    
    if (isNaN(weekStartDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid week start date'
      });
    }

    const weeklySummary = await TrackingData.getWeeklySummary(userId, weekStartDate);
    const insights = generateWeeklyInsights(weeklySummary);

    const report = {
      weekStart: weekStartDate,
      weekEnd: new Date(weekStartDate.getTime() + 6 * 24 * 60 * 60 * 1000),
      summary: {
        totalTime: weeklySummary.totalTime,
        averageProductivityScore: weeklySummary.averageProductivityScore,
        focusSessionsCompleted: weeklySummary.focusSessionsCompleted,
        totalBlockedAttempts: weeklySummary.totalBlockedAttempts,
        activeDays: weeklySummary.dailyBreakdown.length
      },
      dailyBreakdown: weeklySummary.dailyBreakdown,
      topSites: weeklySummary.topSites,
      categoryBreakdown: weeklySummary.categoryBreakdown,
      insights,
      trends: calculateWeeklyTrends(weeklySummary.dailyBreakdown)
    };

    res.json({
      success: true,
      data: report
    });

  } catch (error) {
    console.error('Weekly report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate weekly report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   GET /api/reports/monthly
 * @desc    Generate monthly report
 * @access  Private
 */
router.get('/monthly', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { year, month } = req.query;

  try {
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    const targetMonth = month ? parseInt(month) - 1 : new Date().getMonth(); // Month is 0-indexed

    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0);

    const monthlyData = await TrackingData.getDateRange(userId, monthStart, monthEnd);

    // Aggregate monthly statistics
    const monthlySummary = aggregateMonthlyData(monthlyData);
    const insights = generateMonthlyInsights(monthlySummary, monthlyData);

    const report = {
      month: targetMonth + 1,
      year: targetYear,
      monthStart,
      monthEnd,
      summary: monthlySummary,
      weeklyBreakdown: generateWeeklyBreakdown(monthlyData),
      topSites: monthlySummary.topSites,
      categoryBreakdown: monthlySummary.categoryBreakdown,
      insights,
      trends: calculateMonthlyTrends(monthlyData)
    };

    res.json({
      success: true,
      data: report
    });

  } catch (error) {
    console.error('Monthly report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate monthly report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   GET /api/reports/custom
 * @desc    Generate custom date range report
 * @access  Private
 */
router.get('/custom', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { startDate, endDate } = req.query;

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

    const customData = await TrackingData.getDateRange(userId, start, end);
    const customSummary = aggregateCustomData(customData);
    const insights = generateCustomInsights(customSummary, customData);

    const report = {
      startDate: start,
      endDate: end,
      dayCount: Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1,
      summary: customSummary,
      dailyBreakdown: customData.map(day => ({
        date: day.date,
        totalTime: day.summary.totalTimeSpent,
        productivityScore: day.summary.productivityScore,
        sitesVisited: day.summary.totalSitesVisited
      })),
      topSites: customSummary.topSites,
      categoryBreakdown: customSummary.categoryBreakdown,
      insights,
      trends: calculateCustomTrends(customData)
    };

    res.json({
      success: true,
      data: report
    });

  } catch (error) {
    console.error('Custom report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate custom report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

/**
 * @route   GET /api/reports/productivity-trends
 * @desc    Get productivity trends over time
 * @access  Private
 */
router.get('/productivity-trends', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { days = 30 } = req.query;

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const trendData = await TrackingData.find({
      userId,
      date: { $gte: startDate }
    })
    .select('date summary.productivityScore summary.totalTimeSpent summary.categoryBreakdown')
    .sort({ date: 1 })
    .lean();

    const trends = {
      productivityScores: trendData.map(day => ({
        date: day.date,
        score: day.summary.productivityScore
      })),
      timeSpent: trendData.map(day => ({
        date: day.date,
        time: day.summary.totalTimeSpent
      })),
      categoryTrends: calculateCategoryTrends(trendData),
      averages: {
        productivityScore: trendData.reduce((sum, day) => sum + day.summary.productivityScore, 0) / trendData.length || 0,
        dailyTime: trendData.reduce((sum, day) => sum + day.summary.totalTimeSpent, 0) / trendData.length || 0
      }
    };

    res.json({
      success: true,
      data: trends
    });

  } catch (error) {
    console.error('Productivity trends error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get productivity trends',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

// Helper functions
function generateDailyInsights(trackingData) {
  const insights = [];
  const { summary } = trackingData;

  // Productivity insights
  if (summary.productivityScore >= 80) {
    insights.push({
      type: 'positive',
      title: 'Excellent Productivity!',
      message: `You had a highly productive day with a ${summary.productivityScore}% productivity score.`
    });
  } else if (summary.productivityScore <= 40) {
    insights.push({
      type: 'warning',
      title: 'Low Productivity',
      message: `Your productivity score was ${summary.productivityScore}%. Consider reducing time on distracting sites.`
    });
  }

  // Focus session insights
  const completedSessions = summary.focusSessions.filter(s => s.completed).length;
  if (completedSessions > 0) {
    insights.push({
      type: 'positive',
      title: 'Great Focus!',
      message: `You completed ${completedSessions} focus session${completedSessions > 1 ? 's' : ''} today.`
    });
  }

  // Time insights
  const hours = Math.floor(summary.totalTimeSpent / (1000 * 60 * 60));
  if (hours > 8) {
    insights.push({
      type: 'info',
      title: 'High Screen Time',
      message: `You spent ${hours} hours online today. Consider taking regular breaks.`
    });
  }

  return insights;
}

function generateWeeklyInsights(weeklySummary) {
  const insights = [];

  // Weekly productivity trend
  const avgScore = weeklySummary.averageProductivityScore;
  if (avgScore >= 70) {
    insights.push({
      type: 'positive',
      title: 'Productive Week!',
      message: `Your average productivity score was ${avgScore}% this week.`
    });
  }

  // Focus sessions
  if (weeklySummary.focusSessionsCompleted >= 5) {
    insights.push({
      type: 'positive',
      title: 'Focused Week',
      message: `You completed ${weeklySummary.focusSessionsCompleted} focus sessions this week.`
    });
  }

  return insights;
}

function generateMonthlyInsights(monthlySummary, monthlyData) {
  const insights = [];

  // Monthly trends
  const activeDays = monthlyData.length;
  const avgDailyTime = monthlySummary.totalTime / activeDays;
  const avgHours = Math.floor(avgDailyTime / (1000 * 60 * 60));

  insights.push({
    type: 'info',
    title: 'Monthly Overview',
    message: `You were active ${activeDays} days this month with an average of ${avgHours} hours daily.`
  });

  return insights;
}

function generateCustomInsights(customSummary, customData) {
  const insights = [];
  const days = customData.length;

  if (days > 0) {
    const avgProductivity = customSummary.averageProductivityScore;
    insights.push({
      type: 'info',
      title: 'Period Summary',
      message: `Over ${days} days, your average productivity score was ${avgProductivity}%.`
    });
  }

  return insights;
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}

function aggregateMonthlyData(monthlyData) {
  // Implementation for monthly data aggregation
  const summary = {
    totalTime: 0,
    averageProductivityScore: 0,
    topSites: {},
    categoryBreakdown: {},
    focusSessionsCompleted: 0,
    totalBlockedAttempts: 0
  };

  monthlyData.forEach(day => {
    summary.totalTime += day.summary.totalTimeSpent;
    summary.averageProductivityScore += day.summary.productivityScore;
    summary.focusSessionsCompleted += day.summary.focusSessions.filter(s => s.completed).length;
    summary.totalBlockedAttempts += day.summary.blockedAttempts.length;

    // Aggregate categories and sites
    Object.keys(day.summary.categoryBreakdown).forEach(category => {
      summary.categoryBreakdown[category] = (summary.categoryBreakdown[category] || 0) + day.summary.categoryBreakdown[category];
    });

    day.sites.forEach(site => {
      if (!summary.topSites[site.domain]) {
        summary.topSites[site.domain] = { timeSpent: 0, visits: 0, category: site.category };
      }
      summary.topSites[site.domain].timeSpent += site.timeSpent;
      summary.topSites[site.domain].visits += site.visits;
    });
  });

  if (monthlyData.length > 0) {
    summary.averageProductivityScore = Math.round(summary.averageProductivityScore / monthlyData.length);
  }

  // Convert topSites to array
  summary.topSites = Object.entries(summary.topSites)
    .map(([domain, data]) => ({ domain, ...data }))
    .sort((a, b) => b.timeSpent - a.timeSpent)
    .slice(0, 10);

  return summary;
}

function aggregateCustomData(customData) {
  return aggregateMonthlyData(customData); // Same logic
}

function calculateWeeklyTrends(dailyBreakdown) {
  // Calculate trends for weekly data
  return {
    timeSpentTrend: calculateTrend(dailyBreakdown.map(d => d.totalTime)),
    productivityTrend: calculateTrend(dailyBreakdown.map(d => d.productivityScore))
  };
}

function calculateMonthlyTrends(monthlyData) {
  const dailyTimes = monthlyData.map(d => d.summary.totalTimeSpent);
  const dailyScores = monthlyData.map(d => d.summary.productivityScore);

  return {
    timeSpentTrend: calculateTrend(dailyTimes),
    productivityTrend: calculateTrend(dailyScores)
  };
}

function calculateCustomTrends(customData) {
  return calculateMonthlyTrends(customData); // Same logic
}

function calculateTrend(values) {
  if (values.length < 2) return 'stable';
  
  const first = values.slice(0, Math.ceil(values.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(values.length / 2);
  const second = values.slice(Math.floor(values.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(values.length / 2);
  
  const change = ((second - first) / first) * 100;
  
  if (change > 10) return 'increasing';
  if (change < -10) return 'decreasing';
  return 'stable';
}

function generateHourlyBreakdown(trackingData) {
  // Generate hourly breakdown from sessions
  const hourlyData = new Array(24).fill(0);
  
  trackingData.sites.forEach(site => {
    site.sessions.forEach(session => {
      const hour = new Date(session.startTime).getHours();
      hourlyData[hour] += session.duration;
    });
  });

  return hourlyData.map((time, hour) => ({ hour, time }));
}

function generateWeeklyBreakdown(monthlyData) {
  // Group data by weeks
  const weeks = {};
  
  monthlyData.forEach(day => {
    const weekStart = getWeekStart(day.date);
    const weekKey = weekStart.toISOString().split('T')[0];
    
    if (!weeks[weekKey]) {
      weeks[weekKey] = { weekStart, totalTime: 0, avgProductivity: 0, days: 0 };
    }
    
    weeks[weekKey].totalTime += day.summary.totalTimeSpent;
    weeks[weekKey].avgProductivity += day.summary.productivityScore;
    weeks[weekKey].days += 1;
  });

  return Object.values(weeks).map(week => ({
    ...week,
    avgProductivity: Math.round(week.avgProductivity / week.days)
  }));
}

function calculateCategoryTrends(trendData) {
  const categories = ['work', 'socialMedia', 'entertainment', 'news', 'shopping', 'other'];
  const trends = {};

  categories.forEach(category => {
    const values = trendData.map(day => day.summary.categoryBreakdown[category] || 0);
    trends[category] = calculateTrend(values);
  });

  return trends;
}

module.exports = router;