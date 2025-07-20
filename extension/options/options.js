// Options Page JavaScript for Productivity Tracker
class OptionsManager {
  constructor() {
    this.currentTab = 'dashboard';
    this.stats = {};
    this.settings = {};
    this.blockedSites = [];
    this.charts = {};
    
    this.init();
  }

  async init() {
    await this.loadData();
    this.setupEventListeners();
    this.setupTabs();
    this.updateAllTabs();
    
    // Handle URL hash for direct navigation
    this.handleUrlHash();
  }

  async loadData() {
    try {
      // Load stats from background script
      const statsResponse = await this.sendMessage({ action: 'getStats' });
      this.stats = statsResponse.stats || {};

      // Load settings and blocked sites
      const result = await chrome.storage.local.get([
        'userPreferences',
        'blockedSites',
        'dailyReports'
      ]);
      
      this.settings = result.userPreferences || {
        trackingEnabled: true,
        blockingEnabled: true,
        syncEnabled: true,
        focusNotifications: true,
        apiEndpoint: 'http://localhost:5000/api',
        syncInterval: 30,
        idleThreshold: 30,
        minVisitTime: 5
      };
      
      this.blockedSites = result.blockedSites || [];
      this.dailyReports = result.dailyReports || {};
      
    } catch (error) {
      console.error('Error loading data:', error);
      this.showNotification('Error loading data', 'error');
    }
  }

