const devicesList = document.getElementById('devices-list');
const alertsList = document.getElementById('alerts-list');
const thresholdEl = document.getElementById('threshold');
const toastEl = document.getElementById('toast');
const wsUrlEl = document.getElementById('ws-url');

let noiseChart;
const state = { devices: {}, chartLabels: [], maxPoints: 30, isLoggedIn: false };

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
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  attachDataListeners();
  initChart();
}

function showLoginScreen() {
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

function checkSession() {
  if (localStorage.getItem('isLoggedIn') === 'true') {
    state.isLoggedIn = true;
    showApp();
  } else {
    showLoginScreen();
  }
}

// Initialize neon chart
function initChart() {
  const ctx = document.getElementById('noiseChart').getContext('2d');
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

  // Clear alerts button
  document.getElementById('clear-alerts')?.addEventListener('click', () => { alertsList.innerHTML = ''; });

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

  // Update chart dataset
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

// Handle alerts
function handleAlert(alert) {
  if (!state.isLoggedIn) return; // don't show alerts on login screen
  const li = document.createElement('li');
  li.textContent = `[${new Date().toLocaleTimeString()}] ${alert.type} — Device:${alert.deviceId} Table:${alert.tableId} Noise:${alert.noiseLevel} Type:${alert.soundType || ''}`;
  alertsList.prepend(li);
  showToast(`${alert.type} — ${alert.deviceId} (${alert.tableId})`);

  const el = document.getElementById(`dev-${alert.deviceId}`);
  if (el) {
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 900);
  }
}

// Device offline
function handleDeviceOffline({ deviceId, tableId }) {
  if (!state.isLoggedIn) return; // avoid notifying on login screen
  markOffline(deviceId);
  const li = document.createElement('li');
  li.textContent = `[${new Date().toLocaleTimeString()}] device_offline — Device:${deviceId} Table:${tableId}`;
  alertsList.prepend(li);
  showToast(`device_offline — ${deviceId}`);
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

// Toast
function showToast(msg) {
  if (!state.isLoggedIn) return; // suppress toasts when logged out
  const m = document.createElement('div');
  m.className = 'msg';
  m.textContent = msg;
  toastEl.appendChild(m);
  setTimeout(() => { m.style.opacity = '0'; setTimeout(() => m.remove(), 500); }, 3000);
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

// Check login session and register network listener early (so it shows on login screen)
window.addEventListener('DOMContentLoaded', () => {
  if (window.api && window.api.onNetworkStatus) window.api.onNetworkStatus(updateNetworkStatus);
  checkSession();
});
