/**
 * ESP32 + INMP441 Audio Processing Firmware
 * 
 * Features:
 * - Captures audio from INMP441 digital microphone via I2S
 * - Computes noise level (dB), frequency features, and volatility
 * - Sends classified audio data to PC via WebSocket
 * - Compatible with existing Sound Classifier on PC
 * 
 * Hardware Setup:
 * INMP441 Pin → ESP32 Pin
 * - SD (serial data)   → GPIO 32 (I2S_IN_DATA)
 * - WS (word select)   → GPIO 25 (I2S_IN_CLK)
 * - SCK (bit clock)    → GPIO 33 (I2S_IN_CLK)
 * - L/R (left/right)   → GND (mono mode)
 * - VDD                → 3.3V
 * - GND                → GND
 * 
 * WiFi Configuration:
 * - Update WIFI_SSID and WIFI_PASSWORD below
 * - Update SERVER_IP (your PC's local IP)
 * 
 * Data Format (sent every 2-3 seconds):
 * {
 *   "deviceId": "esp32-001",
 *   "tableId": "Table-A",
 *   "noiseLevel": 65,
 *   "audioFeatures": {
 *     "lowFreqEnergy": 0.25,
 *     "midFreqEnergy": 0.50,
 *     "highFreqEnergy": 0.25,
 *     "volatility": 0.35
 *   },
 *   "timestamp": 1705779600000
 * }
 */

#include <driver/i2s.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <math.h>

// ==================== CONFIGURATION ====================
// WiFi
#define WIFI_SSID "TECNO POVA 5 Pro 5G"
#define WIFI_PASSWORD "123446789"  // UPDATE WITH YOUR NETWORK PASSWORD
#define SERVER_IP "10.25.163.5"  // Your PC's local IP address (new network)
#define SERVER_PORT 8080
#define WS_PATH "/"

// Device Identity
#define DEVICE_ID "esp32-001"
#define TABLE_ID "Table-A"

// Audio Processing
#define SAMPLE_RATE 16000
#define I2S_BUFFER_SIZE 2048
#define ANALYSIS_WINDOW_SIZE 2048  // Reduced from 4096 for faster response (128ms instead of 256ms)
#define UPDATE_INTERVAL_MS 1000    // Send data every 1 second for real-time responsiveness

// I2S Pins (adjust if needed)
#define I2S_SD_PIN 32   // Serial Data (DOUT on INMP441)
#define I2S_WS_PIN 25   // Word Select (WS on INMP441)
#define I2S_SCK_PIN 33  // Bit Clock (SCK on INMP441)

// Microphone calibration (adjust to match your audio levels)
#define MIC_GAIN 1.5    // Gain factor for audio amplification (1.0-2.0 range). Reduced from 28.0 to prevent false alarms.
#define REF_PRESSURE 20e-6  // Reference pressure for dB calculation (20 µPa)
#define NOISE_FLOOR_DB 18.0  // Noise floor threshold - true silence will be below this. Reduced from 28.0 to avoid baseline inflation.
#define ALERT_THRESHOLD_DB 55  // Alert triggers at 55dB and above. Below 54dB will NOT trigger alerts.

// ==================== GLOBAL VARIABLES ====================
WebSocketsClient webSocket;
unsigned long lastSendTime = 0;
int16_t audioBuffer[I2S_BUFFER_SIZE];
float analysisBuf[ANALYSIS_WINDOW_SIZE];
int analysisBufIndex = 0;

// For volatile calculation (tracks recent noise level changes)
float recentNoiseHistory[10];
int noiseHistoryIdx = 0;

// Status
volatile bool wifiConnected = false;
volatile bool wsConnected = false;

// ==================== SETUP ====================
void setup() {
  Serial.begin(115200);
  delay(100);
  
  Serial.println("\n\n========================================");
  Serial.println("ESP32 + INMP441 Audio System Starting...");
  Serial.println("========================================");
  
  // Initialize I2S
  initI2S();
  
  // Initialize WiFi
  connectToWiFi();
  
  // Initialize WebSocket
  initWebSocket();
  
  // Initialize history
  memset(recentNoiseHistory, 0, sizeof(recentNoiseHistory));
}

