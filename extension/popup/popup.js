// Popup JavaScript for Productivity Tracker
class PopupManager {
  constructor() {
    this.currentStats = {};
    this.settings = {};
    this.focusSession = null;
    
    this.init();
  }

  async init() {
    await this.loadData();
    this.setupEventListeners();
    this.updateUI();
    this.startPeriodicUpdates();
  }

  async loadData() {
    try {
      // Load stats from background script
      const statsResponse = await this.sendMessage({ action: 'getStats' });
      this.currentStats = statsResponse.stats || {};

      // Load settings
      const settingsResult = await chrome.storage.local.get([
        'userPreferences',
        'blockedSites',
        'focusSession'
      ]);
      
      this.settings = settingsResult.userPreferences || {
        trackingEnabled: true,
        blockingEnabled: true,
        syncEnabled: true,
        apiEndpoint: 'http://localhost:5000/api',
        idleThreshold: 30
      };
      
      this.blockedSites = settingsResult.blockedSites || [];
      this.focusSession = settingsResult.focusSession || null;
      
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  setupEventListeners() {
    // Header actions
    document.getElementById('settings-btn').addEventListener('click', () => {
      this.showSettingsModal();
    });

    document.getElementById('sync-btn').addEventListener('click', () => {
      this.syncData();
    });

    // Focus mode
    document.getElementById('focus-mode-btn').addEventListener('click', () => {
      if (this.focusSession && this.focusSession.active) {
        this.stopFocusSession();
      } else {
        this.showFocusModal();
      }
    });

    // Quick actions
    document.getElementById('block-current-btn').addEventListener('click', () => {
      this.blockCurrentSite();
    });

    document.getElementById('view-reports-btn').addEventListener('click', () => {
      this.openReportsPage();
    });

    document.getElementById('export-data-btn').addEventListener('click', () => {
      this.exportData();
    });

    // Focus modal
    document.getElementById('close-focus-modal').addEventListener('click', () => {
      this.hideFocusModal();
    });

    document.getElementById('start-focus-btn').addEventListener('click', () => {
      this.startFocusSession();
    });

    document.getElementById('cancel-focus-btn').addEventListener('click', () => {
      this.hideFocusModal();
    });

    // Settings modal
    document.getElementById('close-settings-modal').addEventListener('click', () => {
      this.hideSettingsModal();
    });

    document.getElementById('save-settings-btn').addEventListener('click', () => {
      this.saveSettings();
    });

    document.getElementById('cancel-settings-btn').addEventListener('click', () => {
      this.hideSettingsModal();
    });

    // Modal backdrop clicks
    document.getElementById('focus-modal').addEventListener('click', (e) => {
      if (e.target.id === 'focus-modal') {
        this.hideFocusModal();
      }
    });

    document.getElementById('settings-modal').addEventListener('click', (e) => {
      if (e.target.id === 'settings-modal') {
        this.hideSettingsModal();
      }
    });
  }

  async updateUI() {
    await this.updateQuickStats();
    await this.updateCurrentSession();
    await this.updateTopSites();
    await this.updateCategoryChart();
    this.updateFocusButton();
  }

  async updateQuickStats() {
    const today = new Date().toDateString();
    const todayStats = this.currentStats[today] || {};
    
    // Calculate total time today
    const totalTime = Object.values(todayStats)
      .reduce((sum, site) => sum + (site.timeSpent || 0), 0);
    
    // Calculate active sites
    const activeSites = Object.keys(todayStats).length;
    
    // Calculate productivity score
    const productivityScore = this.calculateProductivityScore(todayStats);
    
    // Update UI
    document.getElementById('today-time').textContent = this.formatTime(totalTime);
    document.getElementById('active-sites').textContent = activeSites;
    document.getElementById('productivity-score').textContent = `${productivityScore}%`;
  }

  async updateCurrentSession() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      
      if (currentTab && currentTab.url) {
        const domain = new URL(currentTab.url).hostname;
        document.getElementById('current-site').textContent = domain;
        
        // Get session time (this would need to be tracked in background)
        document.getElementById('session-time').textContent = '0:00';
      } else {
        document.getElementById('current-site').textContent = 'No active tab';
        document.getElementById('session-time').textContent = '0:00';
      }
    } catch (error) {
      document.getElementById('current-site').textContent = 'Unknown';
      document.getElementById('session-time').textContent = '0:00';
    }
  }

