# Smart Noise Monitor (Electron)

Desktop web-app for library noise detection and reporting (capstone/demo). Works offline and uses a local WebSocket server to receive data from devices. All libraries used are free.

Quick start (Windows):

1. Install Node.js (v16+ recommended).
2. In the project folder run:

```powershell
cd c:\finalsproject
npm install
npm run start
```

3. In another terminal, run one or more simulators to emulate devices:

```powershell
node device_simulator.js device1 Table-A
node device_simulator.js device2 Table-A
node device_simulator.js device3 Table-B
```

Notes and design:
- `main.js` runs an embedded WebSocket server on `ws://localhost:8080` and forwards device data to the renderer.
- Devices send JSON: `{ deviceId, tableId, noiseLevel, soundType, timestamp }`.
- Alerts are generated when noise >= threshold (default 65 dB) and when a device reports noise but peer devices on the same table do not (possible sensor issue).
- If a device does not send data for more than 15s it is marked OFFLINE.

Front-end:
- `index.html`, `renderer.js`, uses Chart.js (via CDN) for live charts and simple UI showing devices, noise, and alerts.

Packaging:
- For creating an installer, use `electron-packager` or `electron-builder` (both free). Packaging is out of scope for this scaffold but can be added if you want.

If you want, I can also:
- Add a small REST API to record historical logs to disk.
- Improve the sound classification using a local ML model (TensorFlow.js) for better accuracy.