// ==================== I2S INITIALIZATION ====================
void initI2S() {
  Serial.println("[I2S] Initializing I2S for INMP441...");
  
  // Uninstall if already installed
  i2s_driver_uninstall(I2S_NUM_0);
  delay(100);
  
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S,  // Changed: standard I2S format for INMP441
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = 1024,
    .use_apll = true,  // ENABLE APLL for better clock accuracy
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };
  
  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK_PIN,      // Bit clock
    .ws_io_num = I2S_WS_PIN,        // Word select
    .data_out_num = I2S_PIN_NO_CHANGE,  // Not used (RX mode)
    .data_in_num = I2S_SD_PIN       // Serial data in
  };
  
  esp_err_t err = i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  if (err != ESP_OK) {
    Serial.printf("✗ I2S install failed: %d\n", err);
    return;
  }
  
  err = i2s_set_pin(I2S_NUM_0, &pin_config);
  if (err != ESP_OK) {
    Serial.printf("✗ I2S pin config failed: %d\n", err);
    return;
  }
  
  Serial.println("✓ I2S initialized successfully");
  Serial.println("  - Sample Rate: 16000 Hz");
  Serial.println("  - Bits Per Sample: 16-bit");
  Serial.println("  - Channel: Mono (Left)");
  Serial.println("  - APLL: ENABLED (better clock accuracy)");
  Serial.println("  - Pins - SCK:" + String(I2S_SCK_PIN) + " WS:" + String(I2S_WS_PIN) + " SD:" + String(I2S_SD_PIN));
}

// ==================== WiFi FUNCTIONS ====================
void connectToWiFi() {
  Serial.println("[WiFi] Connecting to WiFi: " + String(WIFI_SSID));
  Serial.println("[WiFi] Password: (hidden for security)");
  Serial.println("[WiFi] Powering down radio and reconnecting...");
  
  // Full reset
  WiFi.disconnect(true);  // Turn off radio
  delay(1000);
  
  // Configure WiFi with optimized settings for 5GHz compatibility
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);  // Disable sleep for more stable connection
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);  // Don't save to flash for faster reconnects
  
  delay(500);
  
  Serial.println("[WiFi] Attempting connection (attempt 1/3)...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  // First attempt with 30 second timeout (reduced from 60)
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    if (attempts % 4 == 0) Serial.print(".");
    int status = WiFi.status();
    if (attempts % 6 == 0) {
      Serial.println(" [" + String(attempts/2) + "s, Status: " + String(status) + "]");
    }
    attempts++;
  }
  
  // If first attempt failed, try again
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n[WiFi] First attempt failed. Trying again (attempt 2/3)...");
    WiFi.disconnect();
    delay(1000);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
      delay(500);
      if (attempts % 4 == 0) Serial.print(".");
      attempts++;
    }
  }
  
  // If still not connected, try third time
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n[WiFi] Second attempt failed. Final attempt (attempt 3/3)...");
    WiFi.disconnect();
    delay(1000);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
      delay(500);
      if (attempts % 4 == 0) Serial.print(".");
      attempts++;
    }
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\n✓ WiFi connected!");
    Serial.println("  - SSID: " + String(WiFi.SSID()));
    Serial.println("  - IP: " + WiFi.localIP().toString());
    Serial.println("  - RSSI: " + String(WiFi.RSSI()) + " dBm");
    Serial.println("  - Channel: " + String(WiFi.channel()));
  } else {
    Serial.println("\n✗ WiFi connection failed after 3 attempts!");
    Serial.println("  - Status Code: " + String(WiFi.status()));
    Serial.println("  - Status: 0=IDLE, 1=NO_SSID, 2=SCAN, 3=CONNECTED, 4=FAIL, 5=LOST, 6=DISCONNECTED");
    Serial.println("  - Troubleshooting:");
    Serial.println("    1. Verify password is correct");
    Serial.println("    2. Check if network is in range and broadcasting");
    Serial.println("    3. Try connecting from laptop to verify credentials");
    Serial.println("    4. Some ESP32s have issues with 5GHz - check board compatibility");
    Serial.println("    5. Restart ESP32 and retry");
  }
}