  async updateTopSites() {
    const today = new Date().toDateString();
    const todayStats = this.currentStats[today] || {};
    
    // Sort sites by time spent
    const sortedSites = Object.entries(todayStats)
      .sort(([,a], [,b]) => (b.timeSpent || 0) - (a.timeSpent || 0))
      .slice(0, 5);
    
    const container = document.getElementById('top-sites');
    
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
        <div class="site-time">${this.formatTime(data.timeSpent || 0)}</div>
      </div>
    `).join('');
  }

  async updateCategoryChart() {
    const today = new Date().toDateString();
    const todayStats = this.currentStats[today] || {};
    
    // Group by category
    const categories = {};
    let totalTime = 0;
    
    Object.values(todayStats).forEach(site => {
      const category = site.category || 'Other';
      const time = site.timeSpent || 0;
      
      if (!categories[category]) {
        categories[category] = 0;
      }
      categories[category] += time;
      totalTime += time;
    });
    
    const container = document.getElementById('category-chart');
    
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
      .sort(([,a], [,b]) => b - a)
      .map(([category, time]) => {
        const percentage = Math.round((time / totalTime) * 100);
        const color = categoryColors[category] || '#6c757d';
        
        return `
          <div class="category-item">
            <div class="category-color" style="background: ${color}"></div>
            <div class="category-info">
              <div class="category-name">${category}</div>
              <div class="category-time">${this.formatTime(time)}</div>
            </div>
          </div>
          <div class="category-bar">
            <div class="category-progress" style="width: ${percentage}%; background: ${color}"></div>
          </div>
        `;
      }).join('');
  }

  updateFocusButton() {
    const button = document.getElementById('focus-mode-btn');
    
    if (this.focusSession && this.focusSession.active) {
      button.textContent = 'Stop Focus Mode';
      button.classList.remove('btn-primary');
      button.classList.add('btn-secondary');
    } else {
      button.textContent = 'Start Focus Mode';
      button.classList.remove('btn-secondary');
      button.classList.add('btn-primary');
    }
  }

  calculateProductivityScore(todayStats) {
    const productiveCategories = ['Work'];
    const distractingCategories = ['Social Media', 'Entertainment'];
    
    let productiveTime = 0;
    let distractingTime = 0;
    let totalTime = 0;
    
    Object.values(todayStats).forEach(site => {
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

  showFocusModal() {
    document.getElementById('focus-modal').classList.remove('hidden');
  }

  hideFocusModal() {
    document.getElementById('focus-modal').classList.add('hidden');
  }

  async startFocusSession() {
    const duration = parseInt(document.getElementById('focus-duration').value);
    const blockDistracting = document.getElementById('block-distracting').checked;
    const showTimer = document.getElementById('show-timer').checked;
    
    const focusSession = {
      active: true,
      startTime: Date.now(),
      duration: duration * 60 * 1000,
      blockDistracting,
      showTimer
    };
    
    await chrome.storage.local.set({ focusSession });
    
    // Notify background script
    await this.sendMessage({
      action: 'startFocusSession',
      session: focusSession
    });
    
    this.focusSession = focusSession;
    this.updateFocusButton();
    this.hideFocusModal();
  }

  async stopFocusSession() {
    await chrome.storage.local.remove('focusSession');
    
    // Notify background script
    await this.sendMessage({ action: 'stopFocusSession' });
    
    this.focusSession = null;
    this.updateFocusButton();
  }

  showSettingsModal() {
    // Populate current settings
    document.getElementById('tracking-enabled').checked = this.settings.trackingEnabled;
    document.getElementById('blocking-enabled').checked = this.settings.blockingEnabled;
    document.getElementById('sync-enabled').checked = this.settings.syncEnabled;
    document.getElementById('api-endpoint').value = this.settings.apiEndpoint || '';
    document.getElementById('idle-threshold').value = this.settings.idleThreshold || 30;
    
    document.getElementById('settings-modal').classList.remove('hidden');
  }

  hideSettingsModal() {
    document.getElementById('settings-modal').classList.add('hidden');
  }

  async saveSettings() {
    const newSettings = {
      trackingEnabled: document.getElementById('tracking-enabled').checked,
      blockingEnabled: document.getElementById('blocking-enabled').checked,
      syncEnabled: document.getElementById('sync-enabled').checked,
      apiEndpoint: document.getElementById('api-endpoint').value,
      idleThreshold: parseInt(document.getElementById('idle-threshold').value)
    };
    
    await chrome.storage.local.set({ userPreferences: newSettings });
    
    // Notify background script of settings change
    await this.sendMessage({
      action: 'updateSettings',
      settings: newSettings
    });
    
    this.settings = newSettings;
    this.hideSettingsModal();
  }

  async blockCurrentSite() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      
      if (currentTab && currentTab.url) {
        const domain = new URL(currentTab.url).hostname;
        
        if (!this.blockedSites.includes(domain)) {
          this.blockedSites.push(domain);
          
          await this.sendMessage({
            action: 'updateBlockedSites',
            sites: this.blockedSites
          });
          
          // Show confirmation
          this.showNotification(`Blocked ${domain}`, 'success');
        } else {
          this.showNotification(`${domain} is already blocked`, 'info');
        }
      }
    } catch (error) {
      this.showNotification('Error blocking site', 'error');
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

  openReportsPage() {
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html#reports') });
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
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Add styles
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 6px;
      color: white;
      font-size: 13px;
      z-index: 10000;
      animation: slideInRight 0.3s ease;
    `;
    
    switch (type) {
      case 'success':
        notification.style.background = '#28a745';
        break;
      case 'error':
        notification.style.background = '#dc3545';
        break;
      case 'info':
      default:
        notification.style.background = '#17a2b8';
        break;
    }
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  startPeriodicUpdates() {
    // Update UI every 30 seconds
    setInterval(() => {
      this.updateUI();
    }, 30000);
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

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});

// Add notification animation styles
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInRight {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;
document.head.appendChild(style);