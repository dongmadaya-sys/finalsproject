const devicesList = document.getElementById('devices-list');
const alertsList = document.getElementById('alerts-list');
const thresholdEl = document.getElementById('threshold');
const wsUrlEl = document.getElementById('ws-url');

let noiseChart, avgGaugeChart, peakGaugeChart, dailyChart, monthlyChart;
const state = { devices: {}, chartLabels: [], maxPoints: 30, isLoggedIn: false, history: [], historyMax: 2880, uiReady: false, selectedDevice: null };
const dataBuffer = []; // Buffer data until UI is ready
let chartRefreshInterval = null; // Periodic chart refresh interval
let analysisUpdateInterval = null; // Periodic analysis update interval

// Device name mapping - customize friendly names for device IDs
const deviceNameMap = {
  'esp32-001': 'Device1',
  'esp32-002': 'Device2',
  'esp32-003': 'Device3'
  // Add more mappings as needed
};

// Get friendly name for device ID
function getFriendlyDeviceName(deviceId) {
  return deviceNameMap[deviceId] || deviceId;
}

// Meter-style Gauge drawing function - MUST be at top level for accessibility
function drawMeterGauge(canvas, value, maxValue = 120, label = '') {
  if (!canvas) {
    console.warn('[GAUGE] Canvas not provided');
    return;
  }
  
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('[GAUGE] Could not get 2D context from canvas');
      return;
    }
    
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height * 0.60;
    const radius = Math.min(width, height) * 0.35;
    
    // Clear canvas with transparency
    ctx.clearRect(0, 0, width, height);
    
    // Draw background arc
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI, 2 * Math.PI);
    ctx.stroke();
    
    // Draw color zones (cyan, amber, red)
    const zones = [
      { start: 0, end: 60, color: '#22d3ee' },      // Cyan - safe
      { start: 60, end: 80, color: '#fbbf24' },     // Amber - warning
      { start: 80, end: 120, color: '#f43f5e' }     // Rose - critical
    ];
    
    zones.forEach(zone => {
      const startAngle = Math.PI + (zone.start / maxValue) * Math.PI;
      const endAngle = Math.PI + (zone.end / maxValue) * Math.PI;
      ctx.strokeStyle = zone.color;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    
    // Clamp value to max
    const displayValue = Math.max(0, Math.min(value, maxValue));
    
    // Determine needle color based on value
    let needleColor = '#22d3ee';
    if (displayValue >= 80) needleColor = '#f43f5e';
    else if (displayValue >= 60) needleColor = '#fbbf24';
    
    // Draw needle
    const needleAngle = Math.PI + (displayValue / maxValue) * Math.PI;
    const needleX = centerX + Math.cos(needleAngle) * radius;
    const needleY = centerY + Math.sin(needleAngle) * radius;
    
    ctx.strokeStyle = needleColor;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(needleX, needleY);
    ctx.stroke();
    
    // Draw center circle
    ctx.fillStyle = needleColor;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 7, 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalAlpha = 1;
    
    // Draw outer ring of center circle
    ctx.strokeStyle = needleColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 7, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.globalAlpha = 1;
    
    // Draw value text
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 28px Inter, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(displayValue), centerX, centerY + 45);
    
    // Draw "dB" smaller below value
    ctx.font = '12px Inter, Segoe UI, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('dB', centerX, centerY + 62);
  } catch (e) {
    console.error('[GAUGE] Error drawing gauge:', e.message);
  }
}

// Simple demo credentials
const VALID_CREDENTIALS = { 
  'admin': 'admin123', 
  'user': 'user123' 
};

console.log('[INIT] VALID_CREDENTIALS loaded:', VALID_CREDENTIALS);

// Login handler
function handleLogin(event) {
  if (event) {
    event.preventDefault();
  }
  
  console.log('[LOGIN] handleLogin() called');
  
  // Clear any previous errors
  const errorEl = document.getElementById('login-error');
  const initErrorEl = document.getElementById('init-error');
  if (errorEl) errorEl.style.display = 'none';
  if (initErrorEl) initErrorEl.style.display = 'none';
  
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  
  if (!usernameInput || !passwordInput) {
    console.error('[LOGIN] Input elements not found');
    return false;
  }
  
  const username = (usernameInput.value || '').trim();
  const password = (passwordInput.value || '').trim();
  
  console.log('[LOGIN] Attempting login with username:', JSON.stringify(username), 'password length:', password.length);
  console.log('[LOGIN] Valid credentials:', JSON.stringify(VALID_CREDENTIALS));
  console.log('[LOGIN] Username exists in credentials:', username in VALID_CREDENTIALS);
  
  if (VALID_CREDENTIALS[username]) {
    console.log('[LOGIN] Expected password:', JSON.stringify(VALID_CREDENTIALS[username]));
    console.log('[LOGIN] Provided password:', JSON.stringify(password));
    console.log('[LOGIN] Passwords match:', VALID_CREDENTIALS[username] === password);
  }
  
  if (VALID_CREDENTIALS[username] && VALID_CREDENTIALS[username] === password) {
    console.log('[LOGIN] ✓ Credentials valid, setting state...');
    state.isLoggedIn = true;
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('username', username);
    console.log('[LOGIN] ✓ State saved to localStorage');
    
    console.log('[LOGIN] ✓ Calling showApp()...');
    try {
      showApp();
      console.log('[LOGIN] ✓ showApp() completed successfully');
      return false;
    } catch (e) {
      console.error('[LOGIN] CRITICAL: showApp() threw error:', e.message);
      console.error('[LOGIN] Stack:', e.stack);
      
      // Try to show error to user
      if (errorEl) {
        errorEl.textContent = 'Error loading dashboard: ' + e.message + '. Check console (Ctrl+Shift+I) for details.';
        errorEl.style.display = 'block';
      }
      return false;
    }
  } else {
    console.log('[LOGIN] ✗ Login failed - invalid credentials');
    const errorEl = document.getElementById('login-error');
    if (errorEl) {
      errorEl.textContent = 'Invalid username or password. Try: admin / admin123 or user / user123';
      errorEl.style.display = 'block';
    }
    if (passwordInput) {
      passwordInput.value = '';
    }
    return false;
  }
}

// Logout
function handleLogout() {
  state.isLoggedIn = false;
  localStorage.removeItem('isLoggedIn');
  localStorage.removeItem('username');
  document.getElementById('username').value = '';
  document.getElementById('password').value = '';
  document.getElementById('login-error').style.display = 'none';
  if (chartRefreshInterval) {
    clearInterval(chartRefreshInterval);
    chartRefreshInterval = null;
    console.log('[LOGOUT] ✓ Chart refresh interval stopped');
  }
  showLoginScreen();
}

// Show app / login
function showApp() {
  console.log('[SHOWAPP] showApp() called, state.isLoggedIn:', state.isLoggedIn);
  
  try {
    // Hide login screen
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app');
    
    if (!loginScreen || !appContainer) {
      console.error('[SHOWAPP] CRITICAL: UI containers not found!');
      console.error('[SHOWAPP] login-screen exists:', !!loginScreen);
      console.error('[SHOWAPP] app exists:', !!appContainer);
      return;
    }
    
    loginScreen.style.display = 'none';
    appContainer.style.display = 'grid';
    console.log('[SHOWAPP] ✓ UI containers displayed');
  } catch (e) {
    console.error('[SHOWAPP] CRITICAL ERROR updating UI:', e.message, e.stack);
    return;
  }

  try {
    const logoutBtn = document.getElementById('logout-btn');
    if (!logoutBtn) {
      console.warn('[SHOWAPP] Logout button not found');
    } else {
      if (state.isLoggedIn) {
        logoutBtn.textContent = 'Logout';
        logoutBtn.onclick = handleLogout;
      } else {
        logoutBtn.textContent = 'Login';
        logoutBtn.onclick = () => { showLoginScreen(); };
      }
      console.log('[SHOWAPP] ✓ Logout button configured');
    }
  } catch (e) {
    console.error('[SHOWAPP] Error setting up logout button:', e.message);
  }

  // Initialize chart first so incoming data (from queryDevices) has the chart to update
  let chartInitFailed = false;
  try {
    console.log('[SHOWAPP] Initializing charts...');
    initChart();
    console.log('[SHOWAPP] ✓ Charts initialized successfully');
  } catch (e) {
    console.error('[SHOWAPP] ERROR initializing charts:', e.message);
    console.error('[SHOWAPP] Stack:', e.stack);
    chartInitFailed = true;
    const initErrorDiv = document.getElementById('init-error');
    if (initErrorDiv) {
      initErrorDiv.textContent = `Dashboard initialization failed: ${e.message}. Check console (Ctrl+Shift+I) for details.`;
      initErrorDiv.style.display = 'block';
    }
    console.warn('[SHOWAPP] Continuing without charts...');
  }

  try {
    console.log('[SHOWAPP] Attaching data listeners...');
    attachDataListeners();
    console.log('[SHOWAPP] ✓ Data listeners attached successfully');
  } catch (e) {
    console.error('[SHOWAPP] ERROR attaching data listeners:', e.message);
    console.error('[SHOWAPP] Stack:', e.stack);
    const initErrorDiv = document.getElementById('init-error');
    if (initErrorDiv) {
      initErrorDiv.textContent = `Failed to attach data listeners: ${e.message}. Check console (Ctrl+Shift+I) for details.`;
      initErrorDiv.style.display = 'block';
    }
    console.warn('[SHOWAPP] Continuing without data listeners...');
  }

  if (chartInitFailed) {
    console.warn('[SHOWAPP] ⚠️ App loaded with errors - charts may not work');
  }

  // Start periodic chart refresh to show accumulated data without waiting for new data
  if (chartRefreshInterval) clearInterval(chartRefreshInterval);
  chartRefreshInterval = setInterval(() => {
    if (state.isLoggedIn && (dailyChart || monthlyChart)) {
      console.log('[REFRESH] Periodic chart refresh triggered. History length:', state.history.length);
      updateHistoryCharts();
    }
  }, 3000); // Refresh every 3 seconds
  console.log('[SHOWAPP] ✓ Chart refresh interval started (3s)');

  // Initialize data analysis after everything is ready
  try {
    console.log('[SHOWAPP] Initializing data analysis...');
    startAnalysisTimer();
    console.log('[SHOWAPP] ✓ Data analysis initialized');
    // Perform first analysis immediately
    setTimeout(() => performDataAnalysis(), 500);
  } catch (e) {
    console.warn('[SHOWAPP] Warning initializing data analysis:', e.message);
  }
  
  console.log('[SHOWAPP] ✓ showApp() complete - app should be visible now');
}