// ==================== WebSocket FUNCTIONS ====================
void initWebSocket() {
  if (!wifiConnected) {
    Serial.println("[WS] Skipping WebSocket init (WiFi not connected)");
    return;
  }
  
  Serial.println("[WS] Initializing WebSocket...");
  Serial.println("  - Server: ws://" + String(SERVER_IP) + ":" + String(SERVER_PORT));
  Serial.println("  - Path: " + String(WS_PATH));
  Serial.println("  - Attempting connection...");
  
  // Configure WebSocket with all compatible settings
  webSocket.begin(SERVER_IP, SERVER_PORT, WS_PATH);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(3000);  // Try to reconnect every 3 seconds
  webSocket.enableHeartbeat(15000, 3000, 2);  // Send heartbeat every 15s, timeout after 3s
  
  Serial.println("✓ WebSocket client configured");
  Serial.println("  - Reconnect interval: 3000ms");
  Serial.println("  - Heartbeat enabled");
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      wsConnected = false;
      Serial.println("[WS] Disconnected from server");
      Serial.println("  - WiFi Status: " + String(WiFi.status()));
      Serial.println("  - Attempting to reconnect...");
      break;
      
    case WStype_CONNECTED:
      wsConnected = true;
      Serial.println("[WS] ✓ Connected to server");
      Serial.println("  - Ready to send audio data");
      Serial.println("  - Sending data every " + String(UPDATE_INTERVAL_MS) + " ms");
      break;
      
    case WStype_TEXT:
      Serial.println("[WS] Message from server: " + String((char*)payload));
      break;
      
    case WStype_ERROR:
      Serial.println("[WS] Connection Error!");
      Serial.println("  - Error: " + String((char*)payload));
      Serial.println("  - Verify: Server IP (" + String(SERVER_IP) + "), Port (" + String(SERVER_PORT) + ")");
      Serial.println("  - Verify: PC and ESP32 are on same WiFi network");
      Serial.println("  - Verify: Firewall allows port " + String(SERVER_PORT));
      break;
      
    default:
      break;
  }
}

// ==================== AUDIO CAPTURE & ANALYSIS ====================
void captureAndAnalyzeAudio() {
  size_t bytesRead = 0;
  
  // Read samples from I2S with timeout to prevent watchdog reset
  // Use 100ms timeout instead of portMAX_DELAY to avoid hanging
  esp_err_t err = i2s_read(I2S_NUM_0, audioBuffer, I2S_BUFFER_SIZE * 2, &bytesRead, 100 / portTICK_PERIOD_MS);
  
  if (err != ESP_OK) {
    Serial.printf("[I2S_ERROR] Read failed: %d\n", err);
    return;  // Skip this cycle if read fails
  }
  
  int samplesRead = bytesRead / 2; // Convert bytes to samples (16-bit)
  
  // Add samples to analysis buffer
  for (int i = 0; i < samplesRead && analysisBufIndex < ANALYSIS_WINDOW_SIZE; i++) {
    float sample = (float)audioBuffer[i] / 32768.0f;  // Normalize to -1.0 to 1.0
    sample *= MIC_GAIN;  // Apply gain
    analysisBuf[analysisBufIndex++] = sample;
  }
  
  // When buffer is full, analyze and send
  if (analysisBufIndex >= ANALYSIS_WINDOW_SIZE) {
    analyzeAudioFeatures();
    analysisBufIndex = 0;  // Reset for next window
  }
}

