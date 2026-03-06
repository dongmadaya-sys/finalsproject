# Smart Noise Monitor — Complete System Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Hardware Components](#hardware-components)
3. [Software Architecture](#software-architecture)
4. [Tech Stack](#tech-stack)
5. [File Structure & Descriptions](#file-structure--descriptions)
6. [AI Logic & Sound Classification](#ai-logic--sound-classification)
7. [Installation & Setup](#installation--setup)
8. [Data Flow](#data-flow)
9. [Database Schema](#database-schema)
10. [API Reference](#api-reference)
11. [Alert System](#alert-system)
12. [User Feedback System](#user-feedback-system)
13. [Troubleshooting](#troubleshooting)

---

## System Overview

**Smart Noise Monitor** is a comprehensive desktop application (built with Electron) designed to monitor, detect, and report noise levels in library environments in real-time. The system combines hardware audio sensing (ESP32 + INMP441 microphone) with advanced AI-based sound classification to distinguish between different types of noise and alert library staff when noise levels exceed acceptable thresholds.

### Key Features
- **Real-time Noise Monitoring**: Continuously monitors noise levels across multiple devices
- **Multi-Device Support**: Manages multiple ESP32 devices with independent data tracking
  - Each device maintains its own history for accurate per-device trending
  - Live noise charts show real-time data for the selected device
  - Daily and Monthly trend charts display per-device historical data
- **AI Sound Classification**: Uses TensorFlow.js pre-trained SpeechCommands model to classify sound types (human voice, impact noise, mechanical sounds, etc.)
- **User Authentication**: Login system to secure access to noise reports
- **Visual Dashboards**: Real-time charts, gauges, and reports showing noise patterns
- **Alert System**: Automatic alerts with visual AND audio notifications when noise exceeds thresholds
  - Visual alert modal with detailed device and noise level information
  - Sound notification using Web Audio API (pleasant dual-tone alert beep)
  - Real-time notification in alerts sidebar
- **Data Persistence**: SQLite database for storing reports, alerts, and summaries
- **WiFi Configuration**: Serial-based WiFi credential management for Arduino devices
- **User Feedback Integration**: Thumbs up/down validation and corrected sound type input for improving classification accuracy

---

## Hardware Components

### 1. **ESP32 Microcontroller**
- **Role**: Main device for audio capture and WiFi communication
- **Specifications**:
  - 32-bit processor @ 240 MHz
  - Built-in WiFi (802.11 b/g/n)
  - 16 MB Flash memory
  - I2S (Inter-IC Sound) interface for digital audio
  - UART serial port for configuration
- **Function**: Captures audio from microphone, processes it locally, and sends data to PC via WebSocket

### 2. **INMP441 MEMS Microphone**
- **Role**: Precision digital microphone for audio input
- **Specifications**:
  - Digital output (I2S protocol)
  - Sensitivity: -26 dBFS @ 94 dB SPL
  - Frequency response: 50 Hz - 20 kHz
  - Signal-to-noise ratio: ~65 dB
- **Advantage**: No analog-to-digital conversion needed; direct digital output improves noise floor

### 3. **Power Supply**
- USB power for ESP32 (typically 5V, 2A minimum)
- 3.3V regulation on-board for INMP441

### Hardware Wiring

```
INMP441 Pin      →    ESP32 Pin      →    Function
─────────────────────────────────────────────────────
SD (Serial Data) →    GPIO 32         →    I2S_IN_DATA
WS (Word Select) →    GPIO 25         →    I2S_IN_CLK
SCK (Bit Clock)  →    GPIO 33         →    I2S_IN_CLK
L/R (Left/Right) →    GND             →    Mono mode
VDD              →    3.3V            →    Power
GND              →    GND             →    Ground
```

---

## Software Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│           ESP32 + INMP441 (Hardware)                │
│  - Captures raw audio @ 16 kHz                      │
│  - Computes noise level (dB)                        │
│  - Extracts frequency features                      │
│  - Sends via WebSocket                              │
└────────────────────┬────────────────────────────────┘
                     │ WebSocket (port 8080)
                     ▼
┌─────────────────────────────────────────────────────┐
│        Main Process (main.js)                       │
│  - Electron app lifecycle management               │
│  - WebSocket server (receives device data)         │
│  - SQLite database management                      │
│  - Serial port communication (Arduino WiFi config) │
│  - IPC communication with Renderer                 │
└────────────────────┬────────────────────────────────┘
                     │ IPC Messages
                     ▼
┌─────────────────────────────────────────────────────┐
│        Renderer Process (renderer.js)               │
│  - UI rendering (dashboard, alerts, reports)       │
│  - Real-time chart updates                         │
│  - User interactions                               │
└────────────────────┬────────────────────────────────┘
                     │ HTML Canvas/DOM
                     ▼
┌─────────────────────────────────────────────────────┐
│        UI Layer (index.html + styles.css)           │
│  - Login screen                                     │
│  - Device dashboard                                │
│  - Noise charts & gauges                           │
│  - Alerts & reports tables                         │
└─────────────────────────────────────────────────────┘
```

### Component Interaction Flow

1. **Device Data Flow**:
   - ESP32 captures audio → computes features → sends JSON via WebSocket
   - Main process receives data → stores in SQLite → broadcasts to Renderer
   - Renderer updates UI → displays on charts/gauges

2. **Alert Flow**:
   - Device sends high noise level → Main stores in alerts table → Notifies Renderer
   - Renderer shows alert modal → User sees warning

3. **User Actions**:
   - User logs in → Renderer → IPC to Main → Database query
   - User views reports → Renderer requests data → Main queries SQLite → returns results

---

## Tech Stack

### Frontend (Renderer & UI)
| Technology | Purpose |
|-----------|---------|
| **Electron** | Cross-platform desktop application framework |
| **HTML5** | UI markup structure |
| **CSS3** | Styling & responsive design |
| **Chart.js** | Real-time data visualization (line charts, gauges) |
| **Canvas API** | Custom gauge drawing for analog-style displays |
| **Vanilla JavaScript** | Client-side logic & interactivity |

### Backend (Main Process)
| Technology | Purpose |
|-----------|---------|
| **Node.js** | JavaScript runtime |
| **electron** (^39.2.5) | Electron framework |
| **ws** (^8.13.0) | WebSocket server for device communication |
| **serialport** (^13.0.0) | Serial port communication with Arduino |
| **sql.js** (^1.13.0) | SQLite database (pure JavaScript) |

### AI & Audio Processing
| Technology | Purpose |
|-----------|---------|
| **TensorFlow.js** (^3.21.0) | Machine learning library |
| **@tensorflow-models/speech-commands** (^0.5.4) | Pre-trained sound classification model |
| **FFT (Fast Fourier Transform)** | Frequency domain analysis (built into speech-commands) |

### Hardware Firmware
| Technology | Purpose |
|-----------|---------|
| **Arduino C++** | ESP32 firmware programming |
| **I2S Protocol** | Digital audio interface |
| **WiFi (802.11)** | Wireless communication |
| **WebSockets** | Real-time data transmission |
| **ArduinoJson** | JSON serialization on ESP32 |

---

## File Structure & Descriptions

### Root Directory Files

#### **main.js** (1248 lines)
**Purpose**: Electron main process — core application lifecycle and server logic

**Key Responsibilities**:
- Electron app initialization and window management
- SQLite database setup using sql.js
- WebSocket server creation (port 8080) for device data reception
- IPC handlers for Renderer process communication
- Device data aggregation and broadcasting
- Serial port management for Arduino WiFi configuration
- Alert triggering based on noise thresholds
- Data persistence (noise reports, alerts, summaries)

**Key Classes & Functions**:
- `initializeDatabase()` - Sets up SQLite tables for reports, alerts, summaries
- `startWebSocketServer()` - Creates WebSocket server listening on port 8080
- `broadcastDeviceData()` - Sends device updates to Renderer
- `SoundClassifier` - Instantiated for AI-based sound classification
- `ArduinoWiFiHandler` - Manages serial communication with ESP32

#### **renderer.js** (2025 lines)
**Purpose**: Electron renderer process — UI logic and user interactions

**Key Responsibilities**:
- Login/authentication UI management
- Device list rendering and updates
- Real-time chart updates (Chart.js)
- Custom gauge drawing (Canvas API)
- Alert modal display and management
- Reports table population
- Device selection and filtering
- Per-device history tracking and chart updates
- Chart refresh intervals and data buffering

**Key Features** (New in v2.0):
- **Per-Device History Storage**: Each device maintains its own `deviceHistory` array
  - Stores historical data points with timestamp, average noise, and peak noise
  - Independent from global history for accurate per-device trending
  - Synchronized with global history for aggregate metrics

- **Multi-Device Chart Display**:
  - Live chart shows real-time data for selected device
  - Daily trends display last 24 hours of per-device data
  - Monthly overview aggregates per-device data by day
  - Automatic chart updates when switching between devices

**Key Functions**:
- `handleLogin()` - Authenticates user
- `selectDeviceTab(deviceId)` - Switches to device and updates charts
- `updateChartsForDevice(deviceId)` - Updates live chart for selected device
- `updateHistoryChartsForDevice(deviceId)` - Updates daily/monthly trends using per-device history
- `updateDeviceList()` - Renders device cards
- `updateNoiseChart()` - Updates real-time noise line chart
- `drawMeterGauge()` - Custom analog gauge drawing
- `showAlert()` - Displays alert modals
- `generateReport()` - Creates noise reports
- `computeAndUpdateMetrics(ts)` - Aggregates metrics and calls appropriate chart update functions

**Device State Structure**:
```javascript
state.devices[deviceId] = {
  deviceId,           // Device identifier
  tableId,            // Library section assignment
  lastSeen,           // Last update timestamp
  lastNoise,          // Current noise level
  soundType,          // Current sound classification
  readings: [],       // Accumulator for readings (for statistics)
  triggeredSounds: [], // Tracked non-background sounds
  deviceHistory: []   // Per-device historical data for charts
}
```

**History Entry Format**:
```javascript
{
  timestamp: <milliseconds>,
  avg: <average noise level>,
  peak: <peak noise level>
}
```

**UI Components**:
- Device cards (real-time noise display)
- Device tabs (multi-device navigation)
- Live noise chart (30-point rolling window, per-device)
- Average & Peak gauges (analog meter style)
- Daily & Monthly trend charts (per-device history)
- Alerts sidebar
- Reports table

#### **sound_classifier.js** (310 lines)
**Purpose**: AI-based sound classification engine

**Key Features**:
- **Dual Classification System**:
  - **Primary**: TensorFlow.js pre-trained SpeechCommands model (85-95% accuracy)
  - **Fallback**: Heuristic-based classification using audio features (~80% accuracy)

**Sound Categories**:
- `human_voice` - Speech, talking, whispering
- `impact_noise` - Book drops, chair drags, door slams
- `mechanical` - Keyboard typing, fan noise, printer
- `movement` - Footsteps, shuffling, walking
- `background` - Ambient hum, general noise
- `silence` - Very quiet environments

**Key Methods**:
- `initialize()` - Loads pre-trained model (requires internet)
- `classifyFromAudio(audioData)` - Main classification method
- `classifyWithSpeechCommands()` - Uses TensorFlow model
- `classifyByHeuristic()` - Feature-based fallback

**Classification Logic**:
1. Analyzes frequency energy distribution (low/mid/high)
2. Measures audio volatility (change over time)
3. Compares with pre-trained model if available
4. Returns sound type with confidence score

#### **arduino_wifi_handler.js** (200 lines)
**Purpose**: Serial communication with ESP32 for WiFi configuration

**Key Features**:
- Automatic Arduino port detection
- Serial connection management (115200 baud)
- WiFi credential transmission
- Error handling with retry logic

**Key Methods**:
- `initialize()` - Detects and opens serial port
- `sendWiFiCredentials()` - Sends SSID/password to ESP32
- `listenForResponse()` - Receives confirmation from device

#### **index.html** (184 lines)
**Purpose**: UI markup and structure

**Sections**:
- Login screen form
- Header with status indicators
- Sidebar with devices list
- Main dashboard with charts
- Device tabs for multi-device support
- Reports table view
- Alert sidebar

#### **styles.css**
**Purpose**: Visual styling and responsive design

**Key Styles**:
- Dark theme optimized for monitoring
- Responsive grid layout
- Gauge animation effects
- Chart card styling
- Alert modal styling

#### **preload.js** (50 lines)
**Purpose**: Secure IPC bridge between Renderer and Main processes

**Exposed APIs**:
- Device data listeners
- Alert listeners
- Database query methods
- WiFi management
- Arduino configuration

#### **package.json**
**Dependencies**:
```json
{
  "main": "main.js",
  "name": "smart-noise-monitor",
  "description": "Desktop (Electron) smart noise detection and reporting system for libraries",
  "devDependencies": {
    "electron": "^39.2.5",
    "electron-rebuild": "^3.2.9",
    "electron-reload": "^1.5.0"
  },
  "dependencies": {
    "@tensorflow-models/speech-commands": "^0.5.4",
    "@tensorflow/tfjs": "^3.21.0",
    "serialport": "^13.0.0",
    "sql.js": "^1.13.0",
    "ws": "^8.13.0"
  }
}
```

### ESP32 Firmware Files

#### **esp32_inmp441_firmware_1.ino** (701 lines)
**Purpose**: First variant of ESP32 + INMP441 firmware

**Key Features**:
- I2S audio capture @ 16 kHz sample rate
- Real-time noise level computation (dB)
- Frequency domain analysis (FFT-based feature extraction)
- WebSocket client for data transmission
- WiFi connection management
- Audio feature extraction:
  - Low frequency energy (bass)
  - Mid frequency energy (speech)
  - High frequency energy (highs)
  - Volatility (rapid changes)

**Configuration**:
```cpp
#define WIFI_SSID "TECNO POVA 5 Pro 5G"
#define WIFI_PASSWORD "123446789"
#define SERVER_IP "10.25.163.5"  // PC local IP
#define SERVER_PORT 8080
#define DEVICE_ID "esp32-001"
#define TABLE_ID "Table-A"
#define SAMPLE_RATE 16000
#define MIC_GAIN 1.5
#define ALERT_THRESHOLD_DB 55
```

**Data Transmission Format**:
```json
{
  "deviceId": "esp32-001",
  "tableId": "Table-A",
  "noiseLevel": 65,
  "audioFeatures": {
    "lowFreqEnergy": 0.25,
    "midFreqEnergy": 0.50,
    "highFreqEnergy": 0.25,
    "volatility": 0.35
  },
  "timestamp": 1705779600000
}
```

#### **esp32_inmp441_firmware_2.ino**
**Purpose**: Second variant (alternative implementation or configuration)

### Test & Example Files

#### **test_classifier.js**
**Purpose**: Unit tests for sound classification

**Tests**:
- Voice sample classification
- Impact noise classification
- Silence detection
- Verifies accuracy and confidence scores

#### **test_login_flow.js**
**Purpose**: Login authentication testing

#### **ALERT_INTEGRATION_EXAMPLES.js** (187 lines)
**Purpose**: Code examples showing how to integrate alert system

**Examples**:
1. Real-time noise data listener
2. Device event-based alerts
3. Custom alert triggers
4. Auto-dismiss configuration
5. Alert state management

#### **alert_demo.html**
**Purpose**: Alert notification window with sound notification system

**Key Features**:
- **Visual Alert Display**: Glass-morphism styled modal with alert title and message
- **Sound Notification**: Web Audio API-generated dual-tone alert sound
  - First beep: 800Hz → 1000Hz (500ms) with fade in/out
  - Second beep: 600Hz → 800Hz (300ms) with fade in/out
  - Pleasant, attention-grabbing tone that's not harsh
  - Automatic playback when alert is triggered
- **Auto-dismissal**: Alerts auto-close after 4 seconds
- **Modal Styling**: Full-screen alert overlay with high visibility
- **Responsive Design**: Works across different screen resolutions

**Sound Notification Behavior**:
- Plays automatically when noise disturbance is detected (exceeds 55dB threshold)
- Uses Web Audio API for cross-platform browser compatibility
- Gracefully degrades if audio context is unavailable
- Fallback to visual alerts only if sound fails

### Configuration Files

#### **webServerApiSettings.json**
**Purpose**: Server configuration (API endpoints, ports, etc.)

#### **archive/webServerApiSettings.json**
**Purpose**: Previous version or backup configuration

---

## AI Logic & Sound Classification

### Overview

The system uses a **two-tier AI classification approach**:

1. **Primary Tier**: TensorFlow.js pre-trained **SpeechCommands** model
   - Accuracy: 85-95%
   - Requires pre-loaded neural network weights
   - Fast inference (~50-100ms per sample)

2. **Fallback Tier**: Heuristic-based feature analysis
   - Accuracy: ~80%
   - No model required
   - Works offline

### Sound Classification Algorithm

#### Step 1: Feature Extraction (on ESP32)
Audio sample → FFT → Frequency bins → Energy calculation

**Features computed**:
- **Noise Level (dB)**: `20 * log10(RMS / RefPressure)`
  - RMS = Root Mean Square of audio samples
  - RefPressure = 20 µPa (hearing threshold)
  
- **Frequency Energy Distribution**:
  - Low (0-500 Hz): Bass, heavy machinery
  - Mid (500-4000 Hz): Speech, human voice
  - High (4000+ Hz): Sibilants, friction sounds

- **Volatility**: Standard deviation of noise level over time
  - High volatility = sudden noise events (impact)
  - Low volatility = sustained noise (fan, ambient)

#### Step 2: Classification (on PC)

**Using TensorFlow Model** (if available):
```javascript
const audioArray = Float32Array from raw audio
const prediction = await recognizer.listen(
  audioArray,
  { probabilityThreshold: 0.5 }
)
// Returns: { scores: {command: probability, ...}, spectrogram: {...} }
```

**Using Heuristic** (fallback):
```javascript
// Decision tree based on features:
if (volatility > 0.7 && noiseLevel > 70) {
  return 'impact_noise'  // Sudden loud events
}
if (midFreqEnergy > 0.5 && noiseLevel > 60) {
  return 'human_voice'   // Concentrated speech energy
}
if (lowFreqEnergy > 0.4 && noiseLevel > 50) {
  return 'mechanical'    // Sustained bass
}
if (noiseLevel < 30) {
  return 'silence'
}
return 'background'
```

### Confidence Scoring

**Confidence = (primary_score + fallback_score) / 2**
- **High (>0.8)**: Strong classification
- **Medium (0.5-0.8)**: Moderate confidence
- **Low (<0.5)**: Weak signal or ambiguous

### Noise Level Thresholds

| Level (dB) | Category | Action |
|----------|----------|--------|
| < 30 | Silence | Baseline |
| 30-55 | Normal | Monitor |
| 55-60 | Raised Speech | Warning |
| 65-70 | Loud Speech | Alert |
| **75+** | **Non-Speech/Mechanical** | **Emergency Alert** |

**Alert Trigger**: Noise level > 75 dB for > 3 seconds consecutive

---

## Installation & Setup

### Prerequisites
- **Node.js** 14+ with npm
- **Python 3.x** (for some native modules)
- **.NET SDK** (optional, for advanced serial tools)
- **WiFi-enabled ESP32** with INMP441 microphone

### Step 1: Install Dependencies
```bash
cd c:\finalsproject
npm install
```

**Installed Packages**:
- `electron` - Desktop framework
- `tensorflow/tfjs` - ML library
- `@tensorflow-models/speech-commands` - Pre-trained model
- `serialport` - Serial communication
- `ws` - WebSocket server
- `sql.js` - SQLite database

### Step 2: Configure ESP32 Firmware

1. **Edit esp32_inmp441_firmware_1.ino**:
   ```cpp
   #define WIFI_SSID "YOUR_NETWORK_NAME"
   #define WIFI_PASSWORD "YOUR_PASSWORD"
   #define SERVER_IP "192.168.x.x"  // Your PC's IP
   #define DEVICE_ID "esp32-001"
   ```

2. **Upload to ESP32**:
   - Use Arduino IDE
   - Board: ESP32 Dev Module
   - Baud: 115200
   - Partition scheme: Default

### Step 3: Configure PC Network

1. Find your PC's local IP:
   ```bash
   ipconfig  # Windows
   # Look for IPv4 Address (e.g., 192.168.1.100)
   ```

2. Update in ESP32 firmware: `#define SERVER_IP "YOUR_IP"`

### Step 4: Run Application
```bash
npm start
# or for development with auto-reload:
npm run dev
```

The app will:
1. Launch Electron window
2. Create WebSocket server on port 8080
3. Initialize SQLite database
4. Wait for device connections
5. Show login screen

### Step 5: Test

**Test Sound Classifier**:
```bash
node test_classifier.js
```

**Test Login Flow**:
```bash
node test_login_flow.js
```

---

## Data Flow

### Real-Time Monitoring Flow

```
1. ESP32 Capture Cycle (every 64ms @ 16 kHz):
   ┌─ Raw audio samples (1024 samples)
   ├─ I2S peripheral fetches from INMP441
   └─ Store in circular buffer

2. Feature Computation (every 1000ms):
   ┌─ Extract 2048 samples from buffer
   ├─ Compute noise level (dB)
   ├─ FFT analysis → frequency bins
   ├─ Calculate energy distribution
   ├─ Compute volatility
   └─ Pack into JSON

3. WiFi Transmission:
   ┌─ Connect to WiFi (if disconnected)
   ├─ Establish WebSocket to PC
   ├─ Send JSON packet
   └─ Await connection confirmation

4. PC Reception (main.js):
   ┌─ WebSocket server receives packet
   ├─ Parse JSON → validate device ID
   ├─ Sound classification (SoundClassifier)
   ├─ Database insert (noise_reports table)
   ├─ Check alert threshold
   ├─ Broadcast to Renderer via IPC
   └─ If alert → log to alerts_log table

5. UI Update (renderer.js):
   ┌─ Receive device-data IPC message
   ├─ Update device state object
   ├─ Add to Chart.js data
   ├─ Add to per-device history
   ├─ Redraw charts if needed
   ├─ Update gauge values
   └─ Show alert modal if triggered
```

### Multi-Device Chart System (New in v2.0)

**Chart Update Flow** (when device is selected):

```
Device Data Arrives → computeAndUpdateMetrics(ts)
        │
        ├─ If device is selected:
        │  ├─ updateHistoryChartsForDevice(deviceId)
        │  │  ├─ Get device's own history (dev.deviceHistory)
        │  │  ├─ Extract last 24-hour data → Daily chart
        │  │  ├─ Aggregate by day → Monthly chart
        │  │  └─ Update charts with device-specific data
        │
        └─ If no device selected:
           ├─ updateHistoryCharts()
           │  ├─ Use global state.history
           │  ├─ Show aggregate metrics
           │  └─ Update charts with all devices' data
```

**Per-Device History Management**:
- Each device maintains a `deviceHistory` array (max 2880 entries)
- History entries: `{ timestamp, avg, peak }`
- When new data arrives:
  - **Triggered sounds**: Immediately added to both global and per-device history
  - **Background readings**: Added every 10 samples to both histories
  - **Memory-efficient**: Old entries pruned when max size exceeded

**Chart Display Logic**:
1. **Live Noise Chart**: Shows real-time data for selected device only (multi-line, one per device)
2. **Daily Trend**: Last 24 hours of selected device's average & peak levels
3. **Monthly Overview**: Aggregated daily data for selected device
4. **Automatic Fallback**: If device has no history, uses global history as fallback

**Device Switching**:
- User clicks device tab → `selectDeviceTab(deviceId)` called
- → `updateChartsForDevice(deviceId)` filters live chart
- → `updateHistoryChartsForDevice(deviceId)` updates daily/monthly with device's history
- All charts update instantly to show selected device's data

### Database Update Flow

**Noise Reports Table**:
```sql
INSERT INTO noise_reports (
  device_id, device_name, timestamp, 
  average_level, peak_level, sound_type, duration_minutes
)
VALUES ('esp32-001', 'Device1', 1705779600000, 65.2, 78.5, 'human_voice', 5)
```

**Automatic Aggregation** (on demand):
- Daily summaries computed from hourly data
- Monthly overviews from daily summaries
- Avg/Peak calculations using SQL aggregates

**In-Memory History** (for charts):
- Global `state.history`: Aggregate data across all devices
- Per-device `deviceHistory`: Individual device trends
- Both updated in real-time as data arrives

---

## Database Schema

### Tables

#### **noise_reports** - Main data storage
```sql
CREATE TABLE noise_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,                 -- 'esp32-001'
  device_name TEXT,                        -- 'Device1'
  device_section TEXT,                     -- 'Main Hall', 'Reference Desk'
  timestamp INTEGER NOT NULL,              -- Unix milliseconds
  average_level REAL,                      -- dB (50-120)
  peak_level REAL,                         -- dB (peak in window)
  sound_type TEXT,                         -- 'human_voice', 'impact_noise'
  duration_minutes INTEGER,                -- How long noise was present
  notes TEXT,                              -- User notes
  user_feedback TEXT,                      -- 'correct', 'incorrect', or null
  corrected_sound_type TEXT,               -- User-provided correct classification
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes**:
- `idx_noise_reports_device` - Fast queries by device
- `idx_noise_reports_timestamp` - Time-range queries

#### **alerts_log** - Alert history
```sql
CREATE TABLE alerts_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  device_name TEXT,
  alert_type TEXT,                        -- 'HIGH_NOISE', 'CRITICAL'
  level REAL,                             -- dB level at alert time
  timestamp INTEGER NOT NULL,
  resolved INTEGER DEFAULT 0,             -- 0=active, 1=resolved
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes**:
- `idx_alerts_log_device`
- `idx_alerts_log_timestamp`

#### **daily_summaries** - Aggregated daily data
```sql
CREATE TABLE daily_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  device_name TEXT,
  date TEXT UNIQUE,                       -- 'YYYY-MM-DD'
  avg_noise REAL,                         -- Daily average dB
  peak_noise REAL,                        -- Daily peak dB
  total_alerts INTEGER,                   -- Alert count
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes**:
- `idx_daily_summaries_device`
- `idx_daily_summaries_date`

### Query Examples

**Get daily average noise**:
```sql
SELECT date, avg_noise, peak_noise
FROM daily_summaries
WHERE device_id = 'esp32-001'
  AND date >= DATE('now', '-7 days')
ORDER BY date DESC;
```

**Get active alerts**:
```sql
SELECT * FROM alerts_log
WHERE resolved = 0
ORDER BY timestamp DESC;
```

**Device performance metrics**:
```sql
SELECT 
  AVG(average_level) as avg_noise,
  MAX(peak_level) as peak_noise,
  COUNT(*) as sample_count
FROM noise_reports
WHERE device_id = 'esp32-001'
  AND timestamp > strftime('%s', 'now', '-1 day') * 1000;
```

---

## API Reference

### IPC API (Renderer ↔ Main)

#### Data Listeners
```javascript
// Listen for device updates
window.api.onDeviceData((device) => {
  console.log(device.deviceId, device.noiseLevel)
})

// Listen for alerts
window.api.onAlert((alert) => {
  console.log('Alert triggered:', alert.type, alert.level)
})

// Listen for device offline events
window.api.onDeviceOffline((deviceId) => {
  console.log(deviceId, 'went offline')
})

// Listen for network status
window.api.onNetworkStatus((status) => {
  console.log('Network:', status.connected ? 'Online' : 'Offline')
})
```

#### Database APIs
```javascript
// Save noise report
await window.api.saveNoiseReport({
  deviceId: 'esp32-001',
  noiseLevel: 65.2,
  soundType: 'human_voice',
  timestamp: Date.now()
})

// Log alert event
await window.api.logAlert({
  deviceId: 'esp32-001',
  alertType: 'HIGH_NOISE',
  level: 75.5,
  timestamp: Date.now()
})

// Query noise reports
const reports = await window.api.getNoiseReports({
  deviceId: 'esp32-001',
  startTime: Date.now() - 86400000,  // Last 24h
  limit: 100
})

// Get alerts history
const alerts = await window.api.getAlertsLog({
  deviceId: 'esp32-001',
  resolved: false  // Only active alerts
})

// Get daily summaries
const summaries = await window.api.getDailySummaries({
  deviceId: 'esp32-001',
  daysBack: 30
})

// Database statistics
const stats = await window.api.getDbStats()
// Returns: { totalReports, totalAlerts, diskUsage, ... }

// Delete old data
await window.api.deleteOldReports(30)  // Delete reports > 30 days old

// User Feedback APIs
await window.api.updateReportFeedback({
  reportId: 123,
  userFeedback: 'correct'  // 'correct', 'incorrect', or empty string to clear
})

await window.api.updateReportCorrectedType({
  reportId: 123,
  correctedSoundType: 'human_voice'  // User's corrected classification
})
```

#### Device APIs
```javascript
// Query all devices
const devices = await window.api.queryDevices()

// Update device location/section
await window.api.updateDeviceSection('esp32-001', 'Reference Desk')
```

#### WiFi APIs
```javascript
// Scan available networks
const networks = await window.api.scanWiFiNetworks()
// Returns: [{ ssid: 'Network1', signal: -50 }, ...]

// Connect to WiFi
await window.api.connectToWiFi('NetworkSSID', 'Password')

// Get current WiFi
const wifi = await window.api.getCurrentWiFi()
// Returns: { ssid: 'Connected...', ip: '192.168.1.100', ... }
```

#### Arduino APIs
```javascript
// Initialize Arduino communication
await window.api.initializeArduino()

// Get Arduino status
const status = await window.api.getArduinoStatus()
// Returns: { connected: true, port: 'COM3', ... }
```

### WebSocket API (ESP32 → PC)

**Server**: `ws://localhost:8080`

**Message Format**:
```json
{
  "deviceId": "esp32-001",
  "tableId": "Table-A",
  "timestamp": 1705779600000,
  "noiseLevel": 65.5,
  "audioFeatures": {
    "lowFreqEnergy": 0.25,
    "midFreqEnergy": 0.50,
    "highFreqEnergy": 0.25,
    "volatility": 0.35
  }
}
```

**Update Interval**: Every 1000ms (configurable on ESP32)

---

## Alert System

### Overview
The Alert System provides multi-channel notifications to library administrators when noise disturbances occur. It combines real-time visual alerts with audio notifications to ensure immediate awareness.

### Alert Triggers
- **Noise Exceeds Threshold**: When device detects noise level > 55 dB
- **Sensor Malfunction**: When one device reports high noise but peer devices are quiet
- **Device Offline**: When a device hasn't reported in 45+ seconds

### Alert Components

#### 1. **Visual Alert Display** (alert_demo.html)
- **Location**: Separate full-screen window (typically on secondary display)
- **Content**: 
  - Alert title (e.g., "⚠️ Noise Disturbance at Reference Desk")
  - Device and noise level information
  - Timestamp of alert occurrence
- **Auto-close**: Alert dismisses after 4 seconds
- **Manual dismiss**: Admin can click close button
- **Styling**: Glass-morphism design with high-contrast colors for visibility

#### 2. **Audio Notification** (Web Audio API)
- **Trigger**: Plays automatically when visual alert appears
- **Sound Composition**:
  ```
  First Beep:   800Hz → 1000Hz (500ms) with smooth fade in/out
  Pause:        300ms
  Second Beep:  600Hz → 800Hz (300ms) with smooth fade in/out
  ```
- **Volume**: Comfortable level (~30% system volume) to get attention without causing discomfort
- **Type**: Sine wave oscillator for smooth, non-harsh tone
- **Accessibility**: Gracefully degrades if audio context unavailable

#### 3. **UI Alerts Sidebar** (renderer.js)
- **Location**: Left sidebar in main dashboard
- **Display**: List of recent alerts with timestamps
- **Clear Function**: Button to dismiss all alerts from view
- **Real-time Updates**: Alerts appear instantly as they occur

### Alert Throttling
- **Rate Limit**: Maximum 1 alert per device every 2 seconds (ALERT_THROTTLE_MS = 2000)
- **Purpose**: Prevents alert fatigue from repeated notifications
- **Implementation**: Per-device lastAlertTime tracking

### Alert Data Storage
Alerts are logged to the `alerts_log` table with:
```javascript
{
  device_id: "esp32-001",
  device_name: "Device1",
  alert_type: "noise_exceed",      // Type of alert
  level: 65.5,                      // Noise level at alert time
  timestamp: 1705779600000,         // When alert occurred
  resolved: 0                       // 0=active, 1=resolved
}
```

### Alert Workflow
```
Device sends high noise data
    ↓
Main process receives via WebSocket
    ↓
Compares with NOISE_THRESHOLD (55dB)
    ↓
If exceeded AND throttle time passed:
    ├─ Log to alerts_log table
    ├─ Send to Renderer (UI sidebar update)
    └─ Send to Alert Window (visual + audio notification)
    ↓
Alert displays for 4 seconds
    ├─ Sound plays (dual-tone beep)
    ├─ Visual modal shown
    └─ Sidebar updates in real-time
    ↓
Auto-dismiss or manual close
    ↓
Data persisted in database for historical review
```

### Configuration

**Noise Threshold** (main.js):
```javascript
const NOISE_THRESHOLD = 55;  // Alert at 55dB and above
const ALERT_THROTTLE_MS = 2000;  // Max 1 alert per 2 seconds per device
const INACTIVITY_MS = 45_000;  // Device offline if no update in 45s
```

### Testing Alerts
To test the alert system:
1. Run `npm start`
2. Connect an ESP32 device (or use test data)
3. Trigger noise above 55dB
4. Observe:
   - Visual alert modal appears on alert window
   - Audio notification plays (dual-tone beep)
   - Alert added to sidebar
   - Data logged in alerts table

### Troubleshooting

**Alert not playing sound**:
- Check browser audio permissions
- Ensure system volume is not muted
- Try clicking anywhere on the page to activate audio context (some browsers require user interaction)

**Alert modal not showing**:
- Verify alert_demo.html is accessible
- Check that secondary display/window is visible
- Review browser console for errors

**Alerts not triggering**:
- Verify device is connected and sending data
- Check that noise level exceeds 55dB threshold
- Confirm throttle time has elapsed (2 seconds minimum between alerts)

---

## Configuration Reference

### ESP32 Firmware Config
```cpp
// WiFi
#define WIFI_SSID "Your_Network"
#define WIFI_PASSWORD "Your_Password"
#define SERVER_IP "192.168.x.x"
#define SERVER_PORT 8080

// Audio
#define SAMPLE_RATE 16000       // Hz
#define MIC_GAIN 1.5            // Amplification factor
#define ALERT_THRESHOLD_DB 55   // Alert at 55dB+
#define NOISE_FLOOR_DB 18.0     // Silence threshold

// Update frequency
#define UPDATE_INTERVAL_MS 1000 // Send every 1 second
```

### PC Application Config
**Default Values** (set in code):
- WebSocket port: `8080`
- Database path: `~/.config/smart-noise-monitor/reports.db`
- Login credentials: Hardcoded (see main.js for validation)
- Noise threshold: `55 dB` (in ALERT_INTEGRATION_EXAMPLES.js)

---

## User Feedback System

### Overview
The user feedback integration allows library staff to validate and correct AI-generated sound classifications directly in the reports table. This feedback is stored in the database to improve model accuracy over time.

### Features

#### Thumbs Up/Down Feedback
- Click **👍** to mark a classification as correct
- Click **👎** to mark a classification as incorrect
- Buttons are togglable (click again to deselect)
- Feedback is automatically saved to the database

**Visual States**:
- **Inactive**: Gray with transparent background
- **Active (Correct)**: Cyan glow
- **Active (Incorrect)**: Red glow

#### Corrected Sound Type Field
- Text input field for users to enter the correct sound classification
- Saved on blur/change event
- Supports any text input (allows future classification additions)

### Database Columns
Two new columns track user feedback in the `noise_reports` table:

1. **user_feedback** (TEXT)
   - Values: `'correct'`, `'incorrect'`, or NULL
   - Used to track if classification was validated by user

2. **corrected_sound_type** (TEXT)
   - User-provided correct sound type
   - Useful for retraining models with ground truth labels

### UI Implementation
The Reports view displays feedback controls for each report row:

```
| Date | Time | Section | Device | Avg | Peak | Sound Type | [Feedback] | [Corrected Type] |
|------|------|---------|--------|-----|------|------------|------------|------------------|
| ... | ... | ... | ... | ... | ... | human_voice | 👍 👎 | [Type here...]   |
```

### IPC APIs

**Update feedback (thumbs up/down)**:
```javascript
await window.api.updateReportFeedback({
  reportId: 123,
  userFeedback: 'correct'  // or 'incorrect', or '' to clear
});
```

**Update corrected classification**:
```javascript
await window.api.updateReportCorrectedType({
  reportId: 123,
  correctedSoundType: 'mechanical_sound'
});
```

### Backend Implementation

#### Main Process Handlers (`main.js`)
```javascript
ipcMain.handle('update-report-feedback', (event, { reportId, userFeedback }) => {
  // Updates the user_feedback column
  db.run(`UPDATE noise_reports SET user_feedback = ? WHERE id = ?`, 
    [userFeedback || null, reportId]);
  saveDatabase();
  return { success: true };
});

ipcMain.handle('update-report-corrected-type', (event, { reportId, correctedSoundType }) => {
  // Updates the corrected_sound_type column
  db.run(`UPDATE noise_reports SET corrected_sound_type = ? WHERE id = ?`, 
    [correctedSoundType || null, reportId]);
  saveDatabase();
  return { success: true };
});
```

#### Preload Bridge (`preload.js`)
Exposes the feedback APIs to the renderer process:
```javascript
updateReportFeedback: (data) => ipcRenderer.invoke('update-report-feedback', data),
updateReportCorrectedType: (data) => ipcRenderer.invoke('update-report-corrected-type', data),
```

#### Frontend Handlers (`renderer.js`)
- `handleFeedback(event, reportId, feedbackValue)` - Handles button clicks, toggles active state, saves feedback
- `handleCorrectedType(event, reportId)` - Handles text input changes, saves corrected type
- `displayReports(reports)` - Renders feedback buttons and input fields for each report

### Styling (`styles.css`)

**Feedback Buttons**:
- `.feedback-buttons` - Flex container with 0.5rem gap
- `.feedback-btn` - Button styling with hover effects
- `.feedback-btn.active` - Cyan highlight for correct, red for incorrect

**Input Field**:
- `.corrected-type-input` - Text input with dark theme styling
- Max-width: 150px for table layout
- Focus state shows cyan border and glow effect

### Future Enhancements
- [ ] Analytics dashboard showing feedback accuracy rates
- [ ] Batch feedback actions (select multiple reports)
- [ ] Feedback history and audit trail
- [ ] ML model retraining pipeline using feedback data
- [ ] Feedback statistics per device/section
- [ ] Export corrected classifications for model improvement

---

## Troubleshooting

### ESP32 Not Connecting
1. Verify WiFi SSID/password in firmware
2. Check PC firewall allows port 8080
3. Confirm PC IP matches SERVER_IP in firmware
4. Use serial monitor to see ESP32 debug output

### Sound Classification Inaccurate
1. Verify INMP441 wiring (check I2S pins)
2. Adjust MIC_GAIN in ESP32 firmware if levels are too low
3. Ensure internet connection for TensorFlow model download
4. Check preload.js for model loading errors

### Database Not Persisting
1. Check file permissions in `~/.config/` directory
2. Verify disk space available
3. Check for SQL errors in console logs

### Charts Not Updating
1. Verify WebSocket connection in network tab
2. Check IPC message delivery in DevTools (Ctrl+Shift+I)
3. Ensure Chart.js library loaded from CDN

---

## Performance Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Audio Sample Rate | 16 kHz | Adequate for speech analysis |
| Feature Computation | ~1000ms | Per-device cycle time |
| WebSocket Latency | <100ms | Local network typical |
| Database Insert | <10ms | Using sql.js in-memory |
| UI Update Latency | <50ms | Canvas redraw |
| Model Inference | 50-100ms | TensorFlow.js on CPU |
| Total E2E Latency | ~1.5s | Capture → Alert display |

---

## Future Enhancements

- [ ] Noise pattern learning (predict peak hours)
- [ ] Multi-language alert messages
- [ ] Cloud backup of reports
- [ ] Mobile app for remote monitoring
- [ ] Advanced analytics dashboard
- [ ] Integration with library management systems
- [ ] Sound type-specific thresholds
- [ ] Automated noise trend reports

---

## License

MIT License - See package.json

## Support & Documentation

For detailed configuration guides, see the respective file headers:
- `main.js` - Main process architecture
- `renderer.js` - UI component guide
- `sound_classifier.js` - ML model usage
- `esp32_inmp441_firmware_1.ino` - Hardware setup

---

**Last Updated**: January 25, 2026
**System Version**: 0.2.0
**Documentation Version**: 1.1

### Recent Changes (v0.2.0)
- Added User Feedback Integration - thumbs up/down validation buttons
- Added Corrected Sound Type field for user-provided classifications
- Enhanced noise_reports table with user_feedback and corrected_sound_type columns
- Integrated feedback IPC APIs and database handlers
**Documentation Version**: 1.0
