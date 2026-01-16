const devicesList = document.getElementById('devices-list');
const alertsList = document.getElementById('alerts-list');
const thresholdEl = document.getElementById('threshold');
const wsUrlEl = document.getElementById('ws-url');

let noiseChart, avgGaugeChart, peakGaugeChart, dailyChart, monthlyChart;
const state = { devices: {}, chartLabels: [], maxPoints: 30, isLoggedIn: false, history: [], historyMax: 2880 };

// Simple demo credentials
const VALID_CREDENTIALS = { 'admin': 'admin123', 'user': 'user123' };

// Login handler
function handleLogin(event) {
  event.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  
  if (VALID_CREDENTIALS[username] && VALID_CREDENTIALS[username] === password) {
    state.isLoggedIn = true;
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('username', username);
    showApp();
  } else {
    document.getElementById('login-error').textContent = 'Invalid username or password';
    document.getElementById('login-error').style.display = 'block';
    document.getElementById('password').value = '';
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
  showLoginScreen();
}

// Show app / login
function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'grid';

  const logoutBtn = document.getElementById('logout-btn');
  // If logged in, keep Logout behavior; otherwise show Login button to get to login screen
  if (state.isLoggedIn) {
    logoutBtn.textContent = 'Logout';
    logoutBtn.onclick = handleLogout;
  } else {
    logoutBtn.textContent = 'Login';
    logoutBtn.onclick = () => { showLoginScreen(); };
  }

  // Initialize chart first so incoming data (from queryDevices) has the chart to update
  initChart();
  attachDataListeners();
}

function showLoginScreen() {
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

function checkSession() {
  // Always present the login screen on startup — require manual login to access the dashboard
  state.isLoggedIn = false;
  showLoginScreen();
}

// Initialize neon chart
function initChart() {
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
            ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 45, font: { size: 11 } }
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
  } else {
    noiseChart = null;
  }

  // Gauges
  function createGauge(ctx, color) {
    return new Chart(ctx, {
      type: 'doughnut',
      data: { labels: ['v','r'], datasets: [{ data: [0, 120], backgroundColor: [color, 'rgba(255,255,255,0.06)'], borderWidth: 0 }] },
      options: { cutout: '72%', responsive: true, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
    });
  }

  try {
    const avgCtx = document.getElementById('avgGauge')?.getContext('2d');
    const peakCtx = document.getElementById('peakGauge')?.getContext('2d');
    if (avgCtx) avgGaugeChart = createGauge(avgCtx, '#06b6d4');
    if (peakCtx) peakGaugeChart = createGauge(peakCtx, '#ef4444');
  } catch (e) { console.debug('gauge init failed', e); }

  // Daily chart (line + high-noise bars)
  try {
    const dailyCtx = document.getElementById('dailyChart')?.getContext('2d');
    if (dailyCtx) {
      dailyChart = new Chart(dailyCtx, {
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
          plugins: { legend: { position: 'top', labels: { color: '#0f172a' } } }
        }
      });
    }

    const monthlyCtx = document.getElementById('monthlyChart')?.getContext('2d');
    if (monthlyCtx) {
      monthlyChart = new Chart(monthlyCtx, {
        type: 'line',
        data: { labels: [], datasets: [ { label: 'Avg (day)', data: [], borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,0.08)', fill:true }, { label: 'Peak (day)', data: [], borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.06)', fill:false } ] },
        options: { responsive:true, maintainAspectRatio:false, scales:{ y:{ min:0, max:120, ticks:{ color:'#94a3b8' } }, x:{ ticks:{ color:'#94a3b8' } } }, plugins:{ legend:{ labels:{ color:'#cfe6ff' } } } }
      });
    }
  } catch (e) { console.debug('history chart init failed', e); }

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

    if (label === 'Alerts') {
      if (devicesSection) devicesSection.classList.add('hidden');
      if (sidebarAlerts) sidebarAlerts.classList.remove('hidden');
      if (sidebarAlerts) sidebarAlerts.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (label === 'Devices') {
      if (sidebarAlerts) sidebarAlerts.classList.add('hidden');
      if (devicesSection) devicesSection.classList.remove('hidden');
      if (devicesSection) devicesSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      // Reports or other - hide both for now
      if (sidebarAlerts) sidebarAlerts.classList.add('hidden');
      if (devicesSection) devicesSection.classList.add('hidden');
    }
  }));



  // Periodically check offline devices
  setInterval(() => {
    const now = Date.now();
    for (const id in state.devices) {
      if (state.devices[id].lastSeen && (now - state.devices[id].lastSeen > 15000)) markOffline(id);
    }
    trimChart();
  }, 3000);
}

