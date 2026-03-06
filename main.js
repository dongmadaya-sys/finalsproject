const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const WebSocket = require('ws');
const net = require('net');
const dns = require('dns');
const os = require('os');
const { exec, execSync } = require('child_process');
const fs = require('fs');
const initSqlJs = require('sql.js');
const SoundClassifier = require('./sound_classifier');
const ArduinoWiFiHandler = require('./arduino_wifi_handler');

// Try to enable electron-reload for automatic reloads during development.
// This is optional — if `electron-reload` isn't installed the app will continue to work.
try {
  require('electron-reload')(__dirname, {
    electron: require('electron')
  });
  console.log('✓ electron-reload enabled');
} catch (e) {
  // ignore if not available
}

// ==================== SQLite Database Setup (using sql.js) ====================
let db = null;
let SQL = null;
let dbFilePath = null;

async function initializeDatabase() {
  try {
    // Initialize sql.js
    SQL = await initSqlJs();
    dbFilePath = path.join(app.getPath('userData'), 'reports.db');
    
    // Try to load existing database
    let fileBuffer = null;
    if (fs.existsSync(dbFilePath)) {
      fileBuffer = fs.readFileSync(dbFilePath);
    }
    
    // Create or load database
    if (fileBuffer) {
      db = new SQL.Database(new Uint8Array(fileBuffer));
      console.log(`✓ Database loaded from: ${dbFilePath}`);
    } else {
      db = new SQL.Database();
      console.log(`✓ New database created`);
    }
    
    // Migrate existing tables to add device_section column if needed
    migrateDatabase();
    
    // Create tables if they don't exist
    const sqlStatements = [
      `CREATE TABLE IF NOT EXISTS noise_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        device_name TEXT,
        device_section TEXT,
        timestamp INTEGER NOT NULL,
        average_level REAL,
        peak_level REAL,
        sound_type TEXT,
        duration_minutes INTEGER,
        notes TEXT,
        user_feedback TEXT,
        corrected_sound_type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS alerts_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        device_name TEXT,
        alert_type TEXT,
        level REAL,
        timestamp INTEGER NOT NULL,
        resolved INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS daily_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        device_name TEXT,
        date TEXT UNIQUE,
        avg_noise REAL,
        peak_noise REAL,
        total_alerts INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS idx_noise_reports_device ON noise_reports(device_id)`,
      `CREATE INDEX IF NOT EXISTS idx_noise_reports_timestamp ON noise_reports(timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_alerts_log_device ON alerts_log(device_id)`,
      `CREATE INDEX IF NOT EXISTS idx_alerts_log_timestamp ON alerts_log(timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_daily_summaries_device ON daily_summaries(device_id)`,
      `CREATE INDEX IF NOT EXISTS idx_daily_summaries_date ON daily_summaries(date)`
    ];
    
    sqlStatements.forEach(sql => {
      try {
        db.run(sql);
      } catch (e) {
        // Table might already exist
        if (!e.message.includes('already exists')) {
          console.warn('Warning executing SQL:', e.message);
        }
      }
    });
    
    // Save database to file
    saveDatabase();
    
    console.log('✓ Database tables created/verified');
    return true;
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    return false;
  }
}

function migrateDatabase() {
  try {
    // Check if device_section column exists in noise_reports table
    const result = db.exec(`PRAGMA table_info(noise_reports)`);
    if (result.length > 0) {
      const columns = result[0].values.map(row => row[1]); // Get column names
      
      if (!columns.includes('device_section')) {
        console.log('⚠️  Migrating database: adding device_section column...');
        
        try {
          db.run(`ALTER TABLE noise_reports ADD COLUMN device_section TEXT`);
          console.log('✓ device_section column added to noise_reports');
          saveDatabase();
        } catch (e) {
          console.warn('⚠️  Could not add device_section column (may already exist):', e.message);
        }
      }
      
      // Add user_feedback column if needed
      if (!columns.includes('user_feedback')) {
        console.log('⚠️  Migrating database: adding user_feedback column...');
        
        try {
          db.run(`ALTER TABLE noise_reports ADD COLUMN user_feedback TEXT`);
          console.log('✓ user_feedback column added to noise_reports');
          saveDatabase();
        } catch (e) {
          console.warn('⚠️  Could not add user_feedback column (may already exist):', e.message);
        }
      }
      
      // Add corrected_sound_type column if needed
      if (!columns.includes('corrected_sound_type')) {
        console.log('⚠️  Migrating database: adding corrected_sound_type column...');
        
        try {
          db.run(`ALTER TABLE noise_reports ADD COLUMN corrected_sound_type TEXT`);
          console.log('✓ corrected_sound_type column added to noise_reports');
          saveDatabase();
        } catch (e) {
          console.warn('⚠️  Could not add corrected_sound_type column (may already exist):', e.message);
        }
      }
    }
  } catch (error) {
    console.warn('⚠️  Database migration check failed:', error.message);
  }
}