  setupEventListeners() {
    // Header actions
    document.getElementById('export-btn').addEventListener('click', () => {
      this.exportData();
    });

    document.getElementById('sync-btn').addEventListener('click', () => {
      this.syncData();
    });

    // Report generation
    document.getElementById('generate-report-btn').addEventListener('click', () => {
      this.generateReport();
    });

    // Blocked sites management
    document.getElementById('add-site-btn').addEventListener('click', () => {
      this.addBlockedSite();
    });

    document.getElementById('new-site-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addBlockedSite();
      }
    });

    // Category buttons
    document.querySelectorAll('.category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.addCategorySites(btn.dataset.category);
      });
    });

    // Settings
    document.getElementById('save-settings-btn').addEventListener('click', () => {
      this.saveSettings();
    });

    document.getElementById('reset-settings-btn').addEventListener('click', () => {
      this.resetSettings();
    });

    // Data management
    document.getElementById('clear-today-btn').addEventListener('click', () => {
      this.clearData('today');
    });

    document.getElementById('clear-week-btn').addEventListener('click', () => {
      this.clearData('week');
    });

    document.getElementById('clear-all-btn').addEventListener('click', () => {
      this.clearData('all');
    });

    // Set default date range
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    document.getElementById('end-date').value = today.toISOString().split('T')[0];
    document.getElementById('start-date').value = weekAgo.toISOString().split('T')[0];
  }

  setupTabs() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchTab(tab.dataset.tab);
      });
    });
  }

  switchTab(tabName) {
    // Update active tab
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update active content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');

    this.currentTab = tabName;
    
    // Update URL hash
    window.location.hash = tabName;
    
    // Load tab-specific data
    this.updateTabContent(tabName);
  }

  handleUrlHash() {
    const hash = window.location.hash.substring(1);
    if (hash && ['dashboard', 'reports', 'blocked-sites', 'settings'].includes(hash)) {
      this.switchTab(hash);
    }
  }

  async updateAllTabs() {
    await this.updateDashboard();
    await this.updateBlockedSites();
    this.updateSettings();
  }

  async updateTabContent(tabName) {
    switch (tabName) {
      case 'dashboard':
        await this.updateDashboard();
        break;
      case 'blocked-sites':
        await this.updateBlockedSites();
        break;
      case 'settings':
        this.updateSettings();
        break;
    }
  }

  async updateDashboard() {
    await this.updateOverviewStats();
    await this.updateTopSites();
    await this.updateCategoryBreakdown();
    this.createWeeklyChart();
  }

  async updateOverviewStats() {
    const today = new Date().toDateString();
    const todayStats = this.stats[today] || {};
    
    // Calculate stats
    const totalTime = Object.values(todayStats)
      .reduce((sum, site) => sum + (site.timeSpent || 0), 0);
    
    const sitesVisited = Object.keys(todayStats).length;
    
    const productivityScore = this.calculateProductivityScore(todayStats);
    
    // Focus sessions (would need to be tracked separately)
    const focusSessions = 0; // Placeholder
    
    // Update UI
    document.getElementById('total-time-today').textContent = this.formatTime(totalTime);
    document.getElementById('sites-visited-today').textContent = sitesVisited;
    document.getElementById('productivity-score-today').textContent = `${productivityScore}%`;
    document.getElementById('focus-sessions-today').textContent = focusSessions;
  }

  async updateTopSites() {
    const today = new Date().toDateString();
    const todayStats = this.stats[today] || {};
    
    const sortedSites = Object.entries(todayStats)
      .sort(([,a], [,b]) => (b.timeSpent || 0) - (a.timeSpent || 0))
      .slice(0, 10);
    
    const container = document.getElementById('top-sites-list');
    
    if (sortedSites.length === 0) {
      container.innerHTML = '<div class="loading">No activity today</div>';
      return;
    }
    
    container.innerHTML = sortedSites.map(([domain, data]) => `
      <div class="site-item">
        <div class="site-info">
          <div class="site-name">${domain}</div>
          <div class="site-category">${data.category || 'Other'}</div>
        </div>
        <div class="site-stats">
          <div class="site-time">${this.formatTime(data.timeSpent || 0)}</div>
          <div class="site-visits">${data.visits || 0} visits</div>
        </div>
      </div>
    `).join('');
  }

  async updateCategoryBreakdown() {
    const today = new Date().toDateString();
    const todayStats = this.stats[today] || {};
    
    const categories = {};
    let totalTime = 0;
    
    Object.values(todayStats).forEach(site => {
      const category = site.category || 'Other';
      const time = site.timeSpent || 0;
      
      if (!categories[category]) {
        categories[category] = { time: 0, visits: 0 };
      }
      categories[category].time += time;
      categories[category].visits += site.visits || 0;
      totalTime += time;
    });
    
    const container = document.getElementById('category-breakdown');
    
    if (totalTime === 0) {
      container.innerHTML = '<div class="loading">No activity today</div>';
      return;
    }
    
    const categoryColors = {
      'Work': '#28a745',
      'Social Media': '#007bff',
      'Entertainment': '#ffc107',
      'News': '#17a2b8',
      'Shopping': '#e83e8c',
      'Other': '#6c757d'
    };
    
    container.innerHTML = Object.entries(categories)
      .sort(([,a], [,b]) => b.time - a.time)
      .map(([category, data]) => {
        const percentage = Math.round((data.time / totalTime) * 100);
        const color = categoryColors[category] || '#6c757d';
        
        return `
          <div class="category-item">
            <div class="category-color" style="background: ${color}"></div>
            <div class="category-details">
              <div class="category-name">${category}</div>
              <div class="category-stats">${this.formatTime(data.time)} • ${data.visits} visits</div>
              <div class="category-bar">
                <div class="category-progress" style="width: ${percentage}%; background: ${color}"></div>
              </div>
            </div>
          </div>
        `;
      }).join('');
  }

  createWeeklyChart() {
    const ctx = document.getElementById('weekly-chart').getContext('2d');
    
    // Destroy existing chart
    if (this.charts.weekly) {
      this.charts.weekly.destroy();
    }
    
    // Get last 7 days of data
    const labels = [];
    const data = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toDateString();
      
      labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
      
      const dayStats = this.stats[dateKey] || {};
      const totalTime = Object.values(dayStats)
        .reduce((sum, site) => sum + (site.timeSpent || 0), 0);
      
      data.push(Math.round(totalTime / (1000 * 60 * 60) * 100) / 100); // Hours
    }
    
    this.charts.weekly = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Hours',
          data: data,
          borderColor: '#667eea',
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Hours'
            }
          }
        },
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
  }

  async generateReport() {
    const startDate = new Date(document.getElementById('start-date').value);
    const endDate = new Date(document.getElementById('end-date').value);
    
    if (startDate > endDate) {
      this.showNotification('Start date must be before end date', 'error');
      return;
    }
    
    this.showLoading(true);
    
    try {
      const reportData = this.generateReportData(startDate, endDate);
      this.displayReport(reportData);
      document.getElementById('report-results').classList.remove('hidden');
    } catch (error) {
      this.showNotification('Error generating report', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  generateReportData(startDate, endDate) {
    const reportStats = {};
    let totalTime = 0;
    let totalDays = 0;
    let mostProductiveDay = null;
    let maxDayTime = 0;
    
    // Iterate through date range
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateKey = currentDate.toDateString();
      const dayStats = this.stats[dateKey] || {};
      
      if (Object.keys(dayStats).length > 0) {
        totalDays++;
        
        const dayTime = Object.values(dayStats)
          .reduce((sum, site) => sum + (site.timeSpent || 0), 0);
        
        totalTime += dayTime;
        
        if (dayTime > maxDayTime) {
          maxDayTime = dayTime;
          mostProductiveDay = currentDate.toLocaleDateString();
        }
        
        // Aggregate site data
        Object.entries(dayStats).forEach(([domain, data]) => {
          if (!reportStats[domain]) {
            reportStats[domain] = {
              timeSpent: 0,
              visits: 0,
              category: data.category || 'Other'
            };
          }
          reportStats[domain].timeSpent += data.timeSpent || 0;
          reportStats[domain].visits += data.visits || 0;
        });
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    const avgDaily = totalDays > 0 ? totalTime / totalDays : 0;
    const avgScore = this.calculateProductivityScore(reportStats);
    
    return {
      totalTime,
      avgDaily,
      mostProductiveDay: mostProductiveDay || 'N/A',
      avgScore,
      sites: reportStats,
      categories: this.getCategoryBreakdown(reportStats)
    };
  }

  displayReport(reportData) {
    // Update summary stats
    document.getElementById('report-total-time').textContent = this.formatTime(reportData.totalTime);
    document.getElementById('report-avg-daily').textContent = this.formatTime(reportData.avgDaily);
    document.getElementById('report-most-productive').textContent = reportData.mostProductiveDay;
    document.getElementById('report-avg-score').textContent = `${reportData.avgScore}%`;
    
    // Create charts
    this.createDailyActivityChart();
    this.createCategoryPieChart(reportData.categories);
    
    // Update top sites table
    this.updateTopSitesTable(reportData.sites);
  }

  createDailyActivityChart() {
    const ctx = document.getElementById('daily-activity-chart').getContext('2d');
    
    if (this.charts.dailyActivity) {
      this.charts.dailyActivity.destroy();
    }
    
    // This would need actual daily data - simplified for demo
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const data = [4.2, 3.8, 5.1, 4.7, 3.9, 2.1, 1.8];
    
    this.charts.dailyActivity = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Hours',
          data: data,
          backgroundColor: '#667eea',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Hours'
            }
          }
        }
      }
    });
  }

  createCategoryPieChart(categories) {
    const ctx = document.getElementById('category-pie-chart').getContext('2d');
    
    if (this.charts.categoryPie) {
      this.charts.categoryPie.destroy();
    }
    
    const categoryColors = {
      'Work': '#28a745',
      'Social Media': '#007bff',
      'Entertainment': '#ffc107',
      'News': '#17a2b8',
      'Shopping': '#e83e8c',
      'Other': '#6c757d'
    };
    
    const labels = Object.keys(categories);
    const data = Object.values(categories);
    const colors = labels.map(label => categoryColors[label] || '#6c757d');
    
    this.charts.categoryPie = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }

  updateTopSitesTable(sites) {
    const tbody = document.querySelector('#top-sites-table tbody');
    
    const sortedSites = Object.entries(sites)
      .sort(([,a], [,b]) => (b.timeSpent || 0) - (a.timeSpent || 0))
      .slice(0, 20);
    
    tbody.innerHTML = sortedSites.map(([domain, data]) => `
      <tr>
        <td>${domain}</td>
        <td>${data.category || 'Other'}</td>
        <td>${this.formatTime(data.timeSpent || 0)}</td>
        <td>${data.visits || 0}</td>
      </tr>
    `).join('');
  }

  async updateBlockedSites() {
    const container = document.getElementById('blocked-sites-container');
    
    if (this.blockedSites.length === 0) {
      container.innerHTML = '<div class="loading">No blocked sites</div>';
      return;
    }
    
    container.innerHTML = this.blockedSites.map(site => `
      <div class="blocked-site-item">
        <div class="blocked-site-name">${site}</div>
        <button class="remove-site-btn" data-site="${site}">Remove</button>
      </div>
    `).join('');
    
    // Add event listeners for remove buttons
    container.querySelectorAll('.remove-site-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.removeBlockedSite(btn.dataset.site);
      });
    });
  }

  async addBlockedSite() {
    const input = document.getElementById('new-site-input');
    const site = input.value.trim().toLowerCase();
    
    if (!site) {
      this.showNotification('Please enter a site to block', 'error');
      return;
    }
    
    // Remove protocol and www if present
    const cleanSite = site.replace(/^https?:\/\//, '').replace(/^www\./, '');
    
    if (this.blockedSites.includes(cleanSite)) {
      this.showNotification('Site is already blocked', 'info');
      return;
    }
    
    this.blockedSites.push(cleanSite);
    
    try {
      await this.sendMessage({
        action: 'updateBlockedSites',
        sites: this.blockedSites
      });
      
      input.value = '';
      await this.updateBlockedSites();
      this.showNotification(`Blocked ${cleanSite}`, 'success');
    } catch (error) {
      this.showNotification('Error adding blocked site', 'error');
    }
  }

  async removeBlockedSite(site) {
    this.blockedSites = this.blockedSites.filter(s => s !== site);
    
    try {
      await this.sendMessage({
        action: 'updateBlockedSites',
        sites: this.blockedSites
      });
      
      await this.updateBlockedSites();
      this.showNotification(`Unblocked ${site}`, 'success');
    } catch (error) {
      this.showNotification('Error removing blocked site', 'error');
    }
  }

  addCategorySites(category) {
    const categorySites = {
      social: ['facebook.com', 'twitter.com', 'instagram.com', 'tiktok.com', 'snapchat.com'],
      entertainment: ['youtube.com', 'netflix.com', 'twitch.tv', 'reddit.com', 'imgur.com'],
      news: ['cnn.com', 'bbc.com', 'nytimes.com', 'reuters.com', 'npr.org'],
      shopping: ['amazon.com', 'ebay.com', 'etsy.com', 'shopify.com', 'alibaba.com']
    };
    
    const sites = categorySites[category] || [];
    const newSites = sites.filter(site => !this.blockedSites.includes(site));
    
    if (newSites.length === 0) {
      this.showNotification('All sites in this category are already blocked', 'info');
      return;
    }
    
    this.blockedSites.push(...newSites);
    
    this.sendMessage({
      action: 'updateBlockedSites',
      sites: this.blockedSites
    }).then(() => {
      this.updateBlockedSites();
      this.showNotification(`Added ${newSites.length} ${category} sites`, 'success');
    }).catch(() => {
      this.showNotification('Error adding category sites', 'error');
    });
  }

  updateSettings() {
    document.getElementById('tracking-enabled').checked = this.settings.trackingEnabled;
    document.getElementById('blocking-enabled').checked = this.settings.blockingEnabled;
    document.getElementById('sync-enabled').checked = this.settings.syncEnabled;
    document.getElementById('focus-notifications').checked = this.settings.focusNotifications;
    document.getElementById('api-endpoint').value = this.settings.apiEndpoint || '';
    document.getElementById('sync-interval').value = this.settings.syncInterval || 30;
    document.getElementById('idle-threshold').value = this.settings.idleThreshold || 30;
    document.getElementById('min-visit-time').value = this.settings.minVisitTime || 5;
  }

  async saveSettings() {
    const newSettings = {
      trackingEnabled: document.getElementById('tracking-enabled').checked,
      blockingEnabled: document.getElementById('blocking-enabled').checked,
      syncEnabled: document.getElementById('sync-enabled').checked,
      focusNotifications: document.getElementById('focus-notifications').checked,
      apiEndpoint: document.getElementById('api-endpoint').value,
      syncInterval: parseInt(document.getElementById('sync-interval').value),
      idleThreshold: parseInt(document.getElementById('idle-threshold').value),
      minVisitTime: parseInt(document.getElementById('min-visit-time').value)
    };
    
    try {
      await chrome.storage.local.set({ userPreferences: newSettings });
      
      // Notify background script of settings change
      await this.sendMessage({
        action: 'updateSettings',
        settings: newSettings
      });
      
      this.settings = newSettings;
      this.showNotification('Settings saved successfully', 'success');
    } catch (error) {
      this.showNotification('Error saving settings', 'error');
    }
  }

  async resetSettings() {
    if (!confirm('Are you sure you want to reset all settings to defaults?')) {
      return;
    }
    
    const defaultSettings = {
      trackingEnabled: true,
      blockingEnabled: true,
      syncEnabled: true,
      focusNotifications: true,
      apiEndpoint: 'http://localhost:5000/api',
      syncInterval: 30,
      idleThreshold: 30,
      minVisitTime: 5
    };
    
    try {
      await chrome.storage.local.set({ userPreferences: defaultSettings });
      this.settings = defaultSettings;
      this.updateSettings();
      this.showNotification('Settings reset to defaults', 'success');
    } catch (error) {
      this.showNotification('Error resetting settings', 'error');
    }
  }

  async clearData(type) {
    let confirmMessage = '';
    
    switch (type) {
      case 'today':
        confirmMessage = 'Are you sure you want to clear today\'s data?';
        break;
      case 'week':
        confirmMessage = 'Are you sure you want to clear this week\'s data?';
        break;
      case 'all':
        confirmMessage = 'Are you sure you want to clear ALL data? This cannot be undone!';
        break;
    }
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    try {
      if (type === 'today') {
        const today = new Date().toDateString();
        delete this.stats[today];
      } else if (type === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        Object.keys(this.stats).forEach(dateKey => {
          const date = new Date(dateKey);
          if (date >= weekAgo) {
            delete this.stats[dateKey];
          }
        });
      } else if (type === 'all') {
        this.stats = {};
      }
      
      await chrome.storage.local.set({ dailyStats: this.stats });
      await this.updateAllTabs();
      this.showNotification('Data cleared successfully', 'success');
    } catch (error) {
      this.showNotification('Error clearing data', 'error');
    }
  }

  async syncData() {
    this.showLoading(true);
    
    try {
      await this.sendMessage({ action: 'syncData' });
      this.showNotification('Data synced successfully', 'success');
    } catch (error) {
      this.showNotification('Sync failed', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  async exportData() {
    try {
      const response = await this.sendMessage({ action: 'exportData' });
      
      if (response.data) {
        const blob = new Blob([JSON.stringify(response.data, null, 2)], {
          type: 'application/json'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `productivity-data-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.showNotification('Data exported successfully', 'success');
      }
    } catch (error) {
      this.showNotification('Export failed', 'error');
    }
  }

  // Utility methods
  calculateProductivityScore(stats) {
    const productiveCategories = ['Work'];
    const distractingCategories = ['Social Media', 'Entertainment'];
    
    let productiveTime = 0;
    let distractingTime = 0;
    let totalTime = 0;
    
    Object.values(stats).forEach(site => {
      const time = site.timeSpent || 0;
      const category = site.category || 'Other';
      
      totalTime += time;
      
      if (productiveCategories.includes(category)) {
        productiveTime += time;
      } else if (distractingCategories.includes(category)) {
        distractingTime += time;
      }
    });
    
    if (totalTime === 0) return 0;
    
    const score = Math.max(0, Math.round(((productiveTime - distractingTime * 0.5) / totalTime) * 100));
    return Math.min(100, score);
  }

  getCategoryBreakdown(stats) {
    const categories = {};
    
    Object.values(stats).forEach(site => {
      const category = site.category || 'Other';
      const time = site.timeSpent || 0;
      
      if (!categories[category]) {
        categories[category] = 0;
      }
      categories[category] += time;
    });
    
    return categories;
  }

  formatTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  }

  showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) {
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
    }
  }

  showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    container.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  async sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }
}

// Initialize options manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new OptionsManager();
});