void analyzeAudioFeatures() {
  unsigned long currentTime = millis();
  
  if (currentTime - lastSendTime < UPDATE_INTERVAL_MS) {
    return;  // Not time to send yet
  }
  
  lastSendTime = currentTime;
  
  // ===== DEBUG: Check raw sample values =====
  float maxSample = 0.0;
  float minSample = 0.0;
  for (int i = 0; i < ANALYSIS_WINDOW_SIZE; i++) {
    if (analysisBuf[i] > maxSample) maxSample = analysisBuf[i];
    if (analysisBuf[i] < minSample) minSample = analysisBuf[i];
  }
  float peakAmplitude = (maxSample > -minSample) ? maxSample : -minSample;
  Serial.printf("[RAW_DATA] Peak: %.6f | Range: [%.6f to %.6f]\n", peakAmplitude, minSample, maxSample);
  
  // Calculate RMS (noise level)
  float rms = calculateRMS(analysisBuf, ANALYSIS_WINDOW_SIZE);
  Serial.printf("[RMS_CALC] RMS Value: %.6f (raw), %.2f dB (before floor)\n", rms, rms2dB(rms));
  
  float noiseLevel = rms2dB(rms);
  Serial.printf("[NOISE_LEVEL] Raw (unclamped): %.1f dB\n", noiseLevel);
  // Only clamp extreme values, not the floor
  noiseLevel = constrain(noiseLevel, 0, 120);
  
  // If below noise floor, treat as silence
  if (noiseLevel < NOISE_FLOOR_DB) {
    Serial.printf("[NOISE_FLOOR] %.1f < %.1f (floor) → setting to 12 dB (silence)\n", noiseLevel, NOISE_FLOOR_DB);
    noiseLevel = 12.0;  // True silence level - won't trigger 55dB alert threshold
  }
  
  // Calculate frequency features
  float lowFreq, midFreq, highFreq;
  calculateFrequencyBands(analysisBuf, ANALYSIS_WINDOW_SIZE, lowFreq, midFreq, highFreq);
  
  // Calculate volatility (how much the noise level is changing)
  float volatility = calculateVolatility(noiseLevel);
  
  // Print debug info
  printAudioStats(noiseLevel, lowFreq, midFreq, highFreq, volatility);
  
  // Send via WebSocket
  sendAudioDataToPC(noiseLevel, lowFreq, midFreq, highFreq, volatility);
}

float calculateRMS(float* samples, int count) {
  float sum = 0.0;
  for (int i = 0; i < count; i++) {
    float s = samples[i];
    sum += s * s;
  }
  return sqrt(sum / count);
}

float rms2dB(float rms) {
  if (rms < 1e-6) return 30.0;  // Silence floor
  return 20.0 * log10(rms / REF_PRESSURE);
}

void calculateFrequencyBands(float* samples, int count, float& lowFreq, float& midFreq, float& highFreq) {
  /**
   * Improved frequency analysis using zero-crossing rate and spectral characteristics
   * 
   * Zero-crossing rate (ZCR) indicates frequency content:
   * - Low ZCR → mostly low frequencies (footsteps, bass, door slam)
   * - High ZCR → mostly high frequencies (sibilants, clap)
   * - Medium ZCR → voice/speech
   * 
   * Impact noise (claps) characteristics:
   * - High frequency content (hand clap has lots of high-freq)
   * - High ZCR (rapid oscillations in burst)
   * - Quick onset then decay
   */
  
  // Method: Use zero-crossing rate + spectral energy distribution
  float zcr = 0; // Zero crossing rate
  
  for (int i = 1; i < count; i++) {
    if ((samples[i] >= 0 && samples[i-1] < 0) || (samples[i] < 0 && samples[i-1] >= 0)) {
      zcr++;
    }
  }
  zcr = zcr / (count - 1);  // Normalize: 0 to 1
  
  // Analyze energy change rate in different frequency bands
  float low_energy = 0, mid_energy = 0, high_energy = 0;
  
  // Low frequency: slow amplitude changes (large chunks = 4 samples apart)
  for (int i = 0; i < count - 1; i += 4) {
    low_energy += abs(samples[i+1] - samples[i]);
  }
  
  // Mid frequency: medium amplitude changes (2 samples apart)
  for (int i = 0; i < count - 2; i += 2) {
    mid_energy += abs(samples[i+2] - samples[i]);
  }
  
  // High frequency: fast amplitude changes (neighboring samples = rapid oscillation)
  for (int i = 1; i < count; i++) {
    high_energy += abs(samples[i] - samples[i-1]);
  }
  
  // Combine ZCR with energy analysis
  float total = low_energy + mid_energy + high_energy;
  
  if (total > 0) {
    // Impact noise: High ZCR (hand clap oscillates fast) + High energy change rate (burst)
    // Voice: Medium ZCR + Medium energy
    // Footsteps: Low ZCR (low frequency) + Low-Medium energy
    lowFreq = (low_energy / total) * 0.6 + (1.0 - zcr) * 0.4;   // More weight to energy
    highFreq = (high_energy / total) * 0.6 + zcr * 0.4;         // More weight to energy
    midFreq = 1.0 - lowFreq - highFreq;
    
    // Clamp to 0-1
    lowFreq = constrain(lowFreq, 0.0, 1.0);
    midFreq = constrain(midFreq, 0.0, 1.0);
    highFreq = constrain(highFreq, 0.0, 1.0);
    
    // Normalize to sum to 1.0
    float sum = lowFreq + midFreq + highFreq;
    if (sum > 0) {
      lowFreq /= sum;
      midFreq /= sum;
      highFreq /= sum;
    }
  } else {
    lowFreq = midFreq = highFreq = 0.33;
  }
  
  // Debug: print ZCR value occasionally
  static int debugCounter = 0;
  if (debugCounter++ % 100 == 0) {
    Serial.printf("[DEBUG] ZCR: %.3f | Low:%.2f Mid:%.2f High:%.2f\n", zcr, lowFreq, midFreq, highFreq);
  }
}