function saveDatabase() {
  try {
    if (db && dbFilePath) {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbFilePath, buffer);
    }
  } catch (error) {
    console.error('Error saving database:', error.message);
  }
}

// ==================== WiFi Functions ====================

/**
 * Scan available WiFi networks on Windows
 * Returns array of networks with SSID, security, and signal strength
 */
function scanWiFiNetworks() {
  return new Promise((resolve, reject) => {
    try {
      // Use netsh to list available WiFi networks (Windows)
      execSync('netsh wlan show networks mode=Bssid', { encoding: 'utf-8' });
      
      exec('netsh wlan show networks mode=Bssid', { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          console.error('WiFi scan error:', error);
          return reject(new Error('Failed to scan WiFi networks'));
        }

        const networks = [];
        const lines = stdout.split('\n');
        let currentNetwork = null;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();

          // Find SSID line
          if (line.startsWith('SSID')) {
            const ssidMatch = line.match(/:\s*(.+)$/);
            if (ssidMatch) {
              currentNetwork = {
                ssid: ssidMatch[1].trim(),
                security: 'WPA2',
                signal: 0,
                connected: false
              };
            }
          }

          // Find Authentication type
          if (line.startsWith('Authentication') && currentNetwork) {
            const authMatch = line.match(/:\s*(.+)$/);
            if (authMatch) {
              const auth = authMatch[1].trim();
              if (auth === 'Open') {
                currentNetwork.security = 'Open';
              } else if (auth.includes('WPA3')) {
                currentNetwork.security = 'WPA3';
              } else if (auth.includes('WPA2')) {
                currentNetwork.security = 'WPA2';
              } else if (auth.includes('WPA')) {
                currentNetwork.security = 'WPA';
              }
            }
          }

          // Find Signal Strength
          if (line.startsWith('Signal') && currentNetwork) {
            const signalMatch = line.match(/:\s*(\d+)%/);
            if (signalMatch) {
              currentNetwork.signal = parseInt(signalMatch[1]);
              networks.push(currentNetwork);
              currentNetwork = null;
            }
          }
        }

        // Remove duplicates and sort by signal strength
        const uniqueNetworks = Array.from(new Map(networks.map(n => [n.ssid, n])).values())
          .sort((a, b) => b.signal - a.signal);

        console.log(`✓ Found ${uniqueNetworks.length} WiFi networks`);
        resolve(uniqueNetworks);
      });
    } catch (error) {
      console.error('WiFi scan error:', error.message);
      reject(error);
    }
  });
}

/**
 * Escape XML special characters
 */
function escapeXml(str) {
  return str.replace(/[<>&"']/g, (char) => {
    const escapeMap = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&apos;'
    };
    return escapeMap[char];
  });
}

/**
 * Connect to a WiFi network on Windows
 * @param {string} ssid - Network SSID
 * @param {string} password - Network password (empty for open networks)
 */
/**
 * Connect to a WiFi network on Windows
 * SIMPLIFIED: Just shows current network status instead of connecting
 */
function connectToWiFiNetwork(ssid, password) {
  return new Promise((resolve) => {
    // Just return success - user needs to connect manually via Windows settings
    console.log(`ℹ️  Please connect to "${ssid}" manually via Windows WiFi settings`);
    resolve({
      success: true,
      message: `Please connect to ${ssid} via Windows WiFi settings`,
      ssid: ssid
    });
  });
}

/**
 * Convert SSID string to hex format for WiFi profile
 */
