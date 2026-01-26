#!/usr/bin/env node
/**
 * System Status Check for WebSocket Arduino Connection
 * Quickly diagnose the current setup and identify problems
 */

const os = require('os');
const net = require('net');
const fs = require('fs');
const path = require('path');

console.log('\n' + '='.repeat(70));
console.log('  WebSocket Arduino Connection - System Status Check');
console.log('='.repeat(70) + '\n');

// Color codes for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  reset: '\x1b[0m'
};

function check(condition, passMsg, failMsg) {
  if (condition) {
    console.log(`${colors.green}✓${colors.reset} ${passMsg}`);
    return true;
  } else {
    console.log(`${colors.red}✗${colors.reset} ${failMsg}`);
    return false;
  }
}

// 1. Check Network Configuration
console.log(`${colors.blue}1. NETWORK CONFIGURATION${colors.reset}`);
console.log('-'.repeat(70));

const interfaces = os.networkInterfaces();
let ipAddress = null;
let foundWiFi = false;

for (const name of Object.keys(interfaces)) {
  for (const iface of interfaces[name]) {
    if (iface.family === 'IPv4' && !iface.internal) {
      if (iface.address.startsWith('10.25.163.')) {
        ipAddress = iface.address;
        foundWiFi = true;
        check(true, `WiFi IP Found: ${iface.address}`, '');
        console.log(`   Gateway: (should be 10.25.163.45)`);
        break;
      }
    }
  }
  if (foundWiFi) break;
}

if (!foundWiFi) {
  check(false, '', 'WiFi Interface on 10.25.163.x not found');
  console.log('   Available interfaces:');
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`     - ${name}: ${iface.address}`);
      }
    }
  }
}

// 2. Check Port 8080
console.log(`\n${colors.blue}2. PORT 8080 STATUS${colors.reset}`);
console.log('-'.repeat(70));

const server = net.createServer();
server.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    check(true, 'Port 8080 is LISTENING (WebSocket server is running)', '');
  } else {
    check(false, '', `Port 8080 error: ${err.message}`);
  }
  process.nextTick(() => checkFiles());
}).once('listening', () => {
  server.close();
  check(false, '', 'Port 8080 is AVAILABLE (WebSocket server NOT running - need to start npm start)');
  process.nextTick(() => checkFiles());
}).listen(8080, '0.0.0.0');

function checkFiles() {
  // 3. Check Required Files
  console.log(`\n${colors.blue}3. REQUIRED FILES${colors.reset}`);
  console.log('-'.repeat(70));
  
  const requiredFiles = [
    { path: 'main.js', desc: 'Main Electron app' },
    { path: 'package.json', desc: 'Node dependencies' },
    { path: 'webServerApiSettings.json', desc: 'WebSocket port config' },
    { path: 'esp32_inmp441_firmware/esp32_inmp441_firmware_2/esp32_inmp441_firmware_2.ino', desc: 'Arduino firmware' }
  ];
  
  const projectRoot = __dirname;
  let allFilesOk = true;
  
  requiredFiles.forEach(file => {
    const fullPath = path.join(projectRoot, file.path);
    const exists = fs.existsSync(fullPath);
    allFilesOk = allFilesOk && exists;
    check(exists, `Found: ${file.desc}`, `Missing: ${file.desc} (${file.path})`);
  });
  
  // 4. Check Arduino Firmware Configuration
  console.log(`\n${colors.blue}4. ARDUINO FIRMWARE CONFIGURATION${colors.reset}`);
  console.log('-'.repeat(70));
  
  try {
    const firmwarePath = path.join(projectRoot, 'esp32_inmp441_firmware/esp32_inmp441_firmware_2/esp32_inmp441_firmware_2.ino');
    const firmwareContent = fs.readFileSync(firmwarePath, 'utf-8');
    
    const serverIpMatch = firmwareContent.match(/#define SERVER_IP "([^"]+)"/);
    const serverPortMatch = firmwareContent.match(/#define SERVER_PORT (\d+)/);
    const ssidMatch = firmwareContent.match(/#define WIFI_SSID "([^"]+)"/);
    
    if (serverIpMatch) {
      const configuredIp = serverIpMatch[1];
      check(configuredIp === '10.25.163.5', 
        `SERVER_IP is correct: ${configuredIp}`,
        `SERVER_IP mismatch: ${configuredIp} (should be 10.25.163.5)`);
    }
    
    if (serverPortMatch) {
      const configuredPort = serverPortMatch[1];
      check(configuredPort === '8080',
        `SERVER_PORT is correct: ${configuredPort}`,
        `SERVER_PORT mismatch: ${configuredPort} (should be 8080)`);
    }
    
    if (ssidMatch) {
      console.log(`   WiFi SSID configured: ${ssidMatch[1]}`);
    }
  } catch (err) {
    console.log(`   ${colors.yellow}!${colors.reset} Could not read firmware file: ${err.message}`);
  }
  
  // 5. Summary & Next Steps
  console.log(`\n${colors.blue}5. NEXT STEPS${colors.reset}`);
  console.log('-'.repeat(70));
  
  if (foundWiFi && ipAddress === '10.25.163.5') {
    console.log('\n✓ Network configuration looks good!');
  } else {
    console.log('\n⚠ Network configuration issues detected');
    console.log('  Fix: Run "ipconfig /all" and verify you\'re on the TECNO network');
  }
  
  console.log('\nTo test the connection:');
  console.log(`  1. Start the server: npm start`);
  console.log(`  2. Run WebSocket test: node test_websocket_connection.js`);
  console.log(`  3. Upload firmware to ESP32`);
  console.log(`  4. Check ESP32 serial output for connection messages`);
  
  console.log(`\nFor detailed troubleshooting:`);
  console.log(`  See: WEBSOCKET_TROUBLESHOOTING.md`);
  
  console.log('\n' + '='.repeat(70) + '\n');
}
