#!/usr/bin/env node
/**
 * Multi-device simulator - Generates realistic sound data for multiple tables
 * Usage: node multi_device_simulator.js [numDevices] [serverUrl]
 * Example: node multi_device_simulator.js 6 ws://localhost:8080
 */

const WebSocket = require('ws');

const numDevices = parseInt(process.argv[2]) || 2;
const serverUrl = process.argv[3] || 'ws://localhost:8080';

// Define table layout and devices
const tables = [
  { name: 'Table-A', devices: ['device_A1', 'device_A2'] }
];

const devices = [];
tables.forEach(table => {
  table.devices.forEach(deviceId => {
    devices.push({ deviceId, tableId: table.name });
  });
});

// Sound activity patterns with realistic characteristics
const soundPatterns = {
  speech: {
    description: 'People talking',
    noiseRange: [55, 75],
    freqPattern: { low: 0.2, mid: 0.65, high: 0.15 },
    volatility: 0.35,
    probability: 0.25
  },
  music: {
    description: 'Playing music/entertainment',
    noiseRange: [65, 85],
    freqPattern: { low: 0.3, mid: 0.4, high: 0.3 },
    volatility: 0.5,
    probability: 0.15
  },
  vehicle: {
    description: 'Traffic noise',
    noiseRange: [70, 90],
    freqPattern: { low: 0.55, mid: 0.3, high: 0.15 },
    volatility: 0.1,
    probability: 0.05
  },
  typing: {
    description: 'Keyboard/mouse clicking',
    noiseRange: [45, 65],
    freqPattern: { low: 0.1, mid: 0.3, high: 0.6 },
    volatility: 0.7,
    probability: 0.3
  },
  silence: {
    description: 'Quiet/no activity',
    noiseRange: [30, 45],
    freqPattern: { low: 0.2, mid: 0.2, high: 0.2 },
    volatility: 0.05,
    probability: 0.25
  }
};

class DeviceSimulator {
  constructor(deviceId, tableId, serverUrl) {
    this.deviceId = deviceId;
    this.tableId = tableId;
    this.serverUrl = serverUrl;
    this.ws = null;
    this.connected = false;
    this.currentPattern = null;
    this.patternDuration = 0;
    this.patternTimer = 0;
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl);

        this.ws.on('open', () => {
          this.connected = true;
          console.log(`✓ ${this.deviceId} connected to ${this.serverUrl}`);
          this.startSending();
          resolve();
        });

        this.ws.on('close', () => {
          this.connected = false;
          console.log(`✗ ${this.deviceId} disconnected`);
        });

        this.ws.on('error', (err) => {
          console.error(`✗ ${this.deviceId} error:`, err.message);
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  selectPattern() {
    const rand = Math.random();
    let cumulative = 0;

    for (const [type, pattern] of Object.entries(soundPatterns)) {
      cumulative += pattern.probability;
      if (rand < cumulative) {
        if (this.currentPattern !== type) {
          // Pattern changed, log it
        }
        this.currentPattern = type;
        this.patternDuration = 5000 + Math.random() * 10000; // 5-15 seconds
        this.patternTimer = 0;
        return;
      }
    }

    // Fallback to silence
    this.currentPattern = 'silence';
    this.patternDuration = 3000 + Math.random() * 5000;
    this.patternTimer = 0;
  }

  generateAudioFeatures() {
    if (!this.currentPattern || this.patternTimer > this.patternDuration) {
      this.selectPattern();
    }

    const pattern = soundPatterns[this.currentPattern];
    if (!pattern) {
      console.error(`Pattern not found: ${this.currentPattern}`);
      this.selectPattern();
      return this.generateAudioFeatures();
    }

    const noiseLevel = Math.round(
      pattern.noiseRange[0] + Math.random() * (pattern.noiseRange[1] - pattern.noiseRange[0])
    );

    const addNoise = (val, intensity = 0.08) => 
      Math.max(0, Math.min(1, val + (Math.random() - 0.5) * intensity));

    const features = {
      noiseLevel,
      lowFreqEnergy: addNoise(pattern.freqPattern.low),
      midFreqEnergy: addNoise(pattern.freqPattern.mid),
      highFreqEnergy: addNoise(pattern.freqPattern.high),
      volatility: addNoise(pattern.volatility, 0.15)
    };

    this.patternTimer += 2500; // Fixed increment instead of random

    return features;
  }

  startSending() {
    setInterval(() => {
      if (!this.connected) return;

      const features = this.generateAudioFeatures();
      const payload = {
        deviceId: this.deviceId,
        tableId: this.tableId,
        noiseLevel: features.noiseLevel,
        audioFeatures: {
          lowFreqEnergy: features.lowFreqEnergy,
          midFreqEnergy: features.midFreqEnergy,
          highFreqEnergy: features.highFreqEnergy,
          volatility: features.volatility
        },
        timestamp: Date.now()
      };

      try {
        this.ws.send(JSON.stringify(payload));
        const pattern = this.currentPattern || 'unknown';
        console.log(
          `  [${this.deviceId}] ${new Date().toLocaleTimeString()} | ${pattern.toUpperCase().padEnd(8)} | ${features.noiseLevel}dB`
        );
      } catch (err) {
        console.error(`✗ Failed to send from ${this.deviceId}:`, err.message);
      }
    }, 2000 + Math.random() * 2000);
  }
}

async function main() {
  console.log(`\n🔊 Multi-Device Noise Monitor Simulator`);
  console.log(`📍 Server: ${serverUrl}`);
  console.log(`📊 Devices: ${devices.length}`);
  console.log(`📋 Tables: ${tables.map(t => t.name).join(', ')}`);
  console.log(`\nSound Patterns:`);
  Object.entries(soundPatterns).forEach(([type, pattern]) => {
    console.log(`  • ${type.toUpperCase().padEnd(8)} - ${pattern.description} (${pattern.noiseRange[0]}-${pattern.noiseRange[1]}dB, prob: ${(pattern.probability * 100).toFixed(0)}%)`);
  });
  console.log(`\n${'Device'.padEnd(12)} | Time         | Sound    | Noise`);
  console.log(`${'─'.repeat(50)}`);

  const simulators = devices.map(
    (dev, idx) =>
      new DeviceSimulator(dev.deviceId, dev.tableId, serverUrl)
  );

  // Connect all devices with staggered startup
  for (let i = 0; i < simulators.length; i++) {
    try {
      await simulators[i].connect();
      if (i < simulators.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Stagger connections
      }
    } catch (err) {
      console.error(`Failed to connect ${devices[i].deviceId}`);
    }
  }

  console.log(`\n✓ All devices connected and sending data...\n`);

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n\nShutting down...');
    simulators.forEach(sim => {
      if (sim.ws) sim.ws.close();
    });
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
