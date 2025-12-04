const { contextBridge, ipcRenderer } = require('electron');

try {
  contextBridge.exposeInMainWorld('api', {
    onDeviceData: (cb) => ipcRenderer.on('device-data', (e, d) => cb(d)),
    onAlert: (cb) => ipcRenderer.on('alert', (e, d) => cb(d)),
    onDeviceOffline: (cb) => ipcRenderer.on('device-offline', (e, d) => cb(d)),
    onServerInfo: (cb) => ipcRenderer.on('server-info', (e, d) => cb(d)),
    onNetworkStatus: (cb) => ipcRenderer.on('network-status', (e, d) => cb(d)),
    queryDevices: () => ipcRenderer.invoke('query-devices')
  });
} catch (e) {
  console.error('Preload error:', e.message);
}
