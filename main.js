const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const WebSocket = require('ws');
const net = require('net');
const dns = require('dns');
const os = require('os');
const SoundClassifier = require('./sound_classifier');

// Disable cache to avoid permission issues on Windows
app.disableHardwareAcceleration();

let mainWindow;
let PORT = 8080;
let wss;
let soundClassifier;
const devices = {};
const NOISE_THRESHOLD = 65;
const INACTIVITY_MS = 15_000;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // Don't show the window initially
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  mainWindow.loadFile('index.html');
  
  // Hide the menu bar
  mainWindow.removeMenu();
  
  mainWindow.webContents.on('crashed', () => {
    console.error('✗ Render process crashed!');
  });
  
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('✓ Window loaded, sending server info on port', PORT);
    mainWindow.webContents.send('server-info', { port: PORT, NOISE_THRESHOLD });
    // Optionally show the window
    try {
      mainWindow.show();
    } catch (e) {
      console.log('✓ Could not show window (headless), server still running');
    }
  });
  
  mainWindow.webContents.on('did-fail-load', (err) => {
    console.error('✗ Failed to load:', err);
  });
  
  mainWindow.on('closed', () => {
    console.log('Window closed');
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  console.log('App ready, starting WebSocket server...');
  await startWebSocketServer();
  console.log('WebSocket server started successfully');
  
  try {
    console.log('Attempting to create window...');
    createWindow();
    console.log('Window created successfully');
  } catch (e) {
    console.error('✗ Could not create window:', e.message);
    console.log('✓ WebSocket server is still running on ws://localhost:' + PORT);
  }

  // start network monitor (reports online/offline to renderer)
  function getPrimaryInterfaceName() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const ni of nets[name]) {
        if (!ni.internal && ni.family === 'IPv4') return name;
      }
    }
    return null;
  }

  function checkNetworkOnce() {
    dns.resolve('www.google.com', (err) => {
      const online = !err;
      const iface = getPrimaryInterfaceName();
      if (mainWindow) mainWindow.webContents.send('network-status', { online, interface: iface || 'unknown', lastChecked: Date.now() });
    });
  }

  // run immediately and then every 5s
  try {
    checkNetworkOnce();
    setInterval(checkNetworkOnce, 5000);
  } catch (e) {
    console.error('Network monitor error:', e.message);
  }

  app.on('activate', function () {
    console.log('App activated');
    if (mainWindow && BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});


app.on('window-all-closed', function () {
  // Keep the app running even if no windows are open (server can still run)
  console.log('✓ All windows closed but keeping server alive...');
  // Don't call app.quit() - server continues running
});

process.on('uncaughtException', (err) => {
  console.error('✗ Uncaught exception:', err.message);
});

process.on('SIGINT', () => {
  console.log('✓ Received SIGINT, keeping server running...');
  // Don't exit, just log it
});

process.on('SIGTERM', () => {
  console.log('✓ Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// ---- WebSocket server + device monitoring ----

function findFreePort(startPort, maxAttempts = 50) {
  return new Promise((resolve, reject) => {
    let port = startPort;
    const tryPort = () => {
      const tester = net.createServer()
        .once('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            port++;
            if (port > startPort + maxAttempts) return reject(new Error('No free port found'));
            tryPort();
          } else {
            reject(err);
          }
        })
        .once('listening', () => {
          tester.close(() => resolve(port));
        })
        .listen(port);
    };
    tryPort();
  });
}

async function startWebSocketServer() {
  try {
    const selected = await findFreePort(PORT, 50);
    PORT = selected;
    wss = new WebSocket.Server({ port: PORT });
    console.log(`✓ WebSocket server listening on ws://localhost:${PORT}`);

    // Initialize sound classifier
    soundClassifier = new SoundClassifier();
    await soundClassifier.initialize();

    wss.on('connection', (ws) => {
      console.log(`✓ New WebSocket connection. Total clients: ${wss.clients.size}`);
      ws.isAlive = true;
      ws.on('pong', () => ws.isAlive = true);

      ws.on('message', (msg) => {
        try {
          const data = JSON.parse(msg.toString());
          const { deviceId, tableId, noiseLevel, audioFeatures, soundType, timestamp } = data;
          if (!deviceId) return;
          devices[deviceId] = devices[deviceId] || {};
          devices[deviceId].lastSeen = Date.now();
          devices[deviceId].tableId = tableId || devices[deviceId].tableId;
          devices[deviceId].lastNoise = noiseLevel;
          devices[deviceId].ws = ws;

          // Classify sound using TensorFlow or fallback to provided soundType
          let classifiedSoundType = soundType || 'unknown';
          if (soundClassifier && audioFeatures) {
            const classification = soundClassifier.classify({
              noiseLevel,
              ...audioFeatures
            });
            classifiedSoundType = classification.soundType;
            devices[deviceId].lastSoundType = classifiedSoundType;
            devices[deviceId].classification = classification;
          } else if (soundType) {
            devices[deviceId].lastSoundType = soundType;
          }

          // Forward to renderer with classified sound type
          const dataToSend = {
            deviceId,
            tableId,
            noiseLevel,
            soundType: classifiedSoundType,
            timestamp: timestamp || Date.now()
          };
          if (mainWindow) mainWindow.webContents.send('device-data', dataToSend);

          // If noise above threshold -> alert
          if (noiseLevel >= NOISE_THRESHOLD) {
            const alert = {
              type: 'noise_exceed',
              deviceId,
              tableId: devices[deviceId].tableId,
              noiseLevel,
              soundType: classifiedSoundType,
              timestamp: timestamp || Date.now()
            };
            if (mainWindow) mainWindow.webContents.send('alert', alert);
          }

          checkForMismatch(deviceId);
        } catch (e) {
          console.error('Invalid message:', e.message);
        }
      });

      ws.on('close', () => {
        console.log(`Client disconnected. Remaining: ${wss.clients.size}`);
      });
      
      ws.on('error', (err) => {
        console.error('WebSocket client error:', err.message);
      });
    });

    // Periodic cleanup + inactivity detection
    setInterval(() => {
      const now = Date.now();
      for (const [id, dev] of Object.entries(devices)) {
        if (!dev.lastSeen) continue;
        if (now - dev.lastSeen > INACTIVITY_MS) {
          if (mainWindow) mainWindow.webContents.send('device-offline', { deviceId: id, tableId: dev.tableId });
        }
      }

      // ping clients to keep connections alive
      wss.clients.forEach((client) => {
        if (!client.isAlive) return client.terminate();
        client.isAlive = false;
        client.ping();
      });
    }, 5000);
  } catch (err) {
    console.error('✗ Failed to start WebSocket server:', err.message);
    process.exit(1);
  }
}

function checkForMismatch(triggeringDeviceId) {
  const triggering = devices[triggeringDeviceId];
  if (!triggering || !triggering.tableId) return;
  const table = triggering.tableId;
  const triggeredNoise = triggering.lastNoise || 0;
  // if noise high on triggering device but other devices on same table have low noise, raise possible malfunction
  const otherDevices = Object.entries(devices).filter(([id, d]) => id !== triggeringDeviceId && d.tableId === table);
  if (otherDevices.length === 0) return; // no peers to compare
  const peersLow = otherDevices.every(([id, d]) => (d.lastNoise || 0) < (NOISE_THRESHOLD - 10));
  if (triggeredNoise >= NOISE_THRESHOLD && peersLow) {
    const alert = {
      type: 'possible_sensor_issue',
      deviceId: triggeringDeviceId,
      tableId: table,
      noiseLevel: triggeredNoise,
      peers: otherDevices.map(([id, d]) => ({ deviceId: id, noise: d.lastNoise || 0 }))
    };
    if (mainWindow) mainWindow.webContents.send('alert', alert);
  }
}

// allow renderer to query current devices
ipcMain.handle('query-devices', () => {
  return { devices, NOISE_THRESHOLD };
});