function showLoginScreen() {
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

function checkSession() {
  // Check if user was previously logged in
  const wasLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const username = localStorage.getItem('username');
  
  console.log('[SESSION] checkSession called. wasLoggedIn:', wasLoggedIn, 'username:', username);
  
  try {
    if (wasLoggedIn && username) {
      // Auto-restore previous session
      console.log('[SESSION] Restoring session for user:', username);
      state.isLoggedIn = true;
      document.getElementById('username').value = username;
      showApp();
    } else {
      // First time or session expired - show login screen
      console.log('[SESSION] No previous session, showing login screen');
      showLoginScreen();
    }
  } catch (e) {
    console.error('[SESSION] CRITICAL ERROR in checkSession:', e.message);
    console.error('[SESSION] Stack:', e.stack);
    console.warn('[SESSION] Falling back to login screen');
    showLoginScreen();
  }
}

// Initialize neon chart
function initChart() {
  console.log('[INIT] initChart() called');
  
  try {
    const noiseEl = document.getElementById('noiseChart');
    if (noiseEl) {
      const ctx = noiseEl.getContext('2d');
      noiseChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 400 },
          plugins: {
            legend: { display: false },
            tooltip: {
              mode: 'index',
              intersect: false,
              backgroundColor: 'rgba(10,14,22,0.95)',
              titleColor: '#f8fafc',
              bodyColor: '#e6eef6',
              borderColor: 'rgba(255,255,255,0.06)',
              borderWidth: 1,
              padding: 10,
            }
          },
          interaction: { mode: 'index', intersect: false },
          elements: { line: { tension: 0.35, borderWidth: 2 }, point: { radius: 0 } },
          scales: {
            x: {
              grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
              ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 45, font: { size: 8 }, autoSkip: true, maxTicksLimit: 10 }
            },
            y: {
              min: 0,
              max: 120,
              grid: { color: 'rgba(255,255,255,0.03)', borderDash: [4,4] },
              ticks: { color: '#94a3b8', font: { size: 12 } }
            }
          },
          layout: { padding: { top: 6, bottom: 6, left: 6, right: 6 } }
        }
      });
      console.log('[INIT] ✓ Live noise chart created');
    } else {
      console.warn('[INIT] noiseChart element not found');
      noiseChart = null;
    }
  } catch (e) {
    console.error('[INIT] Error creating noise chart:', e.message);
    noiseChart = null;
  }

  // Create meter gauge objects
  const meterGauges = {};
  
  function updateMeterGauge(canvasId, value, label) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    drawMeterGauge(canvas, value, 120, label);
  }

  try {
    const avgCanvas = document.getElementById('avgGauge');
    const peakCanvas = document.getElementById('peakGauge');
    
    if (avgCanvas) {
      meterGauges.avg = avgCanvas;
      console.log('[INIT] Drawing initial average gauge');
      drawMeterGauge(avgCanvas, 0, 120);
    } else {
      console.warn('[INIT] avgGauge canvas not found');
    }
    
    if (peakCanvas) {
      meterGauges.peak = peakCanvas;
      console.log('[INIT] Drawing initial peak gauge');
      drawMeterGauge(peakCanvas, 0, 120);
    } else {
      console.warn('[INIT] peakGauge canvas not found');
    }
    
    // Store references for updates using the global drawMeterGauge function
    avgGaugeChart = { 
      update: (data) => {
        const canvas = document.getElementById('avgGauge');
        const value = data?.datasets?.[0]?.data?.[0] || 0;
        console.log('[GAUGE] Updating avg gauge to', value);
        if (canvas) drawMeterGauge(canvas, value, 120);
      }
    };
    peakGaugeChart = { 
      update: (data) => {
        const canvas = document.getElementById('peakGauge');
        const value = data?.datasets?.[0]?.data?.[0] || 0;
        console.log('[GAUGE] Updating peak gauge to', value);
        if (canvas) drawMeterGauge(canvas, value, 120);
      }
    };
    
    console.log('[INIT] ✓ Meter-style gauge canvases created and initialized');
  } catch (e) { 
    console.error('[INIT] Error creating gauges:', e.message);
  }

  // Daily chart (line + high-noise bars)
  try {
    const dailyCtx = document.getElementById('dailyChart')?.getContext('2d');
    if (dailyCtx) {
      console.log('[INIT] Creating daily chart with context');
      dailyChart = new Chart(dailyCtx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            { type: 'line', label: 'Average', data: [], borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,0.08)', tension: 0.3, fill: true },
            { type: 'line', label: 'Peak', data: [], borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.06)', tension: 0.3, fill: false },
            { type: 'bar', label: 'High Noise Level', data: [], backgroundColor: 'rgba(239,68,68,0.18)', borderColor: '#ef4444', borderWidth: 1, borderSkipped: false }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: { x: { ticks: { color: '#94a3b8' } }, y: { min: 0, max: 120, ticks: { color: '#94a3b8' } } },
          plugins: { legend: { display: false, position: 'top', labels: { color: '#f1f5f9' } } }
        }
      });
      console.log('[INIT] ✓ Daily chart created');
    } else {
      console.warn('[INIT] dailyChart element not found');
    }
  } catch (e) {
    console.error('[INIT] Error creating daily chart:', e.message);
  }

  // Monthly chart
  try {
    const monthlyCtx = document.getElementById('monthlyChart')?.getContext('2d');
    if (monthlyCtx) {
      console.log('[INIT] Creating monthly chart');
      monthlyChart = new Chart(monthlyCtx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            { label: 'Avg (day)', data: [], borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,0.08)', tension: 0.3, fill: true },
            { label: 'Peak (day)', data: [], borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.06)', tension: 0.3, fill: false }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            y: { min: 0, max: 120, ticks: { color: '#94a3b8' } },
            x: { ticks: { color: '#94a3b8' } }
          },
          plugins: { legend: { display: false, labels: { color: '#f1f5f9' } } }
        }
      });
      console.log('[INIT] ✓ Monthly chart created');
    } else {
      console.warn('[INIT] monthlyChart element not found');
    }
  } catch (e) {
    console.error('[INIT] Error creating monthly chart:', e.message);
  }

  // Clear alerts button
  document.getElementById('clear-alerts')?.addEventListener('click', () => { alertsList.innerHTML = ''; });

  // Tabs
  const dashboardViewEl = document.getElementById('dashboard-view');
  const historyViewEl = document.getElementById('history-view');
  document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', (ev) => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    if (dashboardViewEl) dashboardViewEl.style.display = (tab === 'dashboard') ? '' : 'none';
    if (historyViewEl) historyViewEl.style.display = (tab === 'history') ? '' : 'none';
  }));

  // Sidebar nav interactions (click to show one section at a time)
  document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => {
    const label = item.textContent && item.textContent.trim();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');

    const devicesSection = document.getElementById('devices-section');
    const sidebarAlerts = document.getElementById('sidebar-alerts');
    const sidebarReports = document.getElementById('sidebar-reports');
    const sidebarAnalysis = document.getElementById('sidebar-analysis');
    const sidebarSettings = document.getElementById('sidebar-settings');
    const chartTop = document.querySelector('.chart-top');
    const dashboardTopSection = document.querySelector('.dashboard-top-section');
    const chartWrap = document.querySelector('.chart-wrap');
    const reportsView = document.getElementById('reports-view');
    const analysisView = document.getElementById('analysis-view');
    const settingsView = document.getElementById('settings-view');

    if (label === 'Alerts') {
      // Clear analysis update interval
      if (analysisUpdateInterval) {
        clearInterval(analysisUpdateInterval);
        analysisUpdateInterval = null;
      }
      if (devicesSection) devicesSection.classList.add('hidden');
      if (sidebarAlerts) sidebarAlerts.classList.remove('hidden');
      if (sidebarReports) sidebarReports.classList.add('hidden');
      if (sidebarAnalysis) sidebarAnalysis.classList.add('hidden');
      if (sidebarSettings) sidebarSettings.classList.add('hidden');
      if (chartTop) chartTop.classList.remove('hidden');
      if (dashboardTopSection) dashboardTopSection.classList.remove('hidden');
      if (chartWrap) chartWrap.classList.remove('hidden');
      if (reportsView) reportsView.classList.add('hidden');
      if (analysisView) analysisView.classList.add('hidden');
      if (settingsView) settingsView.classList.add('hidden');
      if (sidebarAlerts) sidebarAlerts.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (label === 'Devices') {
      // Clear analysis update interval
      if (analysisUpdateInterval) {
        clearInterval(analysisUpdateInterval);
        analysisUpdateInterval = null;
      }
      if (sidebarAlerts) sidebarAlerts.classList.add('hidden');
      if (sidebarReports) sidebarReports.classList.add('hidden');
      if (sidebarAnalysis) sidebarAnalysis.classList.add('hidden');
      if (sidebarSettings) sidebarSettings.classList.add('hidden');
      if (devicesSection) devicesSection.classList.remove('hidden');
      if (chartTop) chartTop.classList.remove('hidden');
      if (dashboardTopSection) dashboardTopSection.classList.remove('hidden');
      if (chartWrap) chartWrap.classList.remove('hidden');
      if (reportsView) reportsView.classList.add('hidden');
      if (analysisView) analysisView.classList.add('hidden');
      if (settingsView) settingsView.classList.add('hidden');
      if (devicesSection) devicesSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (label === 'Analysis') {
      if (devicesSection) devicesSection.classList.add('hidden');
      if (sidebarAlerts) sidebarAlerts.classList.add('hidden');
      if (sidebarReports) sidebarReports.classList.add('hidden');
      if (sidebarAnalysis) sidebarAnalysis.classList.remove('hidden');
      if (sidebarSettings) sidebarSettings.classList.add('hidden');
      if (chartTop) chartTop.classList.add('hidden');
      if (dashboardTopSection) dashboardTopSection.classList.add('hidden');
      if (chartWrap) chartWrap.classList.add('hidden');
      if (reportsView) reportsView.classList.add('hidden');
      if (analysisView) analysisView.classList.remove('hidden');
      if (settingsView) settingsView.classList.add('hidden');
      if (analysisView) analysisView.scrollIntoView({ behavior: 'smooth', block: 'start' });
      performDataAnalysis(); // Run analysis immediately
      // Start continuous updates for analysis
      if (analysisUpdateInterval) clearInterval(analysisUpdateInterval);
      analysisUpdateInterval = setInterval(() => performDataAnalysis(), 5000);
    } else if (label === 'Reports') {
      // Clear analysis update interval
      if (analysisUpdateInterval) {
        clearInterval(analysisUpdateInterval);
        analysisUpdateInterval = null;
      }
      if (devicesSection) devicesSection.classList.add('hidden');
      if (sidebarAlerts) sidebarAlerts.classList.add('hidden');
      if (sidebarReports) sidebarReports.classList.remove('hidden');
      if (sidebarAnalysis) sidebarAnalysis.classList.add('hidden');
      if (sidebarSettings) sidebarSettings.classList.add('hidden');
      if (chartTop) chartTop.classList.add('hidden');
      if (dashboardTopSection) dashboardTopSection.classList.add('hidden');
      if (chartWrap) chartWrap.classList.add('hidden');
      if (reportsView) reportsView.classList.remove('hidden');
      if (analysisView) analysisView.classList.add('hidden');
      if (settingsView) settingsView.classList.add('hidden');
      if (reportsView) reportsView.scrollIntoView({ behavior: 'smooth', block: 'start' });
      loadReports();
    } else if (label === 'Settings') {
      // Clear analysis update interval
      if (analysisUpdateInterval) {
        clearInterval(analysisUpdateInterval);
        analysisUpdateInterval = null;
      }
      if (devicesSection) devicesSection.classList.add('hidden');
      if (sidebarAlerts) sidebarAlerts.classList.add('hidden');
      if (sidebarReports) sidebarReports.classList.add('hidden');
      if (sidebarAnalysis) sidebarAnalysis.classList.add('hidden');
      if (sidebarSettings) sidebarSettings.classList.remove('hidden');
      if (chartTop) chartTop.classList.add('hidden');
      if (dashboardTopSection) dashboardTopSection.classList.add('hidden');
      if (chartWrap) chartWrap.classList.add('hidden');
      if (reportsView) reportsView.classList.add('hidden');
      if (analysisView) analysisView.classList.add('hidden');
      if (settingsView) settingsView.classList.remove('hidden');
      if (settingsView) settingsView.scrollIntoView({ behavior: 'smooth', block: 'start' });
      loadSettings();
    }
  }));



  // Periodically check offline devices (every 10 seconds)
  setInterval(() => {
    const now = Date.now();
    for (const id in state.devices) {
      if (state.devices[id].lastSeen && (now - state.devices[id].lastSeen > 45000)) markOffline(id);
    }
    trimChart();
  }, 10000);
}

