// Background script for productivity tracking
class ProductivityTracker {
  constructor() {
    this.currentTab = null;
    this.startTime = null;
    this.dailyStats = {};
    this.blockedSites = [];
    this.isTracking = true;
    
    this.init();
  }

  async init() {
    // Load saved data
    await this.loadData();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Set up periodic sync with backend
    this.setupPeriodicSync();
    
    // Set up daily reset alarm
    this.setupDailyReset();
  }

  async loadData() {
    try {
      const result = await chrome.storage.local.get([
        'dailyStats',
        'blockedSites',
        'isTracking',
        'userPreferences'
      ]);
      
      this.dailyStats = result.dailyStats || {};
      this.blockedSites = result.blockedSites || [];
      this.isTracking = result.isTracking !== false;
      this.userPreferences = result.userPreferences || {
        trackingEnabled: true,
        blockingEnabled: true,
        syncEnabled: true,
        apiEndpoint: 'http://localhost:5000/api'
      };
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  setupEventListeners() {
    // Tab activation
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.handleTabChange(activeInfo.tabId);
    });

    // Tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.active) {
        this.handleTabChange(tabId);
      }
    });

    // Window focus changes
    chrome.windows.onFocusChanged.addListener((windowId) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        this.handleTabChange(null);
      } else {
        chrome.tabs.query({ active: true, windowId: windowId }, (tabs) => {
          if (tabs[0]) {
            this.handleTabChange(tabs[0].id);
          }
        });
      }
    });

    // Message handling
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async response
    });

    // Alarm handling
    chrome.alarms.onAlarm.addListener((alarm) => {
      this.handleAlarm(alarm);
    });
  }

  async handleTabChange(tabId) {
    // Save time for previous tab
    if (this.currentTab && this.startTime) {
      const timeSpent = Date.now() - this.startTime;
      await this.recordTime(this.currentTab.url, timeSpent);
    }

    // Start tracking new tab
    if (tabId) {
      try {
        const tab = await chrome.tabs.get(tabId);
        this.currentTab = tab;
        this.startTime = Date.now();
        
        // Check if site should be blocked
        if (this.shouldBlockSite(tab.url)) {
          await this.blockCurrentSite(tab);
        }
      } catch (error) {
        console.error('Error getting tab info:', error);
      }
    } else {
      this.currentTab = null;
      this.startTime = null;
    }
  }

  async recordTime(url, timeSpent) {
    if (!this.isTracking || !url || timeSpent < 1000) return; // Ignore very short visits

    try {
      const domain = new URL(url).hostname;
      const today = new Date().toDateString();
      
      if (!this.dailyStats[today]) {
        this.dailyStats[today] = {};
      }
      
      if (!this.dailyStats[today][domain]) {
        this.dailyStats[today][domain] = {
          timeSpent: 0,
          visits: 0,
          category: await this.categorizeWebsite(domain)
        };
      }
      
      this.dailyStats[today][domain].timeSpent += timeSpent;
      this.dailyStats[today][domain].visits += 1;
      
      // Save to storage
      await chrome.storage.local.set({ dailyStats: this.dailyStats });
      
      // Update badge
      await this.updateBadge();
      
    } catch (error) {
      console.error('Error recording time:', error);
    }
  }

  shouldBlockSite(url) {
    if (!this.userPreferences.blockingEnabled) return false;
    
    try {
      const domain = new URL(url).hostname;
      return this.blockedSites.some(blockedSite => 
        domain.includes(blockedSite) || blockedSite.includes(domain)
      );
    } catch (error) {
      return false;
    }
  }

  async blockCurrentSite(tab) {
    try {
      await chrome.tabs.update(tab.id, {
        url: chrome.runtime.getURL('blocked/blocked.html') + '?site=' + encodeURIComponent(tab.url)
      });
    } catch (error) {
      console.error('Error blocking site:', error);
    }
  }

  async categorizeWebsite(domain) {
    const categories = {
      'Social Media': ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'tiktok.com'],
      'Entertainment': ['youtube.com', 'netflix.com', 'twitch.tv', 'reddit.com'],
      'News': ['cnn.com', 'bbc.com', 'nytimes.com', 'reuters.com'],
      'Work': ['github.com', 'stackoverflow.com', 'docs.google.com', 'slack.com'],
      'Shopping': ['amazon.com', 'ebay.com', 'etsy.com', 'shopify.com']
    };

    for (const [category, domains] of Object.entries(categories)) {
      if (domains.some(d => domain.includes(d))) {
        return category;
      }
    }
    
    return 'Other';
  }

  async updateBadge() {
    const today = new Date().toDateString();
    const todayStats = this.dailyStats[today] || {};
    
    const totalTime = Object.values(todayStats)
      .reduce((sum, site) => sum + site.timeSpent, 0);
    
    const hours = Math.floor(totalTime / (1000 * 60 * 60));
    const badgeText = hours > 0 ? `${hours}h` : '';
    
    await chrome.action.setBadgeText({ text: badgeText });
    await chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'getStats':
          sendResponse({ stats: this.dailyStats });
          break;
          
        case 'getBlockedSites':
          sendResponse({ blockedSites: this.blockedSites });
          break;
          
        case 'updateBlockedSites':
          this.blockedSites = request.sites;
          await chrome.storage.local.set({ blockedSites: this.blockedSites });
          await this.updateBlockingRules();
          sendResponse({ success: true });
          break;
          
        case 'toggleTracking':
          this.isTracking = request.enabled;
          await chrome.storage.local.set({ isTracking: this.isTracking });
          sendResponse({ success: true });
          break;
          
        case 'syncData':
          await this.syncWithBackend();
          sendResponse({ success: true });
          break;
          
        case 'exportData':
          const exportData = {
            dailyStats: this.dailyStats,
            blockedSites: this.blockedSites,
            preferences: this.userPreferences
          };
          sendResponse({ data: exportData });
          break;
          
        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ error: error.message });
    }
  }

  async updateBlockingRules() {
    try {
      const rules = this.blockedSites.map((site, index) => ({
        id: index + 1,
        priority: 1,
        action: { type: 'redirect', redirect: { url: chrome.runtime.getURL('blocked/blocked.html') } },
        condition: { urlFilter: `*://*.${site}/*` }
      }));

      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: Array.from({ length: 1000 }, (_, i) => i + 1),
        addRules: rules
      });
    } catch (error) {
      console.error('Error updating blocking rules:', error);
    }
  }

  setupPeriodicSync() {
    // Sync every 30 minutes
    chrome.alarms.create('syncData', { periodInMinutes: 30 });
  }

  setupDailyReset() {
    // Reset daily stats at midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    chrome.alarms.create('dailyReset', { when: tomorrow.getTime() });
  }

  async handleAlarm(alarm) {
    switch (alarm.name) {
      case 'syncData':
        if (this.userPreferences.syncEnabled) {
          await this.syncWithBackend();
        }
        break;
        
      case 'dailyReset':
        await this.generateDailyReport();
        this.setupDailyReset(); // Schedule next reset
        break;
    }
  }

  async syncWithBackend() {
    if (!this.userPreferences.syncEnabled || !this.userPreferences.apiEndpoint) {
      return;
    }

    try {
      const response = await fetch(`${this.userPreferences.apiEndpoint}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dailyStats: this.dailyStats,
          blockedSites: this.blockedSites,
          timestamp: Date.now()
        })
      });

      if (response.ok) {
        console.log('Data synced successfully');
      }
    } catch (error) {
      console.error('Sync failed:', error);
    }
  }

  async generateDailyReport() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateKey = yesterday.toDateString();
    
    const stats = this.dailyStats[dateKey];
    if (!stats) return;

    const report = {
      date: dateKey,
      totalTime: Object.values(stats).reduce((sum, site) => sum + site.timeSpent, 0),
      topSites: Object.entries(stats)
        .sort(([,a], [,b]) => b.timeSpent - a.timeSpent)
        .slice(0, 5),
      categories: this.getCategoryBreakdown(stats)
    };

    // Store report
    const reports = await chrome.storage.local.get('dailyReports');
    const allReports = reports.dailyReports || {};
    allReports[dateKey] = report;
    
    await chrome.storage.local.set({ dailyReports: allReports });
  }

  getCategoryBreakdown(stats) {
    const categories = {};
    
    Object.values(stats).forEach(site => {
      const category = site.category || 'Other';
      if (!categories[category]) {
        categories[category] = 0;
      }
      categories[category] += site.timeSpent;
    });
    
    return categories;
  }
}

// Initialize the tracker
const tracker = new ProductivityTracker();