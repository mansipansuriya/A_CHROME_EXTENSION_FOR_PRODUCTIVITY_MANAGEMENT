// Content script for tracking user activity on web pages
class ActivityTracker {
  constructor() {
    this.isActive = true;
    this.lastActivity = Date.now();
    this.idleThreshold = 30000; // 30 seconds
    this.checkInterval = 5000; // Check every 5 seconds
    
    this.init();
  }

  init() {
    // Only track if not on extension pages
    if (window.location.protocol === 'chrome-extension:') {
      return;
    }

    this.setupActivityListeners();
    this.startIdleDetection();
    this.notifyPageLoad();
  }

  setupActivityListeners() {
    const events = [
      'mousedown', 'mousemove', 'keypress', 'scroll', 
      'touchstart', 'click', 'focus', 'blur'
    ];

    events.forEach(event => {
      document.addEventListener(event, () => {
        this.updateActivity();
      }, { passive: true });
    });

    // Track visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.handlePageHidden();
      } else {
        this.handlePageVisible();
      }
    });

    // Track page unload
    window.addEventListener('beforeunload', () => {
      this.handlePageUnload();
    });
  }

  updateActivity() {
    this.lastActivity = Date.now();
    if (!this.isActive) {
      this.isActive = true;
      this.notifyActivityChange('active');
    }
  }

  startIdleDetection() {
    setInterval(() => {
      const timeSinceLastActivity = Date.now() - this.lastActivity;
      
      if (timeSinceLastActivity > this.idleThreshold && this.isActive) {
        this.isActive = false;
        this.notifyActivityChange('idle');
      }
    }, this.checkInterval);
  }

  notifyPageLoad() {
    this.sendMessage({
      type: 'pageLoad',
      url: window.location.href,
      title: document.title,
      timestamp: Date.now()
    });
  }

  handlePageHidden() {
    this.sendMessage({
      type: 'pageHidden',
      url: window.location.href,
      timestamp: Date.now()
    });
  }

  handlePageVisible() {
    this.sendMessage({
      type: 'pageVisible',
      url: window.location.href,
      timestamp: Date.now()
    });
    this.updateActivity();
  }

  handlePageUnload() {
    this.sendMessage({
      type: 'pageUnload',
      url: window.location.href,
      timestamp: Date.now()
    });
  }

  notifyActivityChange(status) {
    this.sendMessage({
      type: 'activityChange',
      status: status,
      url: window.location.href,
      timestamp: Date.now()
    });
  }

  sendMessage(data) {
    try {
      chrome.runtime.sendMessage(data);
    } catch (error) {
      // Extension might be reloading or disabled
      console.debug('Could not send message to background script:', error);
    }
  }
}

// Initialize activity tracker
const activityTracker = new ActivityTracker();

// Inject productivity overlay for blocked sites
class ProductivityOverlay {
  constructor() {
    this.checkIfBlocked();
  }

