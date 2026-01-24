const { contextBridge, ipcRenderer } = require('electron');

try {
  contextBridge.exposeInMainWorld('api', {
    onDeviceData: (cb) => ipcRenderer.on('device-data', (e, d) => cb(d)),
    onAlert: (cb) => ipcRenderer.on('alert', (e, d) => cb(d)),
    onDeviceOffline: (cb) => ipcRenderer.on('device-offline', (e, d) => cb(d)),
    onServerInfo: (cb) => ipcRenderer.on('server-info', (e, d) => cb(d)),
    onNetworkStatus: (cb) => ipcRenderer.on('network-status', (e, d) => cb(d)),
    onStartupAlert: (cb) => ipcRenderer.on('show-startup-alert', (e, d) => cb(d)),
    onShowAlert: (cb) => ipcRenderer.on('show-alert', (e, d) => cb(d)),
    onWiFiConnected: (cb) => ipcRenderer.on('wifi-connected', (e, d) => cb(d)),
    queryDevices: () => ipcRenderer.invoke('query-devices'),
    updateDeviceSection: (deviceId, sectionName) => ipcRenderer.invoke('update-device-section', { deviceId, sectionName }),
    // WiFi APIs
    scanWiFiNetworks: () => ipcRenderer.invoke('scan-wifi-networks'),
    connectToWiFi: (ssid, password) => ipcRenderer.invoke('connect-to-wifi', { ssid, password }),
    getCurrentWiFi: () => ipcRenderer.invoke('get-current-wifi'),
    // Arduino APIs
    initializeArduino: () => ipcRenderer.invoke('initialize-arduino'),
    getArduinoStatus: () => ipcRenderer.invoke('get-arduino-status')
  });
} catch (e) {
  console.error('Preload error:', e.message);
}