// Attach API listeners
function attachDataListeners() {
  if (!window.api) {
    console.error('window.api not available!');
    return;
  }
  console.log('[LISTENERS] Attaching data listeners...');
  window.api.onDeviceData?.((data) => {
    console.log('[RX] device-data:', data.deviceId, data.noiseLevel + 'dB');
    handleDeviceData(data);
  });
  window.api.onAlert?.((alert) => {
    console.log('[RX] alert:', alert.type);
    handleAlert(alert);
  });
  window.api.onDeviceOffline?.((data) => {
    console.log('[RX] device-offline:', data.deviceId);
    handleDeviceOffline(data);
  });
  window.api.onServerInfo?.((d) => {
    console.log('[RX] server-info:', d);
    if (d && typeof d.port !== 'undefined') wsUrlEl.textContent = `ws://localhost:${d.port}`;
    if (d && typeof d.NOISE_THRESHOLD !== 'undefined' && thresholdEl) thresholdEl.textContent = String(d.NOISE_THRESHOLD);
  });
  // query initial server/device config (including noise threshold)
  if (window.api.queryDevices) {
    console.log('[API] Querying devices...');
    window.api.queryDevices().then((res) => {
      console.debug('[RESPONSE] queryDevices returned:', res);
      const el = document.getElementById('threshold') || thresholdEl;
      if (res && typeof res.NOISE_THRESHOLD !== 'undefined') {
        if (el) el.textContent = String(res.NOISE_THRESHOLD);
      }

      // Populate any already-connected devices so the UI shows samples that arrived
      // before the user logged in or before the window finished loading.
      if (res && res.devices) {
        const deviceCount = Object.keys(res.devices).length;
        console.log(`[REPLAY] Replaying history from ${deviceCount} devices`);
        Object.entries(res.devices).forEach(([id, dev]) => {
          // Replay recent history (ascending) so chart is populated with time series
          if (Array.isArray(dev.history) && dev.history.length > 0) {
            console.log(`[REPLAY] Device ${id}: ${dev.history.length} history entries`);
            const hist = dev.history.slice().sort((a,b) => a.timestamp - b.timestamp);
            const now = Date.now();
            // For very old history, spread the entries across the last minute for demo purposes
            const oldestTs = hist[0].timestamp;
            const span = now - (60 * 1000); // Last minute
            hist.forEach((h, idx) => {
              // If history is too old, spread it out over recent time
              const isOld = (now - h.timestamp) > (30 * 1000);
              const ts = isOld ? span + ((idx / hist.length) * 60 * 1000) : h.timestamp;
              handleDeviceData({ deviceId: id, tableId: dev.tableId || 'unknown', noiseLevel: h.noiseLevel, soundType: h.soundType || '', timestamp: ts });
            });
          } else {
            // fallback to last-known snapshot
            const d = {
              deviceId: id,
              tableId: dev.tableId || 'unknown',
              noiseLevel: dev.lastNoise || 0,
              soundType: dev.lastSoundType || '',
              timestamp: Date.now()
            };
            console.log(`[REPLAY] Device ${id}: last-seen snapshot`);
            handleDeviceData(d);
          }
        });
      }
      
      // Mark UI as ready and flush any buffered data
      state.uiReady = true;
      console.log(`[UI-READY] Flushing ${dataBuffer.length} buffered data points...`);
      const buffered = dataBuffer.splice(0); // Get and clear buffer
      buffered.forEach(d => handleDeviceData(d));
      console.log('[UI-READY] All buffered data processed');
      
      // Initialize Reports functionality
      setupReportsEventListeners();
      
      // Force an immediate chart update after all data is loaded
      console.log('[UI-READY] Forcing chart update...');
      updateHistoryCharts();
      console.log('[UI-READY] Chart update complete');
    }).catch((e) => { console.debug('queryDevices failed', e && e.message); });
  }
}

// network status updater (register on DOMContentLoaded so it shows on login screen)
function updateNetworkStatus(st) {
  const text = st && st.online ? 'Online' : 'Offline';
  const elMain = document.getElementById('net-status');
  if (elMain) {
    elMain.textContent = text;
    elMain.classList.remove('online','offline');
    elMain.classList.add(st && st.online ? 'online' : 'offline');
  }
}

// Handle device data
function handleDeviceData(data) {
  // Buffer data if charts aren't initialized yet
  if (!state.uiReady) {
    dataBuffer.push(data);
    console.log(`[BUFFER] Data buffered (${dataBuffer.length} pending), UI not ready yet`);
    return;
  }
  
  const { deviceId, tableId, noiseLevel, soundType, timestamp } = data;
  const ts = timestamp || Date.now();
  const timeLabel = new Date(ts).toLocaleTimeString();

  // Update state - preserve user's selected tableId if already set
  state.devices[deviceId] = state.devices[deviceId] || { 
    deviceId, tableId, lastSeen: 0, lastNoise: 0, soundType: '',
    readings: [],      // Track all readings for average/peak
    triggeredSounds: [], // Track triggered (non-background) sounds
    deviceHistory: []  // Per-device history for charts (avg, peak, timestamp)
  };
  const dev = state.devices[deviceId];
  dev.lastSeen = ts;
  dev.lastNoise = noiseLevel;
  dev.soundType = soundType;
  
  // Only update tableId from device if user hasn't manually selected one
  // If the user-selected tableId is empty or default, accept the device's tableId
  if (!dev.userSelectedSection && (tableId && tableId !== 'Table-A')) {
    dev.tableId = tableId;
  }

  // Collect readings for statistics
  if (!dev.readings) dev.readings = [];
  dev.readings.push(noiseLevel);
  
  // Check if sound is triggered (not background)
  const isTriggeredSound = soundType && soundType !== 'background' && soundType !== '';
  
  if (isTriggeredSound) {
    // Check settings before logging triggered sounds
    if (shouldLogNoise(soundType, noiseLevel)) {
      // IMMEDIATELY save triggered sounds to database
      if (!dev.triggeredSounds) dev.triggeredSounds = [];
      dev.triggeredSounds.push(soundType);
      
      // Calculate current statistics
      const average = dev.readings.length > 0 
        ? dev.readings.reduce((a, b) => a + b, 0) / dev.readings.length 
        : noiseLevel;
      const peak = dev.readings.length > 0 
        ? Math.max(...dev.readings) 
        : noiseLevel;
      
      console.log(`[TRIGGER] ${soundType.toUpperCase()} detected! Saving to database immediately...`);
      
      // Save immediately when triggered
      saveNoiseReportToDb(deviceId, getFriendlyDeviceName(deviceId), average, peak, soundType);
      
      // Add to both global and per-device history
      const historyEntry = { timestamp: ts, avg: average, peak: peak };
      state.history.push(historyEntry);
      if (state.history.length > state.historyMax) state.history.splice(0, state.history.length - state.historyMax);
      if (!dev.deviceHistory) dev.deviceHistory = [];
      dev.deviceHistory.push(historyEntry);
      if (dev.deviceHistory.length > state.historyMax) dev.deviceHistory.splice(0, dev.deviceHistory.length - state.historyMax);
      
      // Reset readings after triggered save
      dev.readings = [];
      dev.triggeredSounds = [];
      dev.readingCount = 0;
    } else {
      console.log(`[FILTER] ${soundType} (${noiseLevel}dB) blocked by settings - not logging`);
    }
  } else {
    // Non-triggered (background) - check frequency settings
    const frequency = getLoggingFrequency(soundType || 'background');
    
    if (!dev.readingCount) dev.readingCount = 0;
    dev.readingCount++;
    
    // Check if we should log based on frequency
    let shouldLog = false;
    
    switch (frequency) {
      case 'immediate':
        shouldLog = true;
        break;
      case '5sec':
        shouldLog = (dev.readingCount % Math.ceil(5 / 0.1)) === 0; // Assuming ~10 readings per second
        break;
      case '30sec':
        shouldLog = (dev.readingCount % Math.ceil(30 / 0.1)) === 0;
        break;
      case '5min':
        shouldLog = (dev.readingCount % Math.ceil(300 / 0.1)) === 0;
        break;
      case '10min':
        shouldLog = (dev.readingCount % Math.ceil(600 / 0.1)) === 0;
        break;
      case '30min':
        shouldLog = (dev.readingCount % Math.ceil(1800 / 0.1)) === 0;
        break;
      case '1hour':
        shouldLog = (dev.readingCount % Math.ceil(3600 / 0.1)) === 0;
        break;
      case '4hours':
        shouldLog = (dev.readingCount % Math.ceil(14400 / 0.1)) === 0;
        break;
      default:
        shouldLog = false;
    }
    
    if (shouldLog && shouldLogNoise(soundType || 'background', noiseLevel)) {
      const average = dev.readings.length > 0 
        ? dev.readings.reduce((a, b) => a + b, 0) / dev.readings.length 
        : noiseLevel;
      const peak = dev.readings.length > 0 
        ? Math.max(...dev.readings) 
        : noiseLevel;
      
      // Save background readings
      saveNoiseReportToDb(deviceId, getFriendlyDeviceName(deviceId), average, peak, null);
      
      // Add to both global and per-device history
      const historyEntry = { timestamp: ts, avg: average, peak: peak };
      state.history.push(historyEntry);
      if (state.history.length > state.historyMax) state.history.splice(0, state.history.length - state.historyMax);
      if (!dev.deviceHistory) dev.deviceHistory = [];
      dev.deviceHistory.push(historyEntry);
      if (dev.deviceHistory.length > state.historyMax) dev.deviceHistory.splice(0, dev.deviceHistory.length - state.historyMax);
      
      // Reset accumulators
      dev.readings = [];
      dev.triggeredSounds = [];
      dev.readingCount = 0;
    }
  }

  upsertDeviceCard(deviceId, dev.tableId, noiseLevel, soundType, ts, true);

  // Update chart dataset (only if live chart exists)
  if (noiseChart) {
    let ds = noiseChart.data.datasets.find(d => d.label === deviceId);
    if (!ds) {
      const color = randomColorFor(deviceId);
      // create vertical gradient fill for dataset
      const topRGBA = hexToRgba(color, 0.20);
      const bottomRGBA = hexToRgba(color, 0.02);
      const grad = noiseChart.ctx.createLinearGradient(0, 0, 0, noiseChart.height || 300);
      grad.addColorStop(0, topRGBA);
      grad.addColorStop(1, bottomRGBA);
      ds = {
        label: deviceId,
        borderColor: color,
        backgroundColor: grad,
        data: [],
        tension: 0.35,
        fill: true,
        pointRadius: 2,
        borderWidth: 2,
        pointBackgroundColor: color
      };
      noiseChart.data.datasets.push(ds);
    }

    state.chartLabels.push(timeLabel);
    noiseChart.data.labels = state.chartLabels.slice(-state.maxPoints);

    noiseChart.data.datasets.forEach(d => {
      d.data.push(d.label === deviceId ? noiseLevel : null);
      if (d.data.length > state.maxPoints) d.data.splice(0, d.data.length - state.maxPoints);
    });

    if (noiseChart.data.labels.length > state.maxPoints) noiseChart.data.labels.splice(0, noiseChart.data.labels.length - state.maxPoints);
    noiseChart.update();
    
    // Update live timestamp
    const timestampEl = document.getElementById('live-timestamp');
    if (timestampEl) {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      timestampEl.textContent = `${hours}:${minutes}:${seconds}`;
    }
  }
  // compute and update aggregate metrics (average/peak) and history charts
  try { 
    computeAndUpdateMetrics(ts); 
  } catch (e) { 
    console.error('[ERROR] computeAndUpdateMetrics failed:', e);
  }

  // REAL-TIME ANALYSIS: Update analysis immediately when new data arrives
  try {
    performDataAnalysis();
  } catch (e) {
    console.error('[ERROR] performDataAnalysis failed:', e);
  }
}