float calculateVolatility(float currentNoise) {
  // Shift history
  for (int i = 9; i > 0; i--) {
    recentNoiseHistory[i] = recentNoiseHistory[i-1];
  }
  recentNoiseHistory[0] = currentNoise;
  
  // For impact detection: Look for sudden spikes (claps have sharp onset)
  float recentAvg = 0;
  for (int i = 1; i < 10; i++) {  // Average of older samples (baseline)
    recentAvg += recentNoiseHistory[i];
  }
  recentAvg /= 9;
  
  // Peak difference from baseline - THIS DETECTS CLAPS BETTER
  float peakDiff = abs(currentNoise - recentAvg);
  
  // Calculate standard deviation for steady variations (speech)
  float mean = 0;
  for (int i = 0; i < 10; i++) {
    mean += recentNoiseHistory[i];
  }
  mean /= 10;
  
  float variance = 0;
  for (int i = 0; i < 10; i++) {
    float diff = recentNoiseHistory[i] - mean;
    variance += diff * diff;
  }
  variance /= 10;
  
  float stdDev = sqrt(variance);
  
  // Volatility = combination of spike detection + steady variation
  // Impacts (claps) have HIGH spike (sudden onset) and LOW steady variation
  // Speech has MEDIUM spike and HIGH steady variation
  float spikeVolatility = peakDiff / 20.0;  // Normalized spike (increased sensitivity)
  float steadyVolatility = stdDev / 25.0;   // Normalized steady variation
  
  // Weighted: 70% spike detection (for impacts/claps), 30% steady variation
  float volatility = (spikeVolatility * 0.70) + (steadyVolatility * 0.30);
  
  return constrain(volatility, 0.0, 1.0);
}

void printAudioStats(float noiseLevel, float lowFreq, float midFreq, float highFreq, float volatility) {
  Serial.printf("[AUDIO] Noise: %.1f dB | Freq[Low:%.2f Mid:%.2f High:%.2f] | Volatility: %.2f\n",
    noiseLevel, lowFreq, midFreq, highFreq, volatility);
}

// ==================== DATA TRANSMISSION ====================
void sendAudioDataToPC(float noiseLevel, float lowFreq, float midFreq, float highFreq, float volatility) {
  if (!wsConnected) {
    Serial.println("[SEND] WebSocket not connected, skipping send");
    return;
  }
  
  // Create JSON payload
  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["tableId"] = TABLE_ID;
  doc["noiseLevel"] = (int)round(noiseLevel);
  
  JsonObject features = doc.createNestedObject("audioFeatures");
  features["lowFreqEnergy"] = lowFreq;
  features["midFreqEnergy"] = midFreq;
  features["highFreqEnergy"] = highFreq;
  features["volatility"] = volatility;
  
  doc["timestamp"] = millis() + 1705779600000;  // Approximate Unix timestamp
  
  // Serialize and send
  String payload;
  serializeJson(doc, payload);
  
  webSocket.sendTXT(payload);
  
  Serial.println("[SEND] ✓ Data sent: " + payload);
}

// ==================== SERIAL COMMAND HANDLER ====================

void handleSerialCommands() {
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    
    if (command.startsWith("WIFI_CONFIG|")) {
      handleWiFiConfig(command);
    } else if (command == "GET_STATUS") {
      sendStatus();
    } else if (command == "RESTART") {
      Serial.println("RESTART: Restarting ESP32...");
      delay(1000);
      ESP.restart();
    }
  }
}

