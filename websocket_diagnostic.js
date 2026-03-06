#!/usr/bin/env node
/**
 * WebSocket Connection Diagnostic Tool
 * Helps identify connectivity issues between ESP32 and PC
 */

const os = require('os');
const net = require('net');
const dgram = require('dgram');
const dns = require('dns').promises;
const WebSocket = require('ws');

console.log('\n' + '='.repeat(60));
console.log('  WebSocket Connectivity Diagnostic Tool');
console.log('='.repeat(60) + '\n');

// Get all local IPs
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({
          interface: name,
          address: iface.address,
          netmask: iface.netmask
        });
      }
    }
  }
  
  return ips;
}

// Check if a port is open on localhost
function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
      .once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve({ port, status: 'LISTENING' });
        } else {
          resolve({ port, status: 'ERROR', error: err.message });
        }
      })
      .once('listening', () => {
        server.close();
        resolve({ port, status: 'AVAILABLE' });
      })
      .listen(port, '0.0.0.0');
  });
}

// Try WebSocket connection
function testWebSocketConnection(url) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ url, status: 'TIMEOUT', message: 'No response after 5 seconds' });
    }, 5000);

    try {
      const ws = new WebSocket(url);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        ws.close();
        resolve({ url, status: 'CONNECTED', message: 'WebSocket connection successful' });
      });
      
      ws.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ url, status: 'ERROR', message: err.message });
      });
    } catch (err) {
      clearTimeout(timeout);
      resolve({ url, status: 'ERROR', message: err.message });
    }
  });
}

async function runDiagnostics() {
  console.log('1. LOCAL NETWORK INTERFACES');
  console.log('-'.repeat(60));
  const ips = getLocalIPs();
  if (ips.length === 0) {
    console.log('❌ No IPv4 network interfaces found!');
  } else {
    ips.forEach((ip, idx) => {
      console.log(`   [${idx + 1}] ${ip.interface}: ${ip.address}`);
    });
  }
  
  console.log('\n2. PORT STATUS');
  console.log('-'.repeat(60));
  const portStatus = await checkPort(8080);
  if (portStatus.status === 'LISTENING') {
    console.log('   ✓ Port 8080 is LISTENING (WebSocket server is running)');
  } else if (portStatus.status === 'AVAILABLE') {
    console.log('   ❌ Port 8080 is AVAILABLE (WebSocket server is NOT running)');
  } else {
    console.log(`   ❌ Port 8080 error: ${portStatus.error}`);
  }
  
  console.log('\n3. WebSocket CONNECTIVITY TESTS');
  console.log('-'.repeat(60));
  
  // Test localhost
  console.log('   Testing: ws://localhost:8080/');
  const localHostTest = await testWebSocketConnection('ws://localhost:8080/');
  console.log(`   Result: ${localHostTest.status} - ${localHostTest.message}`);
  
  // Test each local IP
  for (const ip of ips) {
    console.log(`\n   Testing: ws://${ip.address}:8080/`);
    const result = await testWebSocketConnection(`ws://${ip.address}:8080/`);
    console.log(`   Result: ${result.status} - ${result.message}`);
  }
  
  console.log('\n4. ARDUINO CONFIGURATION RECOMMENDATIONS');
  console.log('-'.repeat(60));
  if (ips.length > 0) {
    console.log('   Use one of these IPs in your ESP32 firmware:');
    ips.forEach((ip, idx) => {
      console.log(`   #define SERVER_IP "${ip.address}"  // ${ip.interface}`);
    });
  }
  
  console.log('\n5. TROUBLESHOOTING CHECKLIST');
  console.log('-'.repeat(60));
  console.log('   □ Verify PC and ESP32 are on the SAME WiFi network');
  console.log('   □ Confirm the IP address in ESP32 firmware matches PC');
  console.log('   □ Check firewall allows incoming connections on port 8080');
  console.log('   □ Run: netstat -an | findstr 8080  (to verify listening)');
  console.log('   □ Check ESP32 serial output for WiFi connection status');
  console.log('   □ Verify WebSocket server is running in main.js');
  console.log('   □ Test connectivity: ping <ESP32_IP_ADDRESS>');
  
  console.log('\n6. ESP32 FIRMWARE CONFIGURATION');
  console.log('-'.repeat(60));
  console.log('   Current Arduino Configuration:');
  console.log('   #define SERVER_IP "10.25.163.5"');
  console.log('   #define SERVER_PORT 8080');
  console.log('   #define WIFI_SSID "TECNO POVA 5 Pro 5G"');
  console.log('\n   ⚠️  Update SERVER_IP to match one of the IPs above!');
  
  console.log('\n' + '='.repeat(60) + '\n');
}

runDiagnostics().catch(err => {
  console.error('Diagnostic error:', err);
  process.exit(1);
});