// Handle alerts
function handleAlert(alert) {
  if (!state.isLoggedIn) return; // don't show alerts on login screen
  const li = document.createElement('li');
  li.textContent = `[${new Date().toLocaleTimeString()}] ${alert.type} — Device:${alert.deviceId} Section:${alert.tableId} Noise:${alert.noiseLevel} Type:${alert.soundType || ''}`;
  alertsList.prepend(li);
  // no pop-up or flashing; alerts are listed in the sidebar
}

// Device offline
function handleDeviceOffline({ deviceId, tableId }) {
  if (!state.isLoggedIn) return; // avoid notifying on login screen
  markOffline(deviceId);
  const li = document.createElement('li');
  li.textContent = `[${new Date().toLocaleTimeString()}] device_offline — Device:${deviceId} Section:${tableId}`;
  alertsList.prepend(li);
}

// Mark offline visually
function markOffline(deviceId) {
  const el = document.getElementById(`dev-${deviceId}`);
  if (el) {
    el.querySelector('.status').innerHTML = '<span class="status-offline">OFFLINE</span>';
    el.querySelector('.fill').style.width = '0%';
    el.style.opacity = '0.6';
  }
}

// Add/update device card
function upsertDeviceCard(deviceId, tableId, noise, soundType, ts, online = true) {
  let el = document.getElementById(`dev-${deviceId}`);
  if (!el) {
    el = document.createElement('div');
    el.id = `dev-${deviceId}`;
    el.className = 'device';
    el.innerHTML = `
      <div class="device-header">
        <div class="device-left">
          <div class="avatar">🔊</div>
          <div class="device-info">
            <div class="name" id="name-${deviceId}"></div>
            <div class="status" id="status-${deviceId}"></div>
          </div>
        </div>
        <div class="device-timestamp" id="timestamp-${deviceId}"></div>
      </div>
      <div class="device-body">
        <div class="meta" id="meta-${deviceId}"></div>
      </div>
      <div class="device-metrics">
        <div class="meter-container">
          <div class="meter" title="noise meter"><div class="fill" id="fill-${deviceId}"></div></div>
        </div>
        <div class="noise-display">
          <span id="noise-${deviceId}" class="noise"></span>
          <span id="sound-${deviceId}" class="badge"></span>
        </div>
      </div>`;
    devicesList.appendChild(el);
    
    // Initialize state for new device
    if (!state.devices[deviceId]) {
      state.devices[deviceId] = { tableId: tableId };
    }
    
    // Initialize section dropdown only once when card is created
    initializeDeviceSection(deviceId, tableId || '');
  }

  document.getElementById(`name-${deviceId}`).textContent = getFriendlyDeviceName(deviceId);
  
  // Update state with current tableId if provided
  if (tableId && state.devices[deviceId]) {
    state.devices[deviceId].tableId = tableId;
  }
  
  // Only update the timestamp, don't recreate the dropdown
  const timestampEl = document.getElementById(`timestamp-${deviceId}`);
  if (timestampEl) {
    timestampEl.textContent = new Date(ts).toLocaleTimeString();
  }
  
  document.getElementById(`noise-${deviceId}`).textContent = `${noise} dB`;
  document.getElementById(`sound-${deviceId}`).textContent = soundEmoji(soundType) + ' ' + (soundType || '');
  document.getElementById(`status-${deviceId}`).innerHTML = online ? '<span class="status-online">ONLINE</span>' : '<span class="status-offline">OFFLINE</span>';

  const fill = document.getElementById(`fill-${deviceId}`);
  const pct = Math.max(0, Math.min(100, Math.round((Number(noise)/120)*100)));
  fill.style.width = pct + '%';

  // Neon color for high noise
  const threshold = Number(thresholdEl.textContent) || 65;
  fill.style.background = Number(noise) >= threshold ? 'linear-gradient(90deg,#f97316,#ef4444)' : 'linear-gradient(90deg,#06b6d4,#3b82f6)';
  fill.style.transition = 'width 0.4s ease, background 0.3s ease';
  el.style.opacity = '1';
  
  // Add device tab when card is created/updated
  addOrUpdateDeviceTab(deviceId);
}

// Update device section selection
function updateDeviceSection(deviceId, sectionName) {
  if (state.devices[deviceId]) {
    state.devices[deviceId].tableId = sectionName;
    state.devices[deviceId].userSelectedSection = true;  // Mark that user selected a section
    console.log(`[DEVICE] Updated device ${deviceId} section to: ${sectionName}`);
    
    // Send update to main process
    if (window.api && window.api.updateDeviceSection) {
      window.api.updateDeviceSection(deviceId, sectionName)
        .then(() => console.log(`[API] Section update sent to main process`))
        .catch(err => console.error(`[API] Failed to update section:`, err));
    }
  }
}

// Initialize device section dropdown (called only once when card is created)
function initializeDeviceSection(deviceId, tableId) {
  const metaEl = document.getElementById(`meta-${deviceId}`);
  if (!metaEl) return;
  
  const sectionOptions = [
    'Children\'s Section',
    'Teen\'s Section',
    'Reference Section',
    'GAD Section',
    'Senior Citizen\'s Section',
    'IT Section',
    'Special Section'
  ];
  
  let metaHtml = `<div style="display: flex; flex-direction: column; gap: 6px; width: 100%;"><label style="font-size: 11px; color: #94a3b8; font-weight: 500;">Section:</label> <select id="section-${deviceId}" class="device-section-select" onchange="updateDeviceSection('${deviceId}', this.value)">
    <option value="" ${!tableId ? 'selected' : ''}>Select Section</option>`;
  
  sectionOptions.forEach(opt => {
    const selected = tableId === opt ? 'selected' : '';
    metaHtml += `<option value="${opt}" ${selected}>${opt}</option>`;
  });
  
  metaHtml += `</select></div>`;
  metaEl.innerHTML = metaHtml;
}

// Add or update device tab in the tabs container
function addOrUpdateDeviceTab(deviceId) {
  const deviceTabsContainer = document.getElementById('device-tabs');
  if (!deviceTabsContainer) return;
  
  // Check if tab already exists
  let tabBtn = document.querySelector(`[data-device-tab="${deviceId}"]`);
  if (!tabBtn) {
    // Create new tab button
    tabBtn = document.createElement('button');
    tabBtn.className = 'tab';
    tabBtn.dataset.deviceTab = deviceId;
    tabBtn.textContent = getFriendlyDeviceName(deviceId);
    tabBtn.addEventListener('click', () => selectDeviceTab(deviceId));
    deviceTabsContainer.appendChild(tabBtn);
    
    // Auto-select first device
    if (!state.selectedDevice) {
      selectDeviceTab(deviceId);
    }
  }
}

// Select a device tab and filter dashboard data
function selectDeviceTab(deviceId) {
  state.selectedDevice = deviceId;
  
  // Update tab styling
  const tabs = document.querySelectorAll('[data-device-tab]');
  tabs.forEach(tab => tab.classList.remove('active'));
  const selectedTab = document.querySelector(`[data-device-tab="${deviceId}"]`);
  if (selectedTab) {
    selectedTab.classList.add('active');
  }
  
  // Update dashboard title
  const titleEl = document.getElementById('dashboard-title');
  if (titleEl) {
    titleEl.textContent = `Noise Dashboard`;
  }
  
  // Update charts to show only this device's data
  updateChartsForDevice(deviceId);
}

// Filter and update charts to show data for a specific device
function updateChartsForDevice(deviceId) {
  if (!noiseChart) return;
  
  const dev = state.devices[deviceId];
  if (!dev) return;
  
  // Update live chart - show only selected device
  noiseChart.data.datasets.forEach(ds => {
    ds.hidden = ds.label !== deviceId;
  });
  noiseChart.update();
  
  // Update gauges for this device
  if (avgGaugeChart) {
    drawMeterGauge(document.getElementById('avgGauge'), dev.lastNoise || 0, 120);
  }
  if (peakGaugeChart) {
    drawMeterGauge(document.getElementById('peakGauge'), dev.lastNoise || 0, 120);
  }
  
  // Update history charts for this device
  updateHistoryChartsForDevice(deviceId);
}

// Sound type emoji
function soundEmoji(type) {
  const m = {
    human_voice: '🗣️',    // Talking, whispering, coughing
    non_speech_sound: '💥',   // Book drop, chair drag, door slam
    mechanical: '⚙️',     // Keyboard, aircon, fan, printer
    movement: '🚶',       // Footsteps, shuffling
    background: '🔇',     // Ambient background
    silence: '🤐',        // Very quiet
    // Legacy support
    speech: '🗣️',
    music: '🎵',
    vehicle: '🚗',
    typing: '⌨️'
  };
  return type ? m[type] || '🔊' : '';
}

// Trim chart data
function trimChart() {
  if (noiseChart.data.labels.length > state.maxPoints) noiseChart.data.labels.splice(0, noiseChart.data.labels.length - state.maxPoints);
  noiseChart.data.datasets.forEach(d => { if (d.data.length > state.maxPoints) d.data.splice(0, d.data.length - state.maxPoints); });
}

// Compute average & peak across devices, update gauges and history charts
function computeAndUpdateMetrics(ts) {
  // If a device is selected, only update for that device
  if (state.selectedDevice) {
    const dev = state.devices[state.selectedDevice];
    if (!dev) return;
    
    const avg = Number(dev.lastNoise || 0);
    const peak = Number(dev.lastNoise || 0);
    
    console.log('[METRICS] Selected device:', state.selectedDevice, 'Avg:', avg, 'Peak:', peak);
    
    const lastEl = document.getElementById('last-update'); if (lastEl) lastEl.textContent = new Date(ts).toLocaleTimeString();
    const avgEl = document.getElementById('avgValue'); if (avgEl) avgEl.textContent = avg;
    const peakEl = document.getElementById('peakValue'); if (peakEl) peakEl.textContent = peak;
    
    // Update gauges directly with drawMeterGauge
    const avgCanvas = document.getElementById('avgGauge');
    const peakCanvas = document.getElementById('peakGauge');
    if (avgCanvas) {
      console.log('[METRICS] Drawing avg gauge with value:', avg);
      drawMeterGauge(avgCanvas, avg, 120);
    }
    if (peakCanvas) {
      console.log('[METRICS] Drawing peak gauge with value:', peak);
      drawMeterGauge(peakCanvas, peak, 120);
    }
    
    // Update charts for selected device
    console.log('[METRICS] Calling updateHistoryChartsForDevice for:', state.selectedDevice);
    updateHistoryChartsForDevice(state.selectedDevice);
  } else {
    // No device selected, show aggregate metrics
    const devicesArr = Object.values(state.devices || {});
    if (!devicesArr.length) {
      console.debug('[METRICS] No devices yet');
      return;
    }
    const vals = devicesArr.map(d => Number(d.lastNoise || 0));
    const avg = Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
    const peak = Math.max(...vals);

    console.log('[METRICS] Aggregate Avg:', avg, 'Peak:', peak, 'Devices:', devicesArr.length, 'Values:', vals);

    const lastEl = document.getElementById('last-update'); if (lastEl) lastEl.textContent = new Date(ts).toLocaleTimeString();
    const avgEl = document.getElementById('avgValue'); if (avgEl) avgEl.textContent = avg;
    const peakEl = document.getElementById('peakValue'); if (peakEl) peakEl.textContent = peak;

    // Update gauges directly with drawMeterGauge
    const avgCanvas = document.getElementById('avgGauge');
    const peakCanvas = document.getElementById('peakGauge');
    if (avgCanvas) {
      console.log('[METRICS] Drawing avg gauge with value:', avg);
      drawMeterGauge(avgCanvas, avg, 120);
    }
    if (peakCanvas) {
      console.log('[METRICS] Drawing peak gauge with value:', peak);
      drawMeterGauge(peakCanvas, peak, 120);
    }
    
    // Push to history with timestamp for aggregate
    const vals2 = devicesArr.map(d => Number(d.lastNoise || 0));
    const avg2 = Math.round(vals2.reduce((a,b)=>a+b,0)/vals2.length);
    const peak2 = Math.max(...vals2);
    const historyEntry = { timestamp: ts, avg: avg2, peak: peak2 };
    state.history.push(historyEntry);
    console.log('[HISTORY] Pushing aggregate entry:', historyEntry, 'Total history now:', state.history.length);
    if (state.history.length > state.historyMax) state.history.splice(0, state.history.length - state.historyMax);
    
    // Update charts for aggregate
    console.log('[METRICS] Calling updateHistoryCharts now. UIReady:', state.uiReady);
    updateHistoryCharts();
  }
}