function ssidToHex(ssid) {
  let hex = '';
  for (let i = 0; i < ssid.length; i++) {
    hex += ssid.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Get current connected WiFi network
 */
function getCurrentWiFiNetwork() {
  return new Promise((resolve, reject) => {
    try {
      exec('netsh wlan show interfaces', { encoding: 'utf-8' }, (error, stdout, stderr) => {
        if (error) return reject(error);

        const lines = stdout.split('\n');
        let connectedNetwork = null;

        for (const line of lines) {
          if (line.includes('SSID') && !line.includes('BSSID')) {
            const match = line.match(/:\s*(.+)$/);
            if (match) {
              const ssid = match[1].trim();
              if (ssid && ssid !== 'OK' && ssid !== 'enabled' && ssid !== 'disabled') {
                connectedNetwork = ssid;
                break;
              }
            }
          }
        }

        resolve({
          connected: !!connectedNetwork,
          ssid: connectedNetwork || null
        });
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Disable cache to avoid permission issues on Windows
app.disableHardwareAcceleration();

let mainWindow;
let alertWindow;
let PORT = 8080;
let wss;
let soundClassifier;
let arduinoHandler; // Arduino WiFi handler
const devices = {};
const NOISE_THRESHOLD = 55; // dB - Alert triggers at 55dB and above. Raised speech: 55-60dB, Loud speech: 65-70dB, Non-speech: 75+dB.
const INACTIVITY_MS = 45_000;  // 45 seconds timeout (device sends every 1s, so 45+ missed updates)
const ALERT_THROTTLE_MS = 2000; // 2 seconds between alerts per device for real-time response
const lastAlertTime = {}; // Track last alert time per device
const messageQueue = []; // Buffer messages while renderer is loading
let rendererReady = false; // Flag to indicate renderer is ready

function createAlertWindow() {
  if (alertWindow) {
    alertWindow.focus();
    return alertWindow;
  }
  
  // Get all displays
  const displays = screen.getAllDisplays();
  const alertDisplay = displays.length > 1 ? displays[1] : displays[0];
  
  // Set window to full screen of the display
  const windowWidth = alertDisplay.bounds.width;
  const windowHeight = alertDisplay.bounds.height;
  const windowX = alertDisplay.bounds.x;
  const windowY = alertDisplay.bounds.y;
  
  alertWindow = new BrowserWindow({
    x: windowX,
    y: windowY,
    width: windowWidth,
    height: windowHeight,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    },
    alwaysOnTop: true,
    frame: false,
    hasShadow: true
  });
  
  alertWindow.loadFile('alert_demo.html');
  alertWindow.removeMenu();

  alertWindow.on('closed', () => {
    alertWindow = null;
  });

  return alertWindow;
}

function createWindow() {
  // Get primary display
  const primaryDisplay = screen.getPrimaryDisplay();
  
  mainWindow = new BrowserWindow({
    x: primaryDisplay.bounds.x,
    y: primaryDisplay.bounds.y,
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
    rendererReady = true;
    
    mainWindow.webContents.send('server-info', { port: PORT, NOISE_THRESHOLD });
    
    // Flush any buffered messages that arrived while renderer was loading
    console.log(`[QUEUE] Flushing ${messageQueue.length} buffered messages to renderer...`);
    messageQueue.forEach(msg => {
      mainWindow.webContents.send(msg.channel, msg.data);
    });
    messageQueue.length = 0; // Clear queue
    
    // Show the main window
    try {
      mainWindow.show();
    } catch (e) {
      console.log('✓ Could not show window (headless), server still running');
    }
    
    // Create and show alert notification window
    setTimeout(() => {
      const alertWin = createAlertWindow();
      alertWin.show();
      alertWin.webContents.send('show-alert', {
        title: '⚠️ Smart Noise Monitor Started',
        message: 'The noise detection system is now active.\n\nMonitoring noise levels in this area.\n\nKindly maintain appropriate noise levels to respect others.'
      });
      console.log('✓ Startup alert window shown');
    }, 800);
  });
  
  mainWindow.webContents.on('did-fail-load', (err) => {
    console.error('✗ Failed to load:', err);
  });
  
  mainWindow.on('closed', () => {
    console.log('Window closed');
    rendererReady = false;
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  console.log('App ready, initializing database...');
  await initializeDatabase();
  
  console.log('App ready, starting WebSocket server...');
  await startWebSocketServer();
  console.log('WebSocket server started successfully');
  
  // Initialize Arduino WiFi handler
  try {
    console.log('Initializing Arduino connection...');
    arduinoHandler = new ArduinoWiFiHandler();
    const arduinoConnected = await arduinoHandler.initialize();
    if (arduinoConnected) {
      console.log('✓ Arduino connected and ready');
    } else {
      console.log('⚠️  Arduino not found (this is optional)');
    }
  } catch (error) {
    console.error('Arduino initialization error:', error.message);
  }
  
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

// Helper to send data to renderer with queueing support
function sendToRenderer(channel, data) {
  if (mainWindow && rendererReady) {
    mainWindow.webContents.send(channel, data);
    if (channel === 'device-data') {
      console.log(`[SEND] → Renderer: ${channel} | Noise: ${data.noiseLevel}dB`);
    }
  } else if (mainWindow) {
    // Queue for later delivery when renderer is ready
    messageQueue.push({ channel, data });
    if (messageQueue.length <= 5 || messageQueue.length % 50 === 0) {
      console.log(`[QUEUE] Buffered (${messageQueue.length} pending): ${channel}`);
    }
    if (messageQueue.length > 1000) {
      // Prevent memory leak if queue grows too large
      messageQueue.splice(0, messageQueue.length - 1000);
    }
  }
}

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
    // Use port 8080 directly (don't search for free port)
    PORT = 8080;
    console.log(`[DEBUG] Using port for WebSocket: ${PORT}`);
    
    // Get local IP address - prioritize 192.168.100.130 if available
    const networkInterfaces = os.networkInterfaces();
    let localIP = 'localhost';
    let preferredIP = null;
    
    for (const name of Object.keys(networkInterfaces)) {
      for (const iface of networkInterfaces[name]) {
        // Skip internal and non-IPv4 addresses
        if (iface.family === 'IPv4' && !iface.internal) {
          // If this is our preferred IP, use it immediately
          if (iface.address === '192.168.100.130') {
            localIP = iface.address;
            break;
          }
          // Otherwise use it as fallback if no other option
          if (!preferredIP) {
            preferredIP = iface.address;
          }
        }
      }
      if (localIP !== 'localhost') break;
    }
    
    // If preferred IP wasn't found, use the fallback
    if (localIP === 'localhost' && preferredIP) {
      localIP = preferredIP;
    }
    
    console.log(`[DEBUG] Server IP: ${localIP}`);
    
    // Create WebSocket server that listens on all interfaces
    wss = new WebSocket.Server({ 
      port: PORT, 
      perMessageDeflate: false,
      host: '0.0.0.0'  // Listen on ALL network interfaces
    });
    console.log(`✓ WebSocket server listening on 0.0.0.0:${PORT}`);
    console.log(`✓ Accessible from: ws://${localIP}:${PORT}`);
    console.log(`✓ WebSocket server accepting connections from ANY IP on port 8080`);

    // Initialize sound classifier
    soundClassifier = new SoundClassifier();
    await soundClassifier.initialize();

    wss.on('connection', (ws) => {
      const remoteAddr = ws._socket.remoteAddress;
      const remotePort = ws._socket.remotePort;
      console.log(`✓ New WebSocket connection from ${remoteAddr}:${remotePort}`);
      console.log(`✓ Total clients connected: ${wss.clients.size}`);
      ws.isAlive = true;
      ws.on('pong', () => ws.isAlive = true);

      ws.on('message', async (msg) => {
        try {
          const data = JSON.parse(msg.toString());
          const { deviceId, tableId, noiseLevel, audioFeatures, audioData, soundType, timestamp } = data;
          if (!deviceId) return;
          devices[deviceId] = devices[deviceId] || {};
          devices[deviceId].lastSeen = Date.now();
          
          // Only set tableId from WebSocket if device doesn't have one yet
          // This preserves the user's selection made in the UI
          if (!devices[deviceId].tableId || devices[deviceId].tableId.startsWith('TABLE') || devices[deviceId].tableId === 'unknown') {
            devices[deviceId].tableId = tableId || devices[deviceId].tableId || 'unknown';
          }
          
          devices[deviceId].lastNoise = noiseLevel;
          devices[deviceId].ws = ws;

          // Classify sound using pre-trained SpeechCommands model
          let classifiedSoundType = soundType || 'unknown';
          let confidence = 0;
          
          if (soundClassifier && soundClassifier.initialized) {
            let classification = { soundType: 'unknown', confidence: 0 };
            
            // Priority 1: Use raw audio if available (most accurate)
            if (audioData && typeof audioData === 'string') {
              try {
                // audioData might be base64 encoded
                const audioBuffer = Buffer.from(audioData, 'base64');
                const audioArray = new Float32Array(audioBuffer.buffer);
                classification = await soundClassifier.classifyFromAudio(audioArray);
              } catch (err) {
                console.warn('Failed to process raw audio:', err.message);
                // Fall through to features-based classification
              }
            }
            
            // Priority 2: Use audio features if raw audio not available
            if (classification.confidence === 0 && audioFeatures) {
              classification = soundClassifier.classify({
                noiseLevel,
                ...audioFeatures
              });
            }
            
            classifiedSoundType = classification.soundType || 'unknown';
            confidence = classification.confidence || 0;
            devices[deviceId].lastSoundType = classifiedSoundType;
            devices[deviceId].classification = classification;
            
            // Debug: Log classification details
            if (audioFeatures) {
              console.log(`[CLASSIFY] ${deviceId}: ${noiseLevel}dB → ${classifiedSoundType} (${(confidence * 100).toFixed(1)}%) | Low:${audioFeatures.lowFreqEnergy.toFixed(2)} Mid:${audioFeatures.midFreqEnergy.toFixed(2)} High:${audioFeatures.highFreqEnergy.toFixed(2)} Vol:${audioFeatures.volatility.toFixed(2)}`);
            } else {
              console.log(`[CLASSIFY] ${deviceId}: ${classifiedSoundType} (${(confidence * 100).toFixed(1)}%) from raw audio`);
            }
          } else if (soundType) {
            classifiedSoundType = soundType;
            devices[deviceId].lastSoundType = soundType;
          }

          // ==================== HUMAN VOICE FILTER ====================
          // STRICT FILTER: Block all audio that is NOT human voice
          // Only process and forward audio data if it's classified as human_voice
          if (classifiedSoundType !== 'human_voice') {
            console.log(`[FILTER] ${deviceId}: Blocked ${classifiedSoundType} (${noiseLevel}dB) - Only human voice allowed`);
            return; // Completely discard this audio data
          }

          // Forward to renderer with classified sound type (ONLY human_voice reaches here)
          const dataToSend = {
            deviceId,
            tableId,
            noiseLevel,
            soundType: classifiedSoundType,
            timestamp: timestamp || Date.now()
          };

          // Keep a short history of recent samples per-device for replay on UI load
          devices[deviceId].history = devices[deviceId].history || [];
          devices[deviceId].history.push({ noiseLevel, soundType: classifiedSoundType, timestamp: dataToSend.timestamp });
          // keep only last 30 samples
          if (devices[deviceId].history.length > 30) devices[deviceId].history.splice(0, devices[deviceId].history.length - 30);

          if (mainWindow) sendToRenderer('device-data', dataToSend);

          // If noise above threshold -> alert (with throttling)
          if (noiseLevel > NOISE_THRESHOLD) {
            const now = Date.now();
            const lastAlert = lastAlertTime[deviceId] || 0;
            const timeSinceLastAlert = now - lastAlert;
            
            // Only show alert if more than ALERT_THROTTLE_MS has passed
            if (timeSinceLastAlert >= ALERT_THROTTLE_MS) {
              lastAlertTime[deviceId] = now;
              
              const sectionLabel = (devices[deviceId].tableId && devices[deviceId].tableId.trim()) ? devices[deviceId].tableId : `Device ${deviceId}`;
              
              const alert = {
                type: 'noise_exceed',
                deviceId,
                tableId: sectionLabel,
                noiseLevel,
                soundType: classifiedSoundType,
                timestamp: timestamp || Date.now()
              };
              if (mainWindow) sendToRenderer('alert', alert);
              
              // Show alert in notification window
              const alertWin = createAlertWindow();
              if (alertWin) {
                alertWin.show();
                alertWin.webContents.send('show-alert', {
                  title: `⚠️ Noise Disturbance at ${sectionLabel}`,
                  message: `Please keep quiet, respect others.`,
                  timestamp: new Date().toLocaleTimeString()
                });
              }
            }
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
          if (mainWindow) sendToRenderer('device-offline', { deviceId: id, tableId: dev.tableId });
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
    if (mainWindow) sendToRenderer('alert', alert);
    
    // Show alert in notification window
    const alertWin = createAlertWindow();
    if (alertWin) {
      alertWin.show();
      alertWin.webContents.send('show-alert', {
        title: '⚠️ Possible Sensor Issue',
        message: `Device ${triggeringDeviceId} reports high noise (${triggeredNoise} dB) but peers are quiet.\n\nPlease check the device.`
      });
    }
  }
}

// allow renderer to query current devices (return a sanitized, serializable snapshot)
ipcMain.handle('query-devices', () => {
  const safeDevices = {};
  for (const [id, d] of Object.entries(devices)) {
    safeDevices[id] = {
      lastSeen: d.lastSeen,
      tableId: d.tableId,
      lastNoise: d.lastNoise,
      lastSoundType: d.lastSoundType,
      classification: d.classification,
      // include recent history (serializable)
      history: (d.history || []).map(h => ({ noiseLevel: h.noiseLevel, soundType: h.soundType, timestamp: h.timestamp }))
    };
  }
  return { devices: safeDevices, NOISE_THRESHOLD };
});

// Handle device section update from renderer
ipcMain.handle('update-device-section', (event, { deviceId, sectionName }) => {
  if (devices[deviceId]) {
    const oldSection = devices[deviceId].tableId;
    devices[deviceId].tableId = sectionName;
    console.log(`[IPC] Updated device ${deviceId} section from "${oldSection}" to: "${sectionName}"`);
    return { success: true, deviceId, sectionName, oldSection };
  }
  console.log(`[IPC] Failed to update section - device ${deviceId} not found`);
  return { success: false, error: 'Device not found' };
});

// ==================== WiFi IPC Handlers ====================

/**
 * Scan for available WiFi networks
 */
ipcMain.handle('scan-wifi-networks', async (event) => {
  try {
    console.log('📡 Scanning WiFi networks...');
    const networks = await scanWiFiNetworks();
    
    // Get current network
    const current = await getCurrentWiFiNetwork();
    
    // Mark which one is connected
    const enrichedNetworks = networks.map(n => ({
      ...n,
      connected: n.ssid === current.ssid
    }));
    
    console.log(`✓ WiFi scan complete: ${enrichedNetworks.length} networks found`);
    return { success: true, networks: enrichedNetworks };
  } catch (error) {
    console.error('❌ WiFi scan failed:', error.message);
    return { success: false, error: error.message, networks: [] };
  }
});

/**
 * Connect to a WiFi network
 */
ipcMain.handle('connect-to-wifi', async (event, { ssid, password }) => {
  try {
    console.log(`🔗 Attempting to connect to WiFi: ${ssid}`);
    const result = await connectToWiFiNetwork(ssid, password || '');
    
    // Also configure Arduino with the same WiFi credentials
    let arduinoResult = null;
    if (arduinoHandler && arduinoHandler.isArduinoConnected()) {
      console.log('📡 Configuring Arduino WiFi...');
      arduinoResult = await arduinoHandler.sendWiFiCredentials(ssid, password || '');
      console.log('Arduino WiFi config result:', arduinoResult);
    } else {
      console.log('⚠️  Arduino not connected, skipping Arduino WiFi configuration');
    }
    
    // Notify all windows of WiFi connection
    const mainWindowInstance = mainWindow;
    if (mainWindowInstance) {
      mainWindowInstance.webContents.send('wifi-connected', { 
        ssid, 
        success: true,
        arduinoConfigured: arduinoResult?.arduinoConfigured || false
      });
    }
    
    console.log(`✓ WiFi connected: ${ssid}`);
    return { 
      success: true, 
      message: result.message,
      arduinoConfigured: arduinoResult?.arduinoConfigured || false
    };
  } catch (error) {
    console.error('❌ WiFi connection failed:', error.message);
    return { success: false, error: error.message };
  }
});

/**
 * Get current WiFi network
 */
ipcMain.handle('get-current-wifi', async (event) => {
  try {
    const current = await getCurrentWiFiNetwork();
    return { success: true, ...current };
  } catch (error) {
    console.error('Error getting current WiFi:', error.message);
    return { success: false, error: error.message };
  }
});

/**
 * Get Arduino connection status
 */
ipcMain.handle('get-arduino-status', async (event) => {
  if (!arduinoHandler) {
    return { connected: false, message: 'Arduino handler not initialized' };
  }
  const info = arduinoHandler.getPortInfo();
  return { connected: info.connected, ...info };
});

/**
 * Initialize Arduino connection
 */
ipcMain.handle('initialize-arduino', async (event) => {
  try {
    if (!arduinoHandler) {
      arduinoHandler = new ArduinoWiFiHandler();
    }
    const connected = await arduinoHandler.initialize();
    if (connected) {
      console.log('✓ Arduino initialized successfully');
      return { success: true, message: 'Arduino connected', ...arduinoHandler.getPortInfo() };
    } else {
      return { success: false, message: 'Failed to connect to Arduino' };
    }
  } catch (error) {
    console.error('Arduino initialization error:', error.message);
    return { success: false, message: error.message };
  }
});
// ==================== SQLite IPC Handlers ====================

/**
 * Save a noise report to database
 */
ipcMain.handle('save-noise-report', (event, reportData) => {
  try {
    if (!db) {
      return { success: false, error: 'Database not initialized' };
    }
    
    db.run(`
      INSERT INTO noise_reports (device_id, device_name, device_section, timestamp, average_level, peak_level, sound_type, duration_minutes, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      reportData.device_id,
      reportData.device_name,
      reportData.device_section || reportData.device_name,
      reportData.timestamp,
      reportData.average_level,
      reportData.peak_level,
      reportData.sound_type || null,
      reportData.duration_minutes || null,
      reportData.notes || null
    ]);
    
    // Get the last inserted ID
    const result = db.exec('SELECT last_insert_rowid() as id');
    const id = result && result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : null;
    
    saveDatabase();
    return { success: true, id };
  } catch (error) {
    console.error('Error saving noise report:', error.message);
    return { success: false, error: error.message };
  }
});

/**
 * Log an alert to database
 */
ipcMain.handle('log-alert', (event, alertData) => {
  try {
    if (!db) {
      return { success: false, error: 'Database not initialized' };
    }
    
    db.run(`
      INSERT INTO alerts_log (device_id, device_name, alert_type, level, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `, [
      alertData.device_id,
      alertData.device_name,
      alertData.alert_type || 'noise',
      alertData.level,
      alertData.timestamp
    ]);
    
    const result = db.exec('SELECT last_insert_rowid() as id');
    const id = result && result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : null;
    
    saveDatabase();
    return { success: true, id };
  } catch (error) {
    console.error('Error logging alert:', error.message);
    return { success: false, error: error.message };
  }
});

/**
 * Get noise reports (with optional filtering)
 */
ipcMain.handle('get-noise-reports', (event, options = {}) => {
  try {
    if (!db) {
      return { success: false, error: 'Database not initialized', reports: [] };
    }
    
    let query = 'SELECT * FROM noise_reports WHERE 1=1';
    const params = [];
    
    if (options.device_id) {
      query += ' AND device_id = ?';
      params.push(options.device_id);
    }
    
    if (options.startTime) {
      query += ' AND timestamp >= ?';
      params.push(options.startTime);
    }
    
    if (options.endTime) {
      query += ' AND timestamp <= ?';
      params.push(options.endTime);
    }
    
    query += ' ORDER BY timestamp DESC';
    
    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    
    const results = db.exec(query, params);
    const reports = [];
    
    if (results.length > 0) {
      const columns = results[0].columns;
      const values = results[0].values;
      values.forEach(row => {
        const report = {};
        columns.forEach((col, idx) => {
          report[col] = row[idx];
        });
        reports.push(report);
      });
    }
    
    return { success: true, reports };
  } catch (error) {
    console.error('Error fetching noise reports:', error.message);
    return { success: false, error: error.message, reports: [] };
  }
});

/**
 * Get alerts log (with optional filtering)
 */
ipcMain.handle('get-alerts-log', (event, options = {}) => {
  try {
    if (!db) {
      return { success: false, error: 'Database not initialized', alerts: [] };
    }
    
    let query = 'SELECT * FROM alerts_log WHERE 1=1';
    const params = [];
    
    if (options.device_id) {
      query += ' AND device_id = ?';
      params.push(options.device_id);
    }
    
    if (options.startTime) {
      query += ' AND timestamp >= ?';
      params.push(options.startTime);
    }
    
    if (options.endTime) {
      query += ' AND timestamp <= ?';
      params.push(options.endTime);
    }
    
    if (options.unresolved === true) {
      query += ' AND resolved = 0';
    }
    
    query += ' ORDER BY timestamp DESC';
    
    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    
    const results = db.exec(query, params);
    const alerts = [];
    
    if (results.length > 0) {
      const columns = results[0].columns;
      const values = results[0].values;
      values.forEach(row => {
        const alert = {};
        columns.forEach((col, idx) => {
          alert[col] = row[idx];
        });
        alerts.push(alert);
      });
    }
    
    return { success: true, alerts };
  } catch (error) {
    console.error('Error fetching alerts log:', error.message);
    return { success: false, error: error.message, alerts: [] };
  }
});

/**
 * Get daily summaries
 */
ipcMain.handle('get-daily-summaries', (event, options = {}) => {
  try {
    if (!db) {
      return { success: false, error: 'Database not initialized', summaries: [] };
    }
    
    let query = 'SELECT * FROM daily_summaries WHERE 1=1';
    const params = [];
    
    if (options.device_id) {
      query += ' AND device_id = ?';
      params.push(options.device_id);
    }
    
    if (options.startDate) {
      query += ' AND date >= ?';
      params.push(options.startDate);
    }
    
    if (options.endDate) {
      query += ' AND date <= ?';
      params.push(options.endDate);
    }
    
    query += ' ORDER BY date DESC';
    
    const results = db.exec(query, params);
    const summaries = [];
    
    if (results.length > 0) {
      const columns = results[0].columns;
      const values = results[0].values;
      values.forEach(row => {
        const summary = {};
        columns.forEach((col, idx) => {
          summary[col] = row[idx];
        });
        summaries.push(summary);
      });
    }
    
    return { success: true, summaries };
  } catch (error) {
    console.error('Error fetching daily summaries:', error.message);
    return { success: false, error: error.message, summaries: [] };
  }
});

/**
 * Delete reports (cleanup old data)
 */
ipcMain.handle('delete-old-reports', (event, olderThanDays = 30) => {
  try {
    if (!db) {
      return { success: false, error: 'Database not initialized' };
    }
    
    const timestamp = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    db.run('DELETE FROM noise_reports WHERE timestamp < ?', [timestamp]);
    
    saveDatabase();
    return { success: true, deleted: 1 };
  } catch (error) {
    console.error('Error deleting old reports:', error.message);
    return { success: false, error: error.message };
  }
});

/**
 * Get database statistics
 */
ipcMain.handle('get-db-stats', (event) => {
  try {
    if (!db) {
      return { success: false, error: 'Database not initialized' };
    }
    
    const getCount = (table) => {
      const results = db.exec(`SELECT COUNT(*) as count FROM ${table}`);
      if (results.length > 0 && results[0].values.length > 0) {
        return results[0].values[0][0];
      }
      return 0;
    };
    
    const getAvg = () => {
      const results = db.exec('SELECT AVG(average_level) as avg FROM noise_reports');
      if (results.length > 0 && results[0].values.length > 0) {
        const avg = results[0].values[0][0];
        return avg ? parseFloat(avg).toFixed(2) : 0;
      }
      return 0;
    };
    
    return {
      success: true,
      stats: {
        totalReports: getCount('noise_reports'),
        totalAlerts: getCount('alerts_log'),
        totalSummaries: getCount('daily_summaries'),
        averageNoiseLevel: getAvg()
      }
    };
  } catch (error) {
    console.error('Error getting database stats:', error.message);
    return { success: false, error: error.message };
  }
});
/**
 * Update user feedback (thumbs up/down) for a report
 */
ipcMain.handle('update-report-feedback', (event, { reportId, userFeedback }) => {
  try {
    if (!db) {
      return { success: false, error: 'Database not initialized' };
    }
    
    db.run(`
      UPDATE noise_reports 
      SET user_feedback = ? 
      WHERE id = ?
    `, [userFeedback || null, reportId]);
    
    saveDatabase();
    return { success: true };
  } catch (error) {
    console.error('Error updating report feedback:', error.message);
    return { success: false, error: error.message };
  }
});

/**
 * Update corrected sound type for a report
 */
ipcMain.handle('update-report-corrected-type', (event, { reportId, correctedSoundType }) => {
  try {
    if (!db) {
      return { success: false, error: 'Database not initialized' };
    }
    
    db.run(`
      UPDATE noise_reports 
      SET corrected_sound_type = ? 
      WHERE id = ?
    `, [correctedSoundType || null, reportId]);
    
    saveDatabase();
    return { success: true };
  } catch (error) {
    console.error('Error updating corrected sound type:', error.message);
    return { success: false, error: error.message };
  }
});
