/**
 * Arduino WiFi Handler
 * Manages serial communication with ESP32 to configure WiFi
 * Sends WiFi credentials to Arduino device
 */

const SerialPort = require('serialport').SerialPort;
const path = require('path');

class ArduinoWiFiHandler {
  constructor() {
    this.port = null;
    this.isConnected = false;
    this.portPath = null;
    this.baudRate = 115200;
  }

  /**
   * Initialize serial connection to Arduino
   * Automatically detects Arduino port
   */
  async initialize() {
    try {
      const { SerialPort: SPModule } = require('serialport');
      const ports = await SPModule.list();
      
      if (ports.length === 0) {
        console.warn('⚠️  No serial ports found. Arduino may not be connected.');
        return false;
      }

      // Look for Arduino/ESP32 ports
      const arduinoPort = ports.find(p => 
        p.manufacturer && (
          p.manufacturer.includes('Arduino') || 
          p.manufacturer.includes('Silicon Labs') ||
          p.manufacturer.includes('CH340') ||
          p.manufacturer.includes('FTDI')
        )
      ) || ports[0]; // Fallback to first port

      console.log(`✓ Found Arduino on port: ${arduinoPort.path}`);
      
      // Retry logic for access denied errors
      let retryCount = 0;
      const maxRetries = 3;
      
      const attemptConnection = () => {
        return new Promise((resolve) => {
          try {
            this.port = new SerialPort({
              path: arduinoPort.path,
              baudRate: this.baudRate,
              dataBits: 8,
              stopBits: 1,
              parity: 'none',
              autoOpen: true
            });

            this.port.on('open', () => {
              this.isConnected = true;
              this.portPath = arduinoPort.path;
              console.log(`✓ Serial connection established on ${arduinoPort.path}`);
              resolve(true);
            });

            this.port.on('error', (err) => {
              console.error(`Serial port error (attempt ${retryCount + 1}/${maxRetries}):`, err.message);
              this.isConnected = false;
              
              // If access denied and retries left, try again
              if (err.message.includes('Access denied') && retryCount < maxRetries - 1) {
                retryCount++;
                console.log(`Retrying serial connection in 1 second...`);
                setTimeout(() => {
                  resolve(attemptConnection());
                }, 1000);
              } else {
                resolve(false);
              }
            });

            setTimeout(() => {
              if (!this.isConnected && this.port) {
                resolve(false);
              }
            }, 3000);
          } catch (error) {
            console.error('Failed to create serial port:', error.message);
            resolve(false);
          }
        });
      };
      
      return await attemptConnection();
    } catch (error) {
      console.error('Failed to initialize serial connection:', error.message);
      return false;
    }
  }

  /**
   * Send WiFi credentials to Arduino
   * @param {string} ssid - WiFi network name
   * @param {string} password - WiFi password
   */
  async sendWiFiCredentials(ssid, password) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.port) {
        console.warn('Serial port not connected. Skipping Arduino WiFi config.');
        return resolve({ 
          success: false, 
          message: 'Arduino not connected',
          arduinoConfigured: false 
        });
      }

      try {
        // Format: WIFI_CONFIG|SSID|PASSWORD
        const credential = `WIFI_CONFIG|${ssid}|${password}\n`;
        
        console.log(`📡 Sending WiFi credentials to Arduino: ${ssid}`);
        
        this.port.write(credential, (err) => {
          if (err) {
            console.error('Failed to send WiFi credentials:', err.message);
            return reject(err);
          }

          // Listen for acknowledgment from Arduino
          const listener = (data) => {
            const response = data.toString().trim();
            console.log(`Arduino response: ${response}`);
            
            if (response.includes('OK') || response.includes('success')) {
              this.port.off('data', listener);
              resolve({
                success: true,
                message: 'WiFi credentials sent to Arduino',
                arduinoConfigured: true
              });
            }
          };

          this.port.on('data', listener);

          // Timeout after 5 seconds
          setTimeout(() => {
            this.port.off('data', listener);
            resolve({
              success: true,
              message: 'WiFi credentials sent to Arduino (no response)',
              arduinoConfigured: true
            });
          }, 5000);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from Arduino
   */
  disconnect() {
    return new Promise((resolve) => {
      if (this.port && this.isConnected) {
        this.port.close(() => {
          this.isConnected = false;
          console.log('✓ Arduino serial connection closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Check if Arduino is connected
   */
  isArduinoConnected() {
    return this.isConnected;
  }

  /**
   * Get Arduino port information
   */
  getPortInfo() {
    return {
      connected: this.isConnected,
      port: this.portPath,
      baudRate: this.baudRate
    };
  }
}

module.exports = ArduinoWiFiHandler;