function updateHistoryCharts() {
  console.log('[CHARTS] updateHistoryCharts called. dailyChart exists:', !!dailyChart, 'monthlyChart exists:', !!monthlyChart);
  
  if (!dailyChart && !monthlyChart) {
    console.warn('[CHARTS] Charts not initialized yet!');
    return;
  }
  
  console.log('[CHARTS] Total state.history entries:', state.history.length);
  if (state.history.length > 0) {
    console.log('[CHARTS] First history entry:', state.history[0]);
    console.log('[CHARTS] Last history entry:', state.history[state.history.length - 1]);
  }
  
  const now = Date.now();
  const dayWindow = 24 * 60 * 60 * 1000;
  const cutoff = now - dayWindow;
  
  console.log('[CHARTS] Now:', now, 'Cutoff (now - 24h):', cutoff, 'Now as date:', new Date(now).toLocaleString());
  
  const recent = state.history.filter(h => {
    const isRecent = h.timestamp >= cutoff;
    if (!isRecent && state.history.length < 10) {
      console.log('[CHARTS] Filtering entry - timestamp:', h.timestamp, '(', new Date(h.timestamp).toLocaleString(), ') >= cutoff:', cutoff, '(', new Date(cutoff).toLocaleString(), ') =', isRecent);
    }
    return isRecent;
  });

  console.log('[CHARTS] After filtering: recent.length =', recent.length, '(should be close to history.length if timestamps are recent)');

  if (recent.length === 0) {
    console.warn('[CHARTS] NO DATA in last 24h! Showing placeholder. Total history:', state.history.length, 'Connected devices:', Object.keys(state.devices).length);
    // Show a placeholder message in the charts
    if (dailyChart) {
      dailyChart.data.labels = ['Waiting for data...'];
      dailyChart.data.datasets[0].data = [40];
      dailyChart.data.datasets[1].data = [50];
      dailyChart.data.datasets[2].data = [];
      dailyChart.update('none');
    }
    if (monthlyChart) {
      monthlyChart.data.labels = ['No data'];
      monthlyChart.data.datasets[0].data = [40];
      monthlyChart.data.datasets[1].data = [50];
      monthlyChart.update('none');
    }
    return;
  }

  const labels = recent.map(h => new Date(h.timestamp).toLocaleTimeString());
  const avgData = recent.map(h => h.avg);
  const peakData = recent.map(h => h.peak);
  const threshold = Number(thresholdEl?.textContent) || 65;
  const highBars = recent.map(h => (h.peak >= threshold ? h.peak : null));

  console.log('[CHARTS] Daily chart: ' + recent.length + ' points. Threshold:', threshold);
  console.log('[CHARTS] Avg values:', avgData);
  console.log('[CHARTS] Peak values:', peakData);

  if (dailyChart) {
    const visibleLabels = labels.slice(-state.maxPoints);
    const visibleAvg = avgData.slice(-state.maxPoints);
    const visiblePeak = peakData.slice(-state.maxPoints);
    const visibleBars = highBars.slice(-state.maxPoints);
    
    console.log('[CHARTS] Setting dailyChart with ' + visibleLabels.length + ' labels');
    dailyChart.data.labels = visibleLabels;
    dailyChart.data.datasets[0].data = visibleAvg;
    dailyChart.data.datasets[1].data = visiblePeak;
    dailyChart.data.datasets[2].data = visibleBars;
    dailyChart.update('none'); // Use 'none' for instant update without animation
    console.log('[CHARTS] Daily chart updated successfully');
  }

  // monthly aggregation (per-day) - using ALL history, not just last 24h
  const daysMap = {};
  state.history.forEach(h => {
    const d = new Date(h.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    daysMap[key] = daysMap[key] || { sumAvg:0, count:0, maxPeak:0 };
    daysMap[key].sumAvg += h.avg;
    daysMap[key].count += 1;
    daysMap[key].maxPeak = Math.max(daysMap[key].maxPeak, h.peak);
  });
  const dayKeys = Object.keys(daysMap).sort();
  const monthLabels = dayKeys;
  const monthAvg = dayKeys.map(k => Math.round(daysMap[k].sumAvg / daysMap[k].count));
  const monthPeak = dayKeys.map(k => daysMap[k].maxPeak);

  console.log('[CHARTS] Monthly chart: ' + dayKeys.length + ' days. Days:', dayKeys);

  if (monthlyChart) {
    console.log('[CHARTS] Setting monthlyChart with', dayKeys.length, 'days');
    monthlyChart.data.labels = monthLabels;
    monthlyChart.data.datasets[0].data = monthAvg;
    monthlyChart.data.datasets[1].data = monthPeak;
    monthlyChart.update('none');
    console.log('[CHARTS] Monthly chart updated successfully with', monthLabels.length, 'labels');
  }
}

// Update history charts specifically for a device
function updateHistoryChartsForDevice(deviceId) {
  console.log('[CHARTS] updateHistoryChartsForDevice called for:', deviceId);
  
  if (!dailyChart && !monthlyChart) {
    console.warn('[CHARTS] Charts not initialized yet!');
    return;
  }
  
  const dev = state.devices[deviceId];
  if (!dev) return;
  
  // Get device history or use global history if device history not available
  const history = (dev.deviceHistory && dev.deviceHistory.length > 0) ? dev.deviceHistory : state.history;
  
  if (!history || history.length === 0) {
    console.warn('[CHARTS] No history data for device:', deviceId);
    if (dailyChart) {
      dailyChart.data.labels = ['No data'];
      dailyChart.data.datasets[0].data = [0];
      dailyChart.data.datasets[1].data = [0];
      dailyChart.data.datasets[2].data = [];
      dailyChart.update('none');
    }
    if (monthlyChart) {
      monthlyChart.data.labels = ['No data'];
      monthlyChart.data.datasets[0].data = [0];
      monthlyChart.data.datasets[1].data = [0];
      monthlyChart.update('none');
    }
    return;
  }
  
  // Daily chart - last 24 hours
  const now = Date.now();
  const dayWindow = 24 * 60 * 60 * 1000;
  const cutoff = now - dayWindow;
  
  const recent = history.filter(h => h.timestamp >= cutoff);
  const threshold = Number(thresholdEl?.textContent) || 65;
  
  if (recent.length === 0) {
    console.warn('[CHARTS] No data in last 24h for device:', deviceId);
    if (dailyChart) {
      dailyChart.data.labels = ['No recent data'];
      dailyChart.data.datasets[0].data = [0];
      dailyChart.data.datasets[1].data = [0];
      dailyChart.data.datasets[2].data = [];
      dailyChart.update('none');
    }
  } else {
    const labels = recent.map(h => new Date(h.timestamp).toLocaleTimeString());
    const avgData = recent.map(h => h.avg);
    const peakData = recent.map(h => h.peak);
    const highBars = recent.map(h => (h.peak >= threshold ? h.peak : null));
    
    if (dailyChart) {
      const visibleLabels = labels.slice(-state.maxPoints);
      const visibleAvg = avgData.slice(-state.maxPoints);
      const visiblePeak = peakData.slice(-state.maxPoints);
      const visibleBars = highBars.slice(-state.maxPoints);
      
      dailyChart.data.labels = visibleLabels;
      dailyChart.data.datasets[0].data = visibleAvg;
      dailyChart.data.datasets[1].data = visiblePeak;
      dailyChart.data.datasets[2].data = visibleBars;
      dailyChart.update('none');
      console.log('[CHARTS] Daily chart updated for device:', deviceId, 'with', visibleLabels.length, 'points');
    }
  }
  
  // Monthly chart - aggregated by day
  const daysMap = {};
  history.forEach(h => {
    const d = new Date(h.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    daysMap[key] = daysMap[key] || { sumAvg: 0, count: 0, maxPeak: 0 };
    daysMap[key].sumAvg += h.avg;
    daysMap[key].count += 1;
    daysMap[key].maxPeak = Math.max(daysMap[key].maxPeak, h.peak);
  });
  
  const dayKeys = Object.keys(daysMap).sort();
  const monthLabels = dayKeys;
  const monthAvg = dayKeys.map(k => Math.round(daysMap[k].sumAvg / daysMap[k].count));
  const monthPeak = dayKeys.map(k => daysMap[k].maxPeak);
  
  if (monthlyChart) {
    monthlyChart.data.labels = monthLabels;
    monthlyChart.data.datasets[0].data = monthAvg;
    monthlyChart.data.datasets[1].data = monthPeak;
    monthlyChart.update('none');
    console.log('[CHARTS] Monthly chart updated for device:', deviceId, 'with', monthLabels.length, 'days');
  }
}


// Random color for chart line
function randomColorFor(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return `#${'00000'.substring(0, 6 - c.length)}${c}`.substring(0, 7);
}

function hexToRgba(hex, alpha = 1) {
  if (!hex) return `rgba(255,255,255,${alpha})`;
  const h = hex.replace('#','');
  const bigint = parseInt(h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Alert Notification System
function showAlert(title, message, options = {}) {
  const {
    onOk = () => closeAlert(),
    onDismiss = () => closeAlert(),
    autoClose = false,
    autoCloseDelay = 5000
  } = options;

  const overlay = document.getElementById('alert-overlay');
  const modal = document.getElementById('alert-modal');
  const titleEl = document.getElementById('alert-title');
  const messageEl = document.getElementById('alert-message');
  const okBtn = document.getElementById('alert-ok-btn');
  const dismissBtn = document.getElementById('alert-dismiss-btn');
  const closeBtn = document.getElementById('alert-close-btn');

  // Set content
  titleEl.textContent = title;
  messageEl.textContent = message;

  // Setup button handlers
  okBtn.onclick = onOk;
  dismissBtn.onclick = onDismiss;
  closeBtn.onclick = () => closeAlert();

  // Show modal
  overlay.style.display = 'flex';
  modal.style.display = 'block';

  // Auto-close if enabled
  if (autoClose) {
    setTimeout(() => {
      if (modal.style.display !== 'none') {
        closeAlert();
      }
    }, autoCloseDelay);
  }

  return modal;
}

function closeAlert() {
  const overlay = document.getElementById('alert-overlay');
  const modal = document.getElementById('alert-modal');
  overlay.style.display = 'none';
  modal.style.display = 'none';
}

// Test function - demonstrates a high noise level alert (the sample from requirements)
function showNoiseAlert() {
  showAlert(
    '⚠️ High Noise Level Detected',
    'High Noise level detected in this area.\n\nKindly lower your voice to respect others',
    {
      onOk: () => {
        console.log('User acknowledged noise alert');
        closeAlert();
      },
      onDismiss: () => {
        console.log('User dismissed noise alert');
        closeAlert();
      }
    }
  );
}

// Check login session and register network listener early (so it shows on login screen)
window.addEventListener('DOMContentLoaded', () => {
  console.log('[DOMContentLoaded] Page loaded, initializing');
  
  // Check if user has a previous session
  const wasLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const username = localStorage.getItem('username');
  
  // Only clear session if user explicitly has no previous login
  if (!wasLoggedIn) {
    console.log('[DOMContentLoaded] No previous session, clearing data');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('username');
    state.isLoggedIn = false;
  } else {
    console.log('[DOMContentLoaded] Previous session found for user:', username);
    state.isLoggedIn = true;
  }
  
  if (window.api && window.api.onNetworkStatus) window.api.onNetworkStatus(updateNetworkStatus);
  
  // Listen for startup alert from main process
  if (window.api && window.api.onStartupAlert) {
    window.api.onStartupAlert((data) => {
      const { title, message } = data;
      showAlert(title, message, {
        autoClose: true,
        autoCloseDelay: 4000,
        onOk: () => closeAlert(),
        onDismiss: () => closeAlert()
      });
    });
  }
  
  // If previous session exists, restore it; otherwise show login
  if (wasLoggedIn && username) {
    console.log('[DOMContentLoaded] Restoring previous session');
    try {
      showApp();
    } catch (e) {
      console.error('[DOMContentLoaded] Error restoring session:', e.message);
      showLoginScreen();
    }
  } else {
    console.log('[DOMContentLoaded] Showing login screen');
    showLoginScreen();
  }
  console.log('[DOMContentLoaded] Done');
});

// ==================== WiFi Panel Management ====================

let availableNetworks = [];
let selectedNetwork = null;

// WiFi UI removed - all WiFi configuration removed

// WiFi Functions
async function checkSystemStatus() {
  try {
    const wifiStatus = await window.api.getCurrentWiFi();
    const statusEl = document.getElementById('system-wifi-status');
    
    if (wifiStatus.success && wifiStatus.connected) {
      statusEl.textContent = `✅ Connected to "${wifiStatus.ssid}"`;
      statusEl.className = 'status-value connected';
    } else {
      statusEl.textContent = '⚠️ Not connected';
      statusEl.className = 'status-value disconnected';
    }
  } catch (error) {
    console.error('Error checking WiFi status:', error);
    document.getElementById('system-wifi-status').textContent = '❌ Error';
  }
}

async function checkArduinoStatus() {
  try {
    const arduinoStatus = await window.api.getArduinoStatus();
    const statusEl = document.getElementById('arduino-status');
    
    if (arduinoStatus.connected) {
      statusEl.textContent = `✅ Connected on ${arduinoStatus.port}`;
      statusEl.className = 'status-value connected';
    } else {
      statusEl.textContent = '⏳ Not found (optional)';
      statusEl.className = 'status-value disconnected';
    }
  } catch (error) {
    console.error('Error checking Arduino status:', error);
    document.getElementById('arduino-status').textContent = '⏳ Checking...';
  }
}

async function scanNetworks() {
  const scanBtn = document.getElementById('scan-networks-btn');
  const networksList = document.getElementById('networks-list');
  
  scanBtn.disabled = true;
  const originalContent = scanBtn.innerHTML;
  scanBtn.innerHTML = '<span class="loading-spinner">🔄</span> Scanning...';
  
  try {
    const result = await window.api.scanWiFiNetworks();
    
    if (result.success) {
      availableNetworks = result.networks;
      displayNetworks(availableNetworks);
      showStatus(`Networks found: ${availableNetworks.length}`, 'success');
    } else {
      throw new Error(result.error || 'Failed to scan networks');
    }
  } catch (error) {
    console.error('Error scanning networks:', error);
    showStatus('Failed to scan networks: ' + error.message, 'error');
    networksList.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">❌ Failed to scan networks.</p>';
  } finally {
    scanBtn.disabled = false;
    scanBtn.innerHTML = originalContent;
  }
}

function displayNetworks(networks) {
  const networksList = document.getElementById('networks-list');
  
  if (networks.length === 0) {
    networksList.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No networks found</p>';
    return;
  }

  networksList.innerHTML = networks.map((network, index) => `
    <div class="network-item" data-index="${index}" onclick="selectNetwork(${index})">
      <div class="network-item-left">
        <div class="network-icon">${getNetworkIcon(network.signal)}</div>
        <div class="network-info">
          <div class="network-name">${escapeHtml(network.ssid)}</div>
          <div class="network-details">
            <span class="network-security">🔒 ${network.security}</span>
            <span class="network-signal">
              Signal: <span class="network-signal-bars">${getSignalBars(network.signal)}</span>
              ${network.signal}%
            </span>
          </div>
        </div>
      </div>
      <div style="color: var(--text-secondary);">→</div>
    </div>
  `).join('');
}

function getNetworkIcon(signal) {
  if (signal >= 75) return '📶';
  if (signal >= 50) return '📡';
  return '📊';
}

function getSignalBars(signal) {
  const bars = 4;
  const activeBars = Math.ceil((signal / 100) * bars);
  return Array(bars).fill(0).map((_, i) => 
    `<div class="signal-bar ${i < activeBars ? 'active' : ''}"></div>`
  ).join('');
}

function selectNetwork(index) {
  selectedNetwork = availableNetworks[index];
  
  if (selectedNetwork.security === 'Open') {
    connectToNetwork(selectedNetwork.ssid, '');
  } else {
    showPasswordModal(selectedNetwork);
  }
}

function showPasswordModal(network) {
  const overlay = document.getElementById('wifi-password-overlay');
  const modal = document.getElementById('wifi-password-modal');
  const nameEl = document.getElementById('selected-network-name');
  const input = document.getElementById('wifi-password-input');
  
  nameEl.textContent = `🔐 ${escapeHtml(network.ssid)}`;
  input.value = '';
  input.focus();
  
  overlay.style.display = 'flex';
  modal.style.display = 'block';
}

function hidePasswordModal() {
  document.getElementById('wifi-password-overlay').style.display = 'none';
  document.getElementById('wifi-password-modal').style.display = 'none';
}

async function connectToNetwork(ssid, password) {
  const statusDiv = document.getElementById('connection-status');
  const statusMsg = document.getElementById('status-message');
  
  hidePasswordModal();
  
  statusDiv.style.display = 'block';
  statusMsg.innerHTML = '<span class="loading-spinner">⏳</span> Connecting to ' + escapeHtml(ssid) + '...';
  statusMsg.className = 'status-message connecting';
  
  try {
    const result = await window.api.connectToWiFi(ssid, password);
    
    if (result.success) {
      availableNetworks = availableNetworks.map(n => ({
        ...n,
        connected: n.ssid === ssid
      }));
      
      displayNetworks(availableNetworks);
      
      statusMsg.innerHTML = '✅ Successfully connected to <strong>' + escapeHtml(ssid) + '</strong>';
      statusMsg.className = 'status-message success';
      
      setTimeout(() => {
        statusDiv.style.display = 'none';
        checkSystemStatus();
        checkArduinoStatus();
      }, 3000);
    } else {
      throw new Error(result.error || 'Connection failed');
    }
  } catch (error) {
    console.error('Connection error:', error);
    statusMsg.innerHTML = '❌ Failed to connect. Error: ' + error.message;
    statusMsg.className = 'status-message error';
  }
}

function showStatus(message, type) {
  const statusDiv = document.getElementById('connection-status');
  const statusMsg = document.getElementById('status-message');
  
  statusMsg.textContent = message;
  statusMsg.className = 'status-message ' + type;
  statusDiv.style.display = 'block';
  
  if (type === 'success') {
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }
}

// Debug function to inspect state
window.debugState = function() {
  console.log('=== STATE DEBUG ===');
  console.log('uiReady:', state.uiReady);
  console.log('Devices:', state.devices);
  console.log('History length:', state.history.length);
  console.log('History (last 3):', state.history.slice(-3));
  console.log('DailyChart exists:', !!dailyChart);
  console.log('MonthlyChart exists:', !!monthlyChart);
  if (dailyChart && dailyChart.data) {
    console.log('DailyChart labels:', dailyChart.data.labels?.length, 'items');
    console.log('DailyChart data[0] (Avg):', dailyChart.data.datasets[0]?.data?.length, 'items');
  }
  if (monthlyChart && monthlyChart.data) {
    console.log('MonthlyChart labels:', monthlyChart.data.labels?.length, 'items');
  }
  console.log('=== END DEBUG ===');
};

window.testCharts = function() {
  console.log('[TEST] Manual chart test');
  if (dailyChart) {
    dailyChart.data.labels = ['Test1', 'Test2', 'Test3'];
    dailyChart.data.datasets[0].data = [30, 40, 50];
    dailyChart.data.datasets[1].data = [40, 55, 65];
    dailyChart.data.datasets[2].data = [null, null, 65];
    dailyChart.update();
    console.log('[TEST] Daily chart updated with test data');
  }
};
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Listen for WiFi connection updates
if (window.api && window.api.onWiFiConnected) {
  window.api.onWiFiConnected((data) => {
    console.log('WiFi connection update:', data);
    checkSystemStatus();
    checkArduinoStatus();
  });
}

// ==================== Reports Functions ====================

/**
 * Load and display reports from database
 */
async function loadReports() {
  try {
    const now = Date.now();
    const startTime = now - (30 * 24 * 60 * 60 * 1000); // Last 30 days
    
    // Fetch all reports from last 30 days
    const options = {
      startTime: startTime,
      endTime: now,
      limit: 500
    };
    
    const response = await window.api.getNoiseReports(options);
    
    if (response.success) {
      displayReports(response.reports);
    } else {
      console.error('Error loading reports:', response.error);
      showReportsEmpty();
    }
  } catch (error) {
    console.error('Error in loadReports:', error);
    showReportsEmpty();
  }
}

/**
 * Display reports in the UI
 */
function displayReports(reports) {
  const tbody = document.getElementById('reports-tbody');
  if (!tbody) return;
  
  if (!reports || reports.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="no-data">No reports available</td></tr>';
    return;
  }
  
  tbody.innerHTML = reports.map(report => {
    const date = new Date(report.timestamp);
    const dateStr = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    
    const feedback = report.user_feedback || '';
    const corrected = report.corrected_sound_type || '';
    
    return `
      <tr data-report-id="${report.id}">
        <td>${dateStr}</td>
        <td>${timeStr}</td>
        <td>${escapeHtml(report.device_section || report.device_name || 'N/A')}</td>
        <td>${escapeHtml(report.device_name || report.device_id)}</td>
        <td>${report.average_level?.toFixed(1) || '--'}</td>
        <td>${report.peak_level?.toFixed(1) || '--'}</td>
        <td>${report.sound_type ? escapeHtml(report.sound_type) : '--'}</td>
        <td>
          <div class="feedback-buttons">
            <button class="feedback-btn thumbs-up ${feedback === 'correct' ? 'active' : ''}" title="Correct" data-feedback="correct" onclick="handleFeedback(event, ${report.id}, 'correct')">👍</button>
            <button class="feedback-btn thumbs-down ${feedback === 'incorrect' ? 'active' : ''}" title="Incorrect" data-feedback="incorrect" onclick="handleFeedback(event, ${report.id}, 'incorrect')">👎</button>
          </div>
        </td>
        <td>
          <input type="text" class="corrected-type-input" placeholder="Type here..." value="${escapeHtml(corrected)}" data-report-id="${report.id}" onchange="handleCorrectedType(event, ${report.id})" />
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Show empty reports state
 */
function showReportsEmpty() {
  const tbody = document.getElementById('reports-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="6" class="no-data">Error loading reports. Please try again.</td></tr>';
  }
}

/**
 * Update reports statistics
 */
async function updateReportsStats(reports) {
  try {
    const totalReportsEl = document.getElementById('total-reports');
    const avgNoiseEl = document.getElementById('avg-noise');
    const peakNoiseEl = document.getElementById('peak-noise');
    const totalAlertsEl = document.getElementById('total-alerts');
    
    if (reports && reports.length > 0) {
      if (totalReportsEl) totalReportsEl.textContent = reports.length;
      
      const avgLevels = reports.filter(r => r.average_level != null).map(r => r.average_level);
      if (avgNoiseEl && avgLevels.length > 0) {
        const avg = avgLevels.reduce((a, b) => a + b, 0) / avgLevels.length;
        avgNoiseEl.textContent = avg.toFixed(1) + ' dB';
      }
      
      const peakLevels = reports.filter(r => r.peak_level != null).map(r => r.peak_level);
      if (peakNoiseEl && peakLevels.length > 0) {
        const peak = Math.max(...peakLevels);
        peakNoiseEl.textContent = peak.toFixed(1) + ' dB';
      }
    }
    
    // Fetch alerts count
    const daysFilter = parseInt(document.getElementById('report-days-filter')?.value || '30');
    const now = Date.now();
    const startTime = now - (daysFilter * 24 * 60 * 60 * 1000);
    
    const alertsResponse = await window.api.getAlertsLog({
      startTime: startTime,
      endTime: now
    });
    
    if (alertsResponse.success && totalAlertsEl) {
      totalAlertsEl.textContent = alertsResponse.alerts.length;
    }
  } catch (error) {
    console.error('Error updating reports stats:', error);
  }
}

/**
 * Save current noise data to database
 */
function saveNoiseReportToDb(deviceId, deviceName, averageLevel, peakLevel, soundType) {
  try {
    if (!window.api || !window.api.saveNoiseReport) {
      console.warn('[DB] window.api.saveNoiseReport not available, cannot save report');
      return;
    }
    
    // Get the actual device section selected by user
    const deviceSection = state.devices[deviceId]?.tableId || deviceName;
    
    const reportData = {
      device_id: deviceId,
      device_name: deviceName,
      device_section: deviceSection,
      timestamp: Date.now(),
      average_level: averageLevel,
      peak_level: peakLevel,
      sound_type: soundType || null,
      notes: `Auto-saved from ${deviceName}`
    };
    
    // Better logging with accurate data
    console.log('[DB] Saving report:', { 
      device: deviceName, 
      section: deviceSection, 
      avgLevel: averageLevel.toFixed(1), 
      peakLevel: peakLevel.toFixed(1),
      soundType: soundType || '(no triggered sound)' 
    });
    
    window.api.saveNoiseReport(reportData)
      .then(response => {
        if (response && response.success) {
          console.log(`[DB] ✓ Noise report saved (ID: ${response.id}) - Avg: ${averageLevel.toFixed(1)}dB, Peak: ${peakLevel.toFixed(1)}dB, Sound: ${soundType || 'background only'}`);
        } else {
          console.error('[DB] ✗ Error saving noise report:', response?.error || 'Unknown error');
        }
      })
      .catch(error => {
        console.error('[DB] ✗ IPC invoke error for save-noise-report:', error);
      });
  } catch (error) {
    console.error('[DB] ✗ Exception in saveNoiseReportToDb:', error);
  }
}

/**
 * Setup Reports UI event listeners
 */
function setupReportsEventListeners() {
  // No event listeners needed - Reports automatically load when Reports tab is clicked
  console.log('Reports view initialized');
}

/**
 * Export reports to CSV
 */
async function exportReportsToCSV() {
  try {
    const deviceFilter = document.getElementById('report-device-filter')?.value || '';
    const daysFilter = parseInt(document.getElementById('report-days-filter')?.value || '30');
    
    const now = Date.now();
    const startTime = now - (daysFilter * 24 * 60 * 60 * 1000);
    
    const options = {
      startTime: startTime,
      endTime: now
    };
    
    if (deviceFilter) {
      options.device_id = deviceFilter;
    }
    
    const response = await window.api.getNoiseReports(options);
    
    if (!response.success || !response.reports || response.reports.length === 0) {
      alert('No reports to export');
      return;
    }
    
    // Create CSV content
    const headers = ['Date', 'Time', 'Section', 'Device', 'Average Level (dB)', 'Peak Level (dB)', 'Sound Type'];
    const rows = response.reports.map(r => {
      const date = new Date(r.timestamp);
      return [
        date.toLocaleDateString('en-US'),
        date.toLocaleTimeString('en-US'),
        r.device_section || r.device_name || 'N/A',
        r.device_name || r.device_id,
        r.average_level?.toFixed(1) || '--',
        r.peak_level?.toFixed(1) || '--',
        r.sound_type || '--'
      ];
    });
    
    const csv = [headers, ...rows].map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    // Create download link
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `noise-reports-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    console.log('✓ Reports exported to CSV');
  } catch (error) {
    console.error('Error exporting reports:', error);
    alert('Error exporting reports');
  }
}

/**
 * Handle thumbs up/down feedback
 */
async function handleFeedback(event, reportId, feedbackValue) {
  event.preventDefault();
  
  try {
    // Toggle active state
    const button = event.target;
    const isActive = button.classList.contains('active');
    const feedbackToSave = isActive ? '' : feedbackValue;
    
    // Remove active class from both buttons in this row
    const row = button.closest('tr');
    row.querySelectorAll('.feedback-btn').forEach(btn => btn.classList.remove('active'));
    
    // Add active class if not toggling off
    if (feedbackToSave) {
      button.classList.add('active');
    }
    
    // Save to database
    const response = await window.api.updateReportFeedback({
      reportId: reportId,
      userFeedback: feedbackToSave
    });
    
    if (!response.success) {
      console.error('Error saving feedback:', response.error);
      alert('Error saving feedback');
    }
  } catch (error) {
    console.error('Error in handleFeedback:', error);
  }
}

/**
 * Handle corrected sound type input
 */
async function handleCorrectedType(event, reportId) {
  try {
    const correctedType = event.target.value.trim();
    
    // Save to database
    const response = await window.api.updateReportCorrectedType({
      reportId: reportId,
      correctedSoundType: correctedType
    });
    
    if (!response.success) {
      console.error('Error saving corrected type:', response.error);
      alert('Error saving corrected type');
    }
  } catch (error) {
    console.error('Error in handleCorrectedType:', error);
  }
}

// Initialize Reports UI when app loads
if (state.uiReady && state.isLoggedIn) {
  setupReportsEventListeners();
}

// ==================== Data Analysis Integration ====================

/**
 * Perform comprehensive data analysis and display insights
 * This function integrates the new DataAnalysis module
 * REAL-TIME: Pulls data from state.devices and state.history for accurate live values
 */
function performDataAnalysis() {
  try {
    if (!window.DataAnalysis) {
      console.debug('[DATA_ANALYSIS] DataAnalysis module not loaded');
      return;
    }

    // Ensure UI is ready and logged in
    if (!state.isLoggedIn || !state.uiReady) {
      console.debug('[DATA_ANALYSIS] UI not ready yet');
      return;
    }

    // Get REAL-TIME data from state.devices (most recent values)
    let currentAvg = 0;
    let currentPeak = 0;
    let deviceCount = 0;
    
    // Calculate average across all connected devices
    for (const deviceId in state.devices) {
      const dev = state.devices[deviceId];
      if (dev && dev.readings && dev.readings.length > 0) {
        const devAvg = dev.readings.reduce((a, b) => a + b, 0) / dev.readings.length;
        const devPeak = Math.max(...dev.readings);
        currentAvg += devAvg;
        currentPeak = Math.max(currentPeak, devPeak);
        deviceCount++;
      }
    }
    
    // If no readings in state, fall back to DOM elements
    if (deviceCount > 0) {
      currentAvg = currentAvg / deviceCount;
    } else {
      currentAvg = parseFloat(document.getElementById('avgValue')?.textContent) || 0;
      currentPeak = parseFloat(document.getElementById('peakValue')?.textContent) || 0;
    }

    const gaugeData = { avg: currentAvg, peak: currentPeak };

    // Get chart data from live charts
    const liveChartData = noiseChart ? {
      labels: noiseChart.data.labels,
      datasets: noiseChart.data.datasets
    } : null;

    const dailyData = dailyChart ? {
      labels: dailyChart.data.labels,
      datasets: dailyChart.data.datasets
    } : null;

    const monthlyData = monthlyChart ? {
      labels: monthlyChart.data.labels,
      datasets: monthlyChart.data.datasets
    } : null;

    // Perform comprehensive analysis
    const analysis = window.DataAnalysis.performComprehensiveAnalysis(
      gaugeData,
      liveChartData,
      dailyData,
      monthlyData,
      state.selectedDevice
    );

    // Update UI with analysis insights
    updateAnalysisDisplay(analysis);

  } catch (error) {
    console.error('[DATA_ANALYSIS] Error performing analysis:', error.message);
  }
}

/**
 * Update UI to display analysis insights
 */
function updateAnalysisDisplay(analysis) {
  try {
    // Update header status
    const statusIndicator = document.getElementById('analysis-status');
    if (statusIndicator) {
      statusIndicator.textContent = `${analysis.overallStatus.charAt(0).toUpperCase() + analysis.overallStatus.slice(1)}`;
      statusIndicator.className = `analysis-status ${analysis.overallStatus}`;
    }

    // Update analysis view panel
    const statusBadge = document.getElementById('analysis-status-badge');
    if (statusBadge) {
      statusBadge.textContent = analysis.overallStatus.charAt(0).toUpperCase() + analysis.overallStatus.slice(1);
      statusBadge.className = `status-badge ${analysis.overallStatus}`;
    }

    const riskLevelEl = document.getElementById('analysis-risk-level');
    if (riskLevelEl) {
      riskLevelEl.textContent = analysis.riskLevel.charAt(0).toUpperCase() + analysis.riskLevel.slice(1);
    }

    // Update insights list
    const insightsList = document.getElementById('analysis-insights-list');
    if (insightsList) {
      if (analysis.insights && analysis.insights.length > 0) {
        insightsList.innerHTML = analysis.insights.map((insight, idx) => 
          `<li><strong>${idx + 1}.</strong> ${insight}</li>`
        ).join('');
      } else {
        insightsList.innerHTML = '<li class="loading">No insights yet - collecting data...</li>';
      }
    }

    // Update recommendations list
    const recommendationsList = document.getElementById('analysis-recommendations-list');
    if (recommendationsList) {
      if (analysis.recommendations && analysis.recommendations.length > 0) {
        recommendationsList.innerHTML = analysis.recommendations.map((rec, idx) => 
          `<li><strong>${idx + 1}.</strong> ${rec}</li>`
        ).join('');
      } else {
        recommendationsList.innerHTML = '<li class="loading">All metrics within acceptable range</li>';
      }
    }

    // Update component analysis
    const componentsDiv = document.getElementById('analysis-components');
    if (componentsDiv && analysis.components) {
      const componentHtml = `
        <div class="component-card">
          <h5>Gauges</h5>
          <p class="component-status ${analysis.components.gauges?.status}\">${analysis.components.gauges?.status || 'N/A'}</p>
          <p class="component-detail\">Risk: ${analysis.components.gauges?.riskLevel || 'N/A'}</p>
        </div>
        <div class="component-card">
          <h5>Live Chart</h5>
          <p class="component-status ${analysis.components.liveChart?.trend}\">${analysis.components.liveChart?.trend || 'N/A'}</p>
          <p class="component-detail\">Volatility: ${analysis.components.liveChart?.volatility || 'N/A'}</p>
        </div>
        <div class="component-card">
          <h5>Daily Trends</h5>
          <p class="component-detail\">Violations: ${analysis.components.dailyTrends?.violations || 0}</p>
          <p class="component-detail\">Avg: ${analysis.components.dailyTrends?.averageNoise?.toFixed(1) || 'N/A'} dB</p>
        </div>
        <div class="component-card">
          <h5>Monthly Overview</h5>
          <p class="component-status ${analysis.components.monthlyOverview?.trend}\">${analysis.components.monthlyOverview?.trend || 'N/A'}</p>
          <p class="component-detail\">Avg: ${analysis.components.monthlyOverview?.averageNoise?.toFixed(1) || 'N/A'} dB</p>
        </div>
      `;
      componentsDiv.innerHTML = componentHtml;
    }

    // Log to console as well
    console.log('[DATA_ANALYSIS] Analysis Results:', analysis);

  } catch (error) {
    console.error('[DATA_ANALYSIS] Error updating analysis display:', error.message);
  }
}

/**
 * Auto-run analysis periodically
 */
// Store original functions before wrapping
const _originalComputeAndUpdateMetrics = typeof computeAndUpdateMetrics !== 'undefined' ? computeAndUpdateMetrics : null;
const _originalUpdateHistoryCharts = typeof updateHistoryCharts !== 'undefined' ? updateHistoryCharts : null;
const _originalUpdateHistoryChartsForDevice = typeof updateHistoryChartsForDevice !== 'undefined' ? updateHistoryChartsForDevice : null;

function startAnalysisTimer() {
  // Run analysis every 5 seconds for real-time continuous updates
  setInterval(() => {
    if (state.isLoggedIn && state.uiReady) {
      performDataAnalysis();
    }
  }, 5000); // Check frequently for real-time updates

  // Wrap computeAndUpdateMetrics to run analysis after metrics change
  if (_originalComputeAndUpdateMetrics) {
    window.computeAndUpdateMetrics = function(ts) {
      _originalComputeAndUpdateMetrics.call(this, ts);
      // Run analysis after metrics update
      setTimeout(() => performDataAnalysis(), 200);
    };
  }

  // Wrap updateHistoryCharts to run analysis after chart updates
  if (_originalUpdateHistoryCharts) {
    window.updateHistoryCharts = function() {
      _originalUpdateHistoryCharts.apply(this, arguments);
      // Run analysis after charts update
      setTimeout(() => performDataAnalysis(), 200);
    };
  }

  // Wrap updateHistoryChartsForDevice
  if (_originalUpdateHistoryChartsForDevice) {
    window.updateHistoryChartsForDevice = function(deviceId) {
      _originalUpdateHistoryChartsForDevice.apply(this, arguments);
      // Run analysis after device chart updates
      setTimeout(() => performDataAnalysis(), 200);
    };
  }
}

// Note: Analysis initialization is now handled in showApp() when UI is fully ready

// ==================== Settings Management ====================

/**
 * Check if noise should be logged based on current settings
 */
function shouldLogNoise(soundType, noiseLevel) {
  try {
    const settings = JSON.parse(localStorage.getItem('noiseTypeSettings')) || getDefaultNoiseSettings();

    switch (soundType) {
      case 'human_voice':
        return settings.humanVoice.enabled && noiseLevel >= settings.humanVoice.minVolume;

      case 'silence':
        return settings.silence.enabled;

      case 'background':
        return settings.backgroundNoise.enabled &&
               noiseLevel >= settings.backgroundNoise.minVolume &&
               noiseLevel <= settings.backgroundNoise.maxVolume;

      default:
        // High noise alert - check if it exceeds threshold
        return settings.highNoise.enabled && noiseLevel >= settings.highNoise.threshold;
    }
  } catch (error) {
    console.error('[SETTINGS] Error checking logging settings:', error.message);
    // Default to logging human voice and high noise
    return soundType === 'human_voice' || noiseLevel >= 70;
  }
}

/**
 * Get logging frequency for sound type
 */
function getLoggingFrequency(soundType) {
  try {
    const settings = JSON.parse(localStorage.getItem('noiseTypeSettings')) || getDefaultNoiseSettings();

    switch (soundType) {
      case 'human_voice':
        return settings.humanVoice.frequency;
      case 'silence':
        return settings.silence.frequency;
      case 'background':
        return settings.backgroundNoise.frequency;
      default:
        return settings.highNoise.frequency;
    }
  } catch (error) {
    return 'immediate';
  }
}
function loadSettings() {
  try {
    // Load noise type settings
    const noiseSettings = JSON.parse(localStorage.getItem('noiseTypeSettings')) || getDefaultNoiseSettings();

    // Human Voice settings
    document.getElementById('log-human-voice').checked = noiseSettings.humanVoice.enabled;
    document.getElementById('human-voice-frequency').value = noiseSettings.humanVoice.frequency;
    document.getElementById('human-voice-min-volume').value = noiseSettings.humanVoice.minVolume;

    // Silence settings
    document.getElementById('log-silence').checked = noiseSettings.silence.enabled;
    document.getElementById('silence-frequency').value = noiseSettings.silence.frequency;
    document.getElementById('silence-duration').value = noiseSettings.silence.duration;

    // Background Noise settings
    document.getElementById('log-background-noise').checked = noiseSettings.backgroundNoise.enabled;
    document.getElementById('background-frequency').value = noiseSettings.backgroundNoise.frequency;
    document.getElementById('background-min-volume').value = noiseSettings.backgroundNoise.minVolume;
    document.getElementById('background-max-volume').value = noiseSettings.backgroundNoise.maxVolume;

    // High Noise settings
    document.getElementById('log-high-noise').checked = noiseSettings.highNoise.enabled;
    document.getElementById('high-noise-frequency').value = noiseSettings.highNoise.frequency;
    document.getElementById('high-noise-threshold').value = noiseSettings.highNoise.threshold;

    // Load schedule settings
    const scheduleSettings = JSON.parse(localStorage.getItem('scheduleSettings')) || getDefaultScheduleSettings();

    document.getElementById('daily-report-time').value = scheduleSettings.dailyReportTime;
    document.getElementById('data-retention').value = scheduleSettings.dataRetention;
    document.getElementById('auto-cleanup').checked = scheduleSettings.autoCleanup;

    console.log('[SETTINGS] Settings loaded successfully');
  } catch (error) {
    console.error('[SETTINGS] Error loading settings:', error.message);
  }
}

/**
 * Get default noise type settings
 */
function getDefaultNoiseSettings() {
  return {
    humanVoice: {
      enabled: true,
      frequency: 'immediate',
      minVolume: 40
    },
    silence: {
      enabled: false,
      frequency: 'never',
      duration: 300
    },
    backgroundNoise: {
      enabled: false,
      frequency: 'never',
      minVolume: 35,
      maxVolume: 55
    },
    highNoise: {
      enabled: true,
      frequency: 'immediate',
      threshold: 70
    }
  };
}

/**
 * Get default schedule settings
 */
function getDefaultScheduleSettings() {
  return {
    dailyReportTime: '00:00',
    dataRetention: '30',
    autoCleanup: true
  };
}

/**
 * Save noise type settings to localStorage
 */
function saveNoiseSettings() {
  try {
    const settings = {
      humanVoice: {
        enabled: document.getElementById('log-human-voice').checked,
        frequency: document.getElementById('human-voice-frequency').value,
        minVolume: parseInt(document.getElementById('human-voice-min-volume').value)
      },
      silence: {
        enabled: document.getElementById('log-silence').checked,
        frequency: document.getElementById('silence-frequency').value,
        duration: parseInt(document.getElementById('silence-duration').value)
      },
      backgroundNoise: {
        enabled: document.getElementById('log-background-noise').checked,
        frequency: document.getElementById('background-frequency').value,
        minVolume: parseInt(document.getElementById('background-min-volume').value),
        maxVolume: parseInt(document.getElementById('background-max-volume').value)
      },
      highNoise: {
        enabled: document.getElementById('log-high-noise').checked,
        frequency: document.getElementById('high-noise-frequency').value,
        threshold: parseInt(document.getElementById('high-noise-threshold').value)
      }
    };

    localStorage.setItem('noiseTypeSettings', JSON.stringify(settings));
    console.log('[SETTINGS] Noise type settings saved');

    // Send settings to main process for real-time application
    if (window.api && window.api.updateNoiseSettings) {
      window.api.updateNoiseSettings(settings);
    }

    return true;
  } catch (error) {
    console.error('[SETTINGS] Error saving noise settings:', error.message);
    return false;
  }
}

/**
 * Save schedule settings to localStorage
 */
function saveScheduleSettings() {
  try {
    const settings = {
      dailyReportTime: document.getElementById('daily-report-time').value,
      dataRetention: document.getElementById('data-retention').value,
      autoCleanup: document.getElementById('auto-cleanup').checked
    };

    localStorage.setItem('scheduleSettings', JSON.stringify(settings));
    console.log('[SETTINGS] Schedule settings saved');

    // Send settings to main process for scheduling
    if (window.api && window.api.updateScheduleSettings) {
      window.api.updateScheduleSettings(settings);
    }

    return true;
  } catch (error) {
    console.error('[SETTINGS] Error saving schedule settings:', error.message);
    return false;
  }
}

/**
 * Reset noise settings to defaults
 */
function resetNoiseSettings() {
  const defaults = getDefaultNoiseSettings();

  document.getElementById('log-human-voice').checked = defaults.humanVoice.enabled;
  document.getElementById('human-voice-frequency').value = defaults.humanVoice.frequency;
  document.getElementById('human-voice-min-volume').value = defaults.humanVoice.minVolume;

  document.getElementById('log-silence').checked = defaults.silence.enabled;
  document.getElementById('silence-frequency').value = defaults.silence.frequency;
  document.getElementById('silence-duration').value = defaults.silence.duration;

  document.getElementById('log-background-noise').checked = defaults.backgroundNoise.enabled;
  document.getElementById('background-frequency').value = defaults.backgroundNoise.frequency;
  document.getElementById('background-min-volume').value = defaults.backgroundNoise.minVolume;
  document.getElementById('background-max-volume').value = defaults.backgroundNoise.maxVolume;

  document.getElementById('log-high-noise').checked = defaults.highNoise.enabled;
  document.getElementById('high-noise-frequency').value = defaults.highNoise.frequency;
  document.getElementById('high-noise-threshold').value = defaults.highNoise.threshold;

  console.log('[SETTINGS] Noise settings reset to defaults');
}

/**
 * Reset schedule settings to defaults
 */
function resetScheduleSettings() {
  const defaults = getDefaultScheduleSettings();

  document.getElementById('daily-report-time').value = defaults.dailyReportTime;
  document.getElementById('data-retention').value = defaults.dataRetention;
  document.getElementById('auto-cleanup').checked = defaults.autoCleanup;

  console.log('[SETTINGS] Schedule settings reset to defaults');
}

// Initialize settings event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Settings event listeners
  document.getElementById('save-noise-settings')?.addEventListener('click', () => {
    if (saveNoiseSettings()) {
      alert('Noise type settings saved successfully!');
    } else {
      alert('Error saving noise settings. Please try again.');
    }
  });

  document.getElementById('reset-noise-settings')?.addEventListener('click', () => {
    if (confirm('Reset all noise type settings to defaults?')) {
      resetNoiseSettings();
    }
  });

  document.getElementById('save-schedule-settings')?.addEventListener('click', () => {
    if (saveScheduleSettings()) {
      alert('Schedule settings saved successfully!');
    } else {
      alert('Error saving schedule settings. Please try again.');
    }
  });

  document.getElementById('reset-schedule-settings')?.addEventListener('click', () => {
    if (confirm('Reset all schedule settings to defaults?')) {
      resetScheduleSettings();
    }
  });
});

