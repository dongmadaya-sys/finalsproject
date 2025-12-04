const { spawn } = require('child_process');

// Launcher: start Electron, wait for WebSocket server port in stdout,
// then start the device simulator pointed at that port.

function spawnElectron() {
  // Use npx to ensure local electron is used if installed
  const p = spawn('npx', ['electron', '.'], { shell: true });
  p.stdout.setEncoding('utf8');
  p.stderr.setEncoding('utf8');
  return p;
}

function spawnSimulator(port, deviceId = 'device1', table = 'Table-A') {
  const url = `ws://localhost:${port}`;
  console.log(`Starting multi-device simulator -> ${url}\n`);
  const sim = spawn('node', ['multi_device_simulator.js', '6', url], { stdio: 'inherit' });
  return sim;
}

async function main() {
  const electronProc = spawnElectron();

  // print electron output to this launcher
  electronProc.stdout.on('data', (d) => {
    process.stdout.write(d);
  });
  electronProc.stderr.on('data', (d) => {
    process.stderr.write(d);
  });

  // try to parse the port from Electron stdout
  let portFound = null;
  const BUFFER_MAX = 20000;
  let buffer = '';

  const portRegex = /WebSocket server listening on ws:\/\/localhost:(\d+)/i;
  const classifierRegex = /Sound classifier initialized/i;
  let classifierReady = false;

  // parse both stdout and stderr for readiness messages
  const processChunk = (chunk) => {
    buffer += chunk.toString();
    if (buffer.length > BUFFER_MAX) buffer = buffer.slice(-BUFFER_MAX);

    // Check for classifier ready
    if (classifierRegex.test(buffer)) {
      classifierReady = true;
    }

    const m = buffer.match(portRegex);
    if (m && m[1] && !portFound) {
      portFound = Number(m[1]);
    }
  };

  electronProc.stdout.on('data', processChunk);
  electronProc.stderr.on('data', processChunk);

  // Wait for both port and classifier to be ready, then spawn simulator
  const checkReady = setInterval(() => {
    if (portFound && classifierReady) {
      clearInterval(checkReady);
      console.log(`\n✓ Server ready on port ${portFound}, starting simulators...\n`);
      if (process.env.NO_SIM !== 'true') {
        spawnSimulator(portFound);
      }
    }
  }, 500);

  // Fallback: if not ready in 20s, try with what we have
  setTimeout(() => {
    clearInterval(checkReady);
    if (!portFound) {
      console.warn('Could not detect WebSocket port from Electron output; falling back to ws://localhost:8080');
      portFound = 8080;
    }
    if (process.env.NO_SIM !== 'true' && portFound) {
      spawnSimulator(portFound);
    }
  }, 15000);

  // Relay signals
  const forward = (sig) => {
    try { electronProc.kill(sig); } catch (e) {}
    process.exit();
  };
  process.on('SIGINT', () => forward('SIGINT'));
  process.on('SIGTERM', () => forward('SIGTERM'));
}

main().catch((e) => { console.error('Launcher error', e); process.exit(1); });
