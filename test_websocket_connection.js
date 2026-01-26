#!/usr/bin/env node
/**
 * WebSocket Client Test Utility
 * Simulates ESP32 connection to test if server is properly accepting connections
 */

const WebSocket = require('ws');

const SERVER_IP = '10.25.163.5';
const SERVER_PORT = 8080;
const WS_URL = `ws://${SERVER_IP}:${SERVER_PORT}/`;

console.log('\n' + '='.repeat(70));
console.log('  WebSocket Client Test Utility');
console.log('='.repeat(70));
console.log(`\nAttempting connection to: ${WS_URL}`);
console.log('This simulates what the ESP32 does when connecting...\n');

let connected = false;
const startTime = Date.now();

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  connected = true;
  console.log('✓✓✓ CONNECTION SUCCESSFUL ✓✓✓\n');
  console.log(`✓ WebSocket is accepting connections`);
  console.log(`✓ Server responded to connection request`);
  console.log(`✓ Your ESP32 should be able to connect\n`);
  
  // Send a test message
  const testData = {
    deviceId: 'test-esp32',
    tableId: 'Table-Test',
    noiseLevel: 65,
    audioFeatures: {
      lowFreqEnergy: 0.25,
      midFreqEnergy: 0.50,
      highFreqEnergy: 0.25,
      volatility: 0.35
    },
    timestamp: Date.now()
  };
  
  console.log('Sending test audio data...');
  ws.send(JSON.stringify(testData));
  console.log('✓ Test message sent\n');
  
  // Close after a moment
  setTimeout(() => {
    ws.close();
  }, 1000);
});

ws.on('message', (data) => {
  console.log('📨 Server response received:');
  console.log(`   ${data}\n`);
});

ws.on('error', (err) => {
  console.log('✗✗✗ CONNECTION FAILED ✗✗✗\n');
  console.log(`✗ Error: ${err.message}\n`);
  console.log('Troubleshooting:');
  console.log(`  1. Is the server running? (node main.js)`);
  console.log(`  2. Is port 8080 listening? (netstat -an | findstr 8080)`);
  console.log(`  3. Is the IP correct? (ipconfig /all)`);
  console.log(`  4. Is firewall blocking port 8080?`);
  console.log(`  5. Try: New-NetFirewallRule -DisplayName "Allow 8080" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow\n`);
  process.exit(1);
});

ws.on('close', () => {
  const elapsed = Date.now() - startTime;
  if (connected) {
    console.log(`✓ Connection closed gracefully after ${elapsed}ms`);
    console.log('\n' + '='.repeat(70));
    console.log('  SUCCESS: WebSocket server is working correctly!');
    console.log('='.repeat(70));
    console.log('\nYour ESP32 should now be able to connect.\n');
    console.log('Next steps:');
    console.log('  1. Upload the Arduino firmware to ESP32');
    console.log('  2. Check ESP32 serial output for connection messages');
    console.log('  3. Look for: "[WS] ✓✓✓ CONNECTED TO SERVER ✓✓✓"');
    console.log('  4. If not connecting, check ESP32 WiFi first\n');
    process.exit(0);
  }
});

// Timeout after 10 seconds
setTimeout(() => {
  if (!connected) {
    console.log('✗ Connection timeout (10 seconds)\n');
    console.log('The server is not responding. Possible causes:');
    console.log(`  - Server not running on ws://${SERVER_IP}:${SERVER_PORT}`);
    console.log('  - Firewall blocking connections');
    console.log('  - Wrong IP address\n');
    process.exit(1);
  }
}, 10000);

console.log('Waiting for connection response...');
