// INTEGRATION EXAMPLE: How to trigger noise alerts in your system
// This shows how to integrate the alert notification system with your noise detection

// ============================================================
// OPTION 1: Integrate with real-time noise data
// ============================================================
// Add this to your data listener in renderer.js where noise data is processed

function attachDataListeners() {
  // ... existing code ...
  
  // Listen for device updates and check noise levels
  if (window.api && window.api.onDeviceData) {
    window.api.onDeviceData((device) => {
      const noiseLevel = device.noiseLevel || 0;
      const NOISE_THRESHOLD = 65; // dB
      
      // Check if noise level exceeds threshold
      if (noiseLevel > NOISE_THRESHOLD) {
        // Show the noise alert
        showAlert(
          '⚠️ High Noise Level Detected',
          `High Noise level detected in this area (${noiseLevel} dB).\n\nKindly lower your voice to respect others`,
          {
            autoClose: true,
            autoCloseDelay: 5000  // Auto-dismiss after 5 seconds
          }
        );
      }
    });
  }
}


// ============================================================
// OPTION 2: Trigger alerts on device events
// ============================================================
// In your device update handler

function updateDeviceCard(device) {
  // ... existing code ...
  
  // Check noise level and show alert if needed
  if (device.noiseLevel > NOISE_THRESHOLD && !device.alertShown) {
    showAlert(
      '⚠️ High Noise Level Detected',
      'High Noise level detected in this area.\n\nKindly lower your voice to respect others'
    );
    
    // Mark alert as shown to avoid spam (optional)
    device.alertShown = true;
  }
}


// ============================================================
// OPTION 3: Show alert with device information
// ============================================================
// When you want to show which device detected high noise

function handleHighNoiseEvent(device) {
  showAlert(
    `⚠️ High Noise Level Detected - ${device.id}`,
    `Location: ${device.location || 'Unknown'}\n` +
    `Noise Level: ${device.noiseLevel} dB\n` +
    `Time: ${new Date().toLocaleTimeString()}\n\n` +
    'Kindly lower your voice to respect others',
    {
      onOk: () => {
        // Log the alert acknowledgment
        console.log(`User acknowledged high noise alert from device ${device.id}`);
        closeAlert();
      },
      onDismiss: () => {
        console.log(`User dismissed high noise alert from device ${device.id}`);
        closeAlert();
      }
    }
  );
}


// ============================================================
// OPTION 4: Configure different alert types
// ============================================================
// Create helper functions for different alert scenarios

function showNoiseWarning(level) {
  showAlert(
    '⚠️ High Noise Level Detected',
    `High Noise level detected in this area (${level} dB).\n\nKindly lower your voice to respect others`,
    { autoClose: true, autoCloseDelay: 5000 }
  );
}

function showNoiseCritical(level) {
  showAlert(
    '🔴 CRITICAL: Excessive Noise Level',
    `CRITICAL noise level detected (${level} dB)!\n\nImmediate action required.\nPlease contact staff immediately.`,
    { autoClose: false }  // Requires user action
  );
}

function showSystemError(message) {
  showAlert(
    '❌ System Error',
    `An error has occurred:\n${message}`,
    { autoClose: true, autoCloseDelay: 7000 }
  );
}

function showSystemNotification(title, message) {
  showAlert(title, message, { autoClose: true, autoCloseDelay: 4000 });
}


// ============================================================
// TESTING: Demo function to simulate noise detection
// ============================================================
// Call this to test the alert without needing real noise data

function testNoiseAlert() {
  // Simulate high noise detection
  showAlert(
    '⚠️ High Noise Level Detected',
    'High Noise level detected in this area.\n\nKindly lower your voice to respect others',
    {
      onOk: () => {
        console.log('Test alert acknowledged');
        closeAlert();
      }
    }
  );
}

// Test in browser console: testNoiseAlert()


// ============================================================
// COMPLETE EXAMPLE: Full integration in a device update handler
// ============================================================

function processDeviceUpdate(device) {
  const NOISE_THRESHOLD = 65;  // dB
  const CRITICAL_THRESHOLD = 80;  // dB
  
  // Update device UI
  updateDeviceDisplay(device);
  
  // Check noise levels and show appropriate alerts
  if (device.noiseLevel >= CRITICAL_THRESHOLD) {
    // Critical level - requires immediate attention
    showNoiseCritical(device.noiseLevel);
  } else if (device.noiseLevel > NOISE_THRESHOLD) {
    // Warning level - auto-dismiss alert
    showNoiseWarning(device.noiseLevel);
  }
  
  // Update charts and statistics
  updateCharts(device);
}


// ============================================================
// API REFERENCE: Available Functions
// ============================================================

/*
showAlert(title, message, options)
  - title: string - Alert title
  - message: string - Alert message (supports \n for line breaks)
  - options: object
    - onOk: function - Callback when OK button clicked
    - onDismiss: function - Callback when Dismiss button clicked
    - autoClose: boolean - Auto-close the alert (default: false)
    - autoCloseDelay: number - Milliseconds before auto-close (default: 5000)
  - returns: HTML element reference

closeAlert()
  - Closes the currently displayed alert

showNoiseAlert()
  - Shows the sample noise alert from requirements
  - Title: "⚠️ High Noise Level Detected"
  - Message: "High Noise level detected in this area.\n\nKindly lower your voice to respect others"
*/