void handleWiFiConfig(String command) {
  // Parse: WIFI_CONFIG|SSID|PASSWORD
  int firstDelim = command.indexOf('|');
  int secondDelim = command.indexOf('|', firstDelim + 1);
  
  if (firstDelim == -1 || secondDelim == -1) {
    Serial.println("ERROR: Invalid format. Use: WIFI_CONFIG|SSID|PASSWORD");
    return;
  }
  
  String newSSID = command.substring(firstDelim + 1, secondDelim);
  String newPassword = command.substring(secondDelim + 1);
  
  Serial.println("[WIFI_CONFIG] Received new WiFi credentials");
  Serial.println("  SSID: " + newSSID);
  
  // Create masked password for display
  String maskedPassword = "";
  for (int i = 0; i < newPassword.length(); i++) {
    maskedPassword += "*";
  }
  Serial.println("  Password: " + maskedPassword);
  
  // Disconnect current WiFi
  WiFi.disconnect(true); // true = turn off WiFi radio
  delay(500);
  
  // Connect with new credentials
  Serial.println("[WIFI_CONFIG] Connecting to new network...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(newSSID.c_str(), newPassword.c_str());
  
  // Wait for connection
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✓ WiFi Connected!");
    Serial.println("  SSID: " + String(WiFi.SSID()));
    Serial.println("  IP: " + WiFi.localIP().toString());
    Serial.println("OK");
    wifiConnected = true;
    
    // Reconnect WebSocket with new connection
    initWebSocket();
  } else {
    Serial.println("\n✗ Failed to connect to WiFi");
    Serial.println("ERROR");
    wifiConnected = false;
  }
}

void sendStatus() {
  StaticJsonDocument<200> doc;
  doc["device"] = DEVICE_ID;
  doc["table"] = TABLE_ID;
  doc["wifi_connected"] = wifiConnected;
  doc["ws_connected"] = wsConnected;
  
  if (wifiConnected) {
    doc["ssid"] = WiFi.SSID();
    doc["ip"] = WiFi.localIP().toString();
    doc["signal"] = WiFi.RSSI();
  }
  
  String jsonStr;
  serializeJson(doc, jsonStr);
  Serial.println(jsonStr);
}

// ==================== MAIN LOOP ====================
unsigned long lastStatusCheck = 0;

void loop() {
  // Feed watchdog timer to prevent resets
  vTaskDelay(1 / portTICK_PERIOD_MS);
  
  // Handle incoming serial commands from PC first (highest priority)
  handleSerialCommands();
  
  // Handle WebSocket connection (non-blocking)
  webSocket.loop();
  
  // Print connection status every 10 seconds
  unsigned long now = millis();
  if (now - lastStatusCheck > 10000) {
    lastStatusCheck = now;
    if (wsConnected) {
      Serial.println("[STATUS] ✓ WebSocket CONNECTED - Ready to send");
    } else {
      Serial.println("[STATUS] ✗ WebSocket DISCONNECTED - Attempting reconnect...");
      Serial.println("        WiFi: " + String(WiFi.status() == WL_CONNECTED ? "OK" : "FAILED"));
      Serial.println("        Server: ws://" + String(SERVER_IP) + ":" + String(SERVER_PORT));
    }
  }
  
  // Capture audio data
  captureAndAnalyzeAudio();
  
  // Prevent watchdog timeout - small delay
  delay(5);
}

/**
 * NOTES FOR PRODUCTION:
 * 
 * 1. For better frequency analysis, use the ArduinoFFT library:
 *    #include "arduinoFFT.h"
 *    This will give much more accurate classification
 * 
 * 2. If audio quality is poor:
 *    - Adjust MIC_GAIN
 *    - Verify I2S pin connections
 *    - Check INMP441 power supply (should be clean 3.3V)
 *    - Add capacitors near power pins
 * 
 * 3. WiFi/WebSocket troubleshooting:
 *    - Verify server IP address
 *    - Ensure PC and ESP32 are on same network
 *    - Check firewall allows port 8080
 *    - Monitor Serial output for connection status
 * 
 * 4. Feature calibration:
 *    - The frequency bands are approximated for speed
 *    - With ArduinoFFT, you can do proper frequency binning
 *    - Volatility calculation assumes typical noise range of 30-120 dB
 * 
 * 5. Power consumption:
 *    - WiFi + I2S + processing ~150-200 mA
 *    - Use 5V USB power for stability
 *    - Battery operation requires low-power optimization
 */