// Attach API listeners
function attachDataListeners() {
  if (!window.api) return;
  window.api.onDeviceData?.(handleDeviceData);
  window.api.onAlert?.(handleAlert);
  window.api.onDeviceOffline?.(handleDeviceOffline);
  window.api.onServerInfo?.((d) => {
    if (d && typeof d.port !== 'undefined') wsUrlEl.textContent = `ws://localhost:${d.port}`;
    if (d && typeof d.NOISE_THRESHOLD !== 'undefined' && thresholdEl) thresholdEl.textContent = String(d.NOISE_THRESHOLD);
  });
  // query initial server/device config (including noise threshold)
  if (window.api.queryDevices) {
    window.api.queryDevices().then((res) => {
      console.debug('queryDevices response', res);
      const el = document.getElementById('threshold') || thresholdEl;
      if (res && typeof res.NOISE_THRESHOLD !== 'undefined') {
        if (el) el.textContent = String(res.NOISE_THRESHOLD);
      }

      // Populate any already-connected devices so the UI shows samples that arrived
      // before the user logged in or before the window finished loading.
      if (res && res.devices) {
        Object.entries(res.devices).forEach(([id, dev]) => {
          // Replay recent history (ascending) so chart is populated with time series
          if (Array.isArray(dev.history) && dev.history.length > 0) {
            const hist = dev.history.slice().sort((a,b) => a.timestamp - b.timestamp);
            hist.forEach((h) => {
              handleDeviceData({ deviceId: id, tableId: dev.tableId || 'unknown', noiseLevel: h.noiseLevel, soundType: h.soundType || '', timestamp: h.timestamp });
            });
          } else {
            // fallback to last-known snapshot
            const d = {
              deviceId: id,
              tableId: dev.tableId || 'unknown',
              noiseLevel: dev.lastNoise || 0,
              soundType: dev.lastSoundType || '',
              timestamp: dev.lastSeen || Date.now()
            };
            handleDeviceData(d);
          }
        });
      }
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
  const { deviceId, tableId, noiseLevel, soundType, timestamp } = data;
  const ts = timestamp || Date.now();
  const timeLabel = new Date(ts).toLocaleTimeString();

  // Update state
  state.devices[deviceId] = state.devices[deviceId] || { deviceId, tableId, lastSeen: 0, lastNoise: 0, soundType: '' };
  const dev = state.devices[deviceId];
  dev.lastSeen = ts; dev.lastNoise = noiseLevel; dev.soundType = soundType; dev.tableId = tableId;

  upsertDeviceCard(deviceId, tableId, noiseLevel, soundType, ts, true);

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
  }
  // compute and update aggregate metrics (average/peak) and history charts
  try { computeAndUpdateMetrics(ts); } catch (e) { /* ignore */ }
}

// Handle alerts
function handleAlert(alert) {
  if (!state.isLoggedIn) return; // don't show alerts on login screen
  const li = document.createElement('li');
  li.textContent = `[${new Date().toLocaleTimeString()}] ${alert.type} — Device:${alert.deviceId} Table:${alert.tableId} Noise:${alert.noiseLevel} Type:${alert.soundType || ''}`;
  alertsList.prepend(li);
  // no pop-up or flashing; alerts are listed in the sidebar
}

// Device offline
function handleDeviceOffline({ deviceId, tableId }) {
  if (!state.isLoggedIn) return; // avoid notifying on login screen
  markOffline(deviceId);
  const li = document.createElement('li');
  li.textContent = `[${new Date().toLocaleTimeString()}] device_offline — Device:${deviceId} Table:${tableId}`;
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
      <div class="left"><div class="avatar">🔊</div><div>
        <div class="name" id="name-${deviceId}"></div>
        <div class="meta" id="meta-${deviceId}"></div>
      </div></div>
      <div class="right">
        <div class="status" id="status-${deviceId}"></div>
        <div class="meter" title="noise meter"><div class="fill" id="fill-${deviceId}"></div></div>
        <div style="margin-top:8px"><span id="noise-${deviceId}" class="noise"></span> <span id="sound-${deviceId}" class="badge"></span></div>
      </div>`;
    devicesList.appendChild(el);
  }

  document.getElementById(`name-${deviceId}`).textContent = deviceId;
  document.getElementById(`meta-${deviceId}`).textContent = `Table: ${tableId} • last: ${new Date(ts).toLocaleTimeString()}`;
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
}

// Sound type emoji
function soundEmoji(type) {
  const m = { music: '🎵', speech: '🗣️', vehicle: '🚗', typing: '⌨️', silence: '🔇' };
  return type ? m[type] || '🔊' : '';
}

// Trim chart data
function trimChart() {
  if (noiseChart.data.labels.length > state.maxPoints) noiseChart.data.labels.splice(0, noiseChart.data.labels.length - state.maxPoints);
  noiseChart.data.datasets.forEach(d => { if (d.data.length > state.maxPoints) d.data.splice(0, d.data.length - state.maxPoints); });
}

// Compute average & peak across devices, update gauges and history charts
function computeAndUpdateMetrics(ts) {
  const devicesArr = Object.values(state.devices || {});
  if (!devicesArr.length) return;
  const vals = devicesArr.map(d => Number(d.lastNoise || 0));
  const avg = Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
  const peak = Math.max(...vals);

  const lastEl = document.getElementById('last-update'); if (lastEl) lastEl.textContent = new Date(ts).toLocaleTimeString();
  const avgEl = document.getElementById('avgValue'); if (avgEl) avgEl.textContent = avg;
  const peakEl = document.getElementById('peakValue'); if (peakEl) peakEl.textContent = peak;

  if (avgGaugeChart && avgGaugeChart.data && avgGaugeChart.data.datasets[0]) { avgGaugeChart.data.datasets[0].data = [avg, Math.max(0,120-avg)]; avgGaugeChart.update(); }
  if (peakGaugeChart && peakGaugeChart.data && peakGaugeChart.data.datasets[0]) { peakGaugeChart.data.datasets[0].data = [peak, Math.max(0,120-peak)]; peakGaugeChart.update(); }

  state.history.push({ timestamp: ts, avg, peak });
  if (state.history.length > state.historyMax) state.history.splice(0, state.history.length - state.historyMax);
  updateHistoryCharts();
}

function updateHistoryCharts() {
  if (!dailyChart && !monthlyChart) return;
  const now = Date.now();
  const dayWindow = 24 * 60 * 60 * 1000;
  const cutoff = now - dayWindow;
  const recent = state.history.filter(h => h.timestamp >= cutoff);

  const labels = recent.map(h => new Date(h.timestamp).toLocaleTimeString());
  const avgData = recent.map(h => h.avg);
  const peakData = recent.map(h => h.peak);
  const threshold = Number(thresholdEl?.textContent) || 65;
  const highBars = recent.map(h => (h.peak >= threshold ? h.peak : null));

  if (dailyChart) {
    dailyChart.data.labels = labels.slice(-state.maxPoints);
    dailyChart.data.datasets[0].data = avgData.slice(-state.maxPoints);
    dailyChart.data.datasets[1].data = peakData.slice(-state.maxPoints);
    dailyChart.data.datasets[2].data = highBars.slice(-state.maxPoints);
    dailyChart.update();
  }

  // monthly aggregation (per-day)
  const daysMap = {};
  state.history.forEach(h => {
    const d = new Date(h.timestamp);
    const key = `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    daysMap[key] = daysMap[key] || { sumAvg:0, count:0, maxPeak:0 };
    daysMap[key].sumAvg += h.avg;
    daysMap[key].count += 1;
    daysMap[key].maxPeak = Math.max(daysMap[key].maxPeak, h.peak);
  });
  const dayKeys = Object.keys(daysMap).sort((a,b) => new Date(a) - new Date(b));
  const monthLabels = dayKeys;
  const monthAvg = dayKeys.map(k => Math.round(daysMap[k].sumAvg / daysMap[k].count));
  const monthPeak = dayKeys.map(k => daysMap[k].maxPeak);

  if (monthlyChart) {
    monthlyChart.data.labels = monthLabels;
    monthlyChart.data.datasets[0].data = monthAvg;
    monthlyChart.data.datasets[1].data = monthPeak;
    monthlyChart.update();
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
  
  checkSession();
});