  async checkIfBlocked() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'checkBlocked',
        url: window.location.href
      });

      if (response && response.blocked) {
        this.showBlockedOverlay();
      }
    } catch (error) {
      // Silently handle errors
    }
  }

  showBlockedOverlay() {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'productivity-overlay';
    overlay.innerHTML = `
      <div class="productivity-modal">
        <div class="productivity-header">
          <h2>🚫 Site Blocked</h2>
          <p>This site is blocked to help you stay focused</p>
        </div>
        <div class="productivity-content">
          <p><strong>Current site:</strong> ${window.location.hostname}</p>
          <p>Take a moment to consider if visiting this site aligns with your productivity goals.</p>
        </div>
        <div class="productivity-actions">
          <button id="productivity-continue" class="btn-primary">Continue Anyway (5s)</button>
          <button id="productivity-close" class="btn-secondary">Close Tab</button>
        </div>
      </div>
    `;

    // Add styles
    const styles = `
      #productivity-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      
      .productivity-modal {
        background: white;
        border-radius: 12px;
        padding: 30px;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        text-align: center;
      }
      
      .productivity-header h2 {
        margin: 0 0 10px 0;
        color: #e74c3c;
        font-size: 24px;
      }
      
      .productivity-header p {
        margin: 0 0 20px 0;
        color: #666;
        font-size: 16px;
      }
      
      .productivity-content {
        margin: 20px 0;
        padding: 20px;
        background: #f8f9fa;
        border-radius: 8px;
        text-align: left;
      }
      
      .productivity-content p {
        margin: 10px 0;
        color: #333;
      }
      
      .productivity-actions {
        margin-top: 20px;
        display: flex;
        gap: 10px;
        justify-content: center;
      }
      
      .btn-primary, .btn-secondary {
        padding: 12px 24px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .btn-primary {
        background: #3498db;
        color: white;
      }
      
      .btn-primary:hover {
        background: #2980b9;
      }
      
      .btn-primary:disabled {
        background: #bdc3c7;
        cursor: not-allowed;
      }
      
      .btn-secondary {
        background: #95a5a6;
        color: white;
      }
      
      .btn-secondary:hover {
        background: #7f8c8d;
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
    document.body.appendChild(overlay);

    // Add event listeners
    this.setupOverlayEvents();
  }

  setupOverlayEvents() {
    const continueBtn = document.getElementById('productivity-continue');
    const closeBtn = document.getElementById('productivity-close');

    // Countdown for continue button
    let countdown = 5;
    continueBtn.disabled = true;
    
    const countdownInterval = setInterval(() => {
      countdown--;
      continueBtn.textContent = `Continue Anyway (${countdown}s)`;
      
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        continueBtn.textContent = 'Continue Anyway';
        continueBtn.disabled = false;
      }
    }, 1000);

    continueBtn.addEventListener('click', () => {
      if (!continueBtn.disabled) {
        document.getElementById('productivity-overlay').remove();
        
        // Log override event
        chrome.runtime.sendMessage({
          type: 'blockOverride',
          url: window.location.href,
          timestamp: Date.now()
        });
      }
    });

    closeBtn.addEventListener('click', () => {
      window.close();
    });

    // Prevent clicking outside to close
    document.getElementById('productivity-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'productivity-overlay') {
        e.preventDefault();
        e.stopPropagation();
      }
    });
  }
}

// Initialize overlay checker
const productivityOverlay = new ProductivityOverlay();

// Focus session timer
class FocusTimer {
  constructor() {
    this.isRunning = false;
    this.startTime = null;
    this.duration = 25 * 60 * 1000; // 25 minutes default
    this.checkFocusSession();
  }

  async checkFocusSession() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getFocusSession'
      });

      if (response && response.active) {
        this.startFocusMode(response.duration, response.startTime);
      }
    } catch (error) {
      // Silently handle errors
    }
  }

  startFocusMode(duration, startTime) {
    this.isRunning = true;
    this.duration = duration;
    this.startTime = startTime;
    
    this.showFocusIndicator();
    this.setupFocusTimer();
  }

  showFocusIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'focus-indicator';
    indicator.innerHTML = `
      <div class="focus-timer">
        <span class="focus-icon">🎯</span>
        <span class="focus-time" id="focus-time-display">25:00</span>
      </div>
    `;

    const styles = `
      #focus-indicator {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 999998;
        background: #2ecc71;
        color: white;
        padding: 10px 15px;
        border-radius: 25px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(46, 204, 113, 0.3);
        cursor: pointer;
        transition: all 0.2s;
      }
      
      #focus-indicator:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(46, 204, 113, 0.4);
      }
      
      .focus-timer {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .focus-icon {
        font-size: 16px;
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
    document.body.appendChild(indicator);
  }

  setupFocusTimer() {
    const updateTimer = () => {
      if (!this.isRunning) return;

      const elapsed = Date.now() - this.startTime;
      const remaining = Math.max(0, this.duration - elapsed);
      
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      
      const display = document.getElementById('focus-time-display');
      if (display) {
        display.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }

      if (remaining <= 0) {
        this.endFocusSession();
      }
    };

    updateTimer();
    this.timerInterval = setInterval(updateTimer, 1000);
  }

  endFocusSession() {
    this.isRunning = false;
    clearInterval(this.timerInterval);
    
    const indicator = document.getElementById('focus-indicator');
    if (indicator) {
      indicator.remove();
    }

    // Notify background script
    chrome.runtime.sendMessage({
      type: 'focusSessionComplete',
      timestamp: Date.now()
    });
  }
}

// Initialize focus timer
const focusTimer = new FocusTimer();