// Simple device simulator that connects to ws://localhost:8080
// Usage: node device_simulator.js <deviceId> <tableId>
const WebSocket = require('ws');

const args = process.argv.slice(2);
const deviceId = args[0] || 'dev1';
const tableId = args[1] || 'Table-A';
// optional third argument: full ws url, or use WS_URL env var, else default to localhost:8080
const url = args[2] || process.env.WS_URL || 'ws://localhost:8080';

console.log(`Attempting to connect to ${url} as device ${deviceId}...`);

const ws = new WebSocket(url);

/**
 * Generate realistic audio feature patterns
 * This simulates actual audio analysis from a microphone
 */
function generateAudioFeatures() {
  // Randomly choose an activity pattern
  const patterns = [
    // Pattern 1: Speech
    { noiseLevel: [60, 75], lowFreq: 0.2, midFreq: 0.65, highFreq: 0.15, volatility: 0.35 },
    // Pattern 2: Music
    { noiseLevel: [70, 85], lowFreq: 0.3, midFreq: 0.4, highFreq: 0.3, volatility: 0.5 },
    // Pattern 3: Vehicle/Traffic
    { noiseLevel: [75, 90], lowFreq: 0.55, midFreq: 0.3, highFreq: 0.15, volatility: 0.1 },
    // Pattern 4: Typing
    { noiseLevel: [45, 65], lowFreq: 0.1, midFreq: 0.3, highFreq: 0.6, volatility: 0.7 },
    // Pattern 5: Silence
    { noiseLevel: [30, 45], lowFreq: 0.2, midFreq: 0.2, highFreq: 0.2, volatility: 0.05 }
  ];

  const pattern = patterns[Math.floor(Math.random() * patterns.length)];
  const noiseLevel = Math.round(pattern.noiseLevel[0] + Math.random() * (pattern.noiseLevel[1] - pattern.noiseLevel[0]));
  
  // Add small variations to features
  const addNoise = (val) => Math.max(0, Math.min(1, val + (Math.random() - 0.5) * 0.1));

  return {
    noiseLevel,
    lowFreqEnergy: addNoise(pattern.lowFreq),
    midFreqEnergy: addNoise(pattern.midFreq),
    highFreqEnergy: addNoise(pattern.highFreq),
    volatility: addNoise(pattern.volatility)
  };
}

ws.on('open', () => {
  console.log(`✓ Simulator ${deviceId} connected to ${url}`);
  // send periodic readings
  const interval = setInterval(() => {
    const features = generateAudioFeatures();
    const payload = {
      deviceId,
      tableId,
      noiseLevel: features.noiseLevel,
      audioFeatures: {
        lowFreqEnergy: features.lowFreqEnergy,
        midFreqEnergy: features.midFreqEnergy,
        highFreqEnergy: features.highFreqEnergy,
        volatility: features.volatility
      },
      timestamp: Date.now()
    };
    ws.send(JSON.stringify(payload));
    console.log(`  [${new Date().toLocaleTimeString()}] Sent: ${features.noiseLevel}dB with audio features`);
  }, 2000 + Math.random() * 2000);
  
  ws.on('close', () => {
    clearInterval(interval);
  });
});

ws.on('close', () => {
  console.log('✗ connection closed');
  process.exit(0);
});

ws.on('error', (e) => {
  console.error('✗ ws error:', e.message || e);
  console.error('  Make sure the Electron app (npm start) is running on the same machine');
});
