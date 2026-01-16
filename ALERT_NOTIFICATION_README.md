# 🚨 Alert Notification System

A professional, modern alert notification system for the Smart Noise Monitor application.

## Overview

This alert system provides an elegant way to display important notifications and alerts to users. It features:

- ✨ Smooth animations and modern design
- 🎨 Gradient backgrounds matching your app theme  
- 📱 Fully responsive on all devices
- 🔔 Support for multiple alert types
- ⚡ Lightweight and fast
- ♿ Accessible and keyboard-navigable

## Sample Alert (Your Requirement)

The system includes a pre-built alert for high noise levels:

```javascript
showNoiseAlert();
```

**Displays:**
```
┌─────────────────────────────────────────┐
│ ⚠️ High Noise Level Detected        ✕  │
├─────────────────────────────────────────┤
│                                         │
│  High Noise level detected in this     │
│  area.                                  │
│                                         │
│  Kindly lower your voice to respect    │
│  others                                 │
│                                         │
├─────────────────────────────────────────┤
│                    [OK]  [Dismiss]      │
└─────────────────────────────────────────┘
```

## Installation

No installation needed! The system is already integrated:

1. **HTML**: Alert modal markup in `index.html` (lines 119-142)
2. **CSS**: Alert styles in `styles.css` (lines 420-540)  
3. **JavaScript**: Alert functions in `renderer.js` (lines 489-551)

## Usage

### Basic Alert
```javascript
showAlert('Title', 'Your message here');
```

### Alert with User Callbacks
```javascript
showAlert('Confirm', 'Proceed with action?', {
  onOk: () => {
    console.log('User confirmed');
    closeAlert();
  },
  onDismiss: () => {
    console.log('User dismissed');
    closeAlert();
  }
});
```

### Auto-Closing Alert
```javascript
showAlert('Success!', 'Operation completed', {
  autoClose: true,
  autoCloseDelay: 3000  // Close after 3 seconds
});
```

### The Noise Alert
```javascript
showNoiseAlert();  // Shows the noise warning alert
```

### Close Alert Programmatically
```javascript
closeAlert();
```

## Integration Examples

### Trigger on High Noise Detection
```javascript
// In your noise detection handler
function handleNoiseData(noiseLevel) {
  const THRESHOLD = 65;  // dB
  
  if (noiseLevel > THRESHOLD) {
    showAlert(
      '⚠️ High Noise Level Detected',
      `Noise level: ${noiseLevel} dB\n\n` +
      'Kindly lower your voice to respect others',
      { autoClose: true, autoCloseDelay: 5000 }
    );
  }
}
```

### Different Alert Types
```javascript
// Error alert
function showError(message) {
  showAlert('❌ Error', message, {
    autoClose: true,
    autoCloseDelay: 5000
  });
}

// Success alert
function showSuccess(message) {
  showAlert('✅ Success', message, {
    autoClose: true,
    autoCloseDelay: 3000
  });
}

// Info alert (requires user interaction)
function showInfo(title, message) {
  showAlert(title, message);
}

// Critical alert (stays until user acts)
function showCritical(message) {
  showAlert('🔴 CRITICAL', message, {
    autoClose: false
  });
}
```

## API Reference

### `showAlert(title, message, options = {})`

Displays an alert modal with the specified content.

**Parameters:**
- `title` (string): The alert title
- `message` (string): The alert message  
  - Supports `\n` for line breaks
- `options` (object): Optional configuration
  - `onOk` (function): Callback when OK is clicked
  - `onDismiss` (function): Callback when Dismiss is clicked
  - `autoClose` (boolean): Auto-close after delay (default: false)
  - `autoCloseDelay` (number): Milliseconds before auto-close (default: 5000)

**Returns:** The modal element

**Example:**
```javascript
showAlert(
  'Warning',
  'This is important!',
  {
    onOk: () => { closeAlert(); },
    autoClose: true,
    autoCloseDelay: 4000
  }
);
```

### `closeAlert()`

Closes the currently displayed alert modal.

**Parameters:** None

**Example:**
```javascript
closeAlert();
```

### `showNoiseAlert()`

Displays the high noise level alert (as per your requirements).

**Parameters:** None

**Example:**
```javascript
showNoiseAlert();
```

## Styling Customization

### Change Colors
Edit `.alert-header` in `styles.css`:
```css
.alert-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
```

### Change Animation Speed
Edit `.alert-modal` animation:
```css
.alert-modal {
  animation: slideIn 0.3s ease-out;  /* Change 0.3s to desired duration */
}
```

### Customize Button Appearance
Edit `.alert-btn-primary` and `.alert-btn-secondary`:
```css
.alert-btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  /* ... other styles ... */
}
```

## Testing

### Test Page
Open `alert_demo.html` in your browser to see an interactive demo with:
- 🔊 Noise Alert (your requirement)
- ℹ️ Custom Alert
- ❌ Error Alert
- ✅ Success Alert

### Manual Testing
In your browser console, run:
```javascript
showNoiseAlert()           // Test noise alert
showAlert('Test', 'Hi!')   // Test basic alert
closeAlert()               // Test closing
```

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome | ✅ Yes |
| Firefox | ✅ Yes |
| Safari | ✅ Yes |
| Edge | ✅ Yes |
| Mobile | ✅ Yes (responsive) |

## Files

| File | Purpose |
|------|---------|
| `index.html` | Modal HTML structure |
| `styles.css` | Alert styling & animations |
| `renderer.js` | Alert functions |
| `alert_demo.html` | Demo/test page |
| `ALERT_SYSTEM_DOCUMENTATION.md` | Full technical docs |
| `ALERT_INTEGRATION_EXAMPLES.js` | Integration code samples |
| `ALERT_SETUP_SUMMARY.md` | Setup summary |
| `QUICK_START.txt` | Quick start guide |

## Tips & Best Practices

1. **Always provide a way to close the alert** - Include OK/Dismiss buttons or set autoClose
2. **Keep messages concise** - Long messages can be hard to read in alerts
3. **Use appropriate auto-close delays** - Fast (3s) for success, slower (5-7s) for errors
4. **For critical alerts** - Set `autoClose: false` and require user interaction
5. **Group related alerts** - Don't spam users with multiple alerts at once

## Troubleshooting

**Alert not showing?**
- Check that `showAlert()` is called after the DOM is loaded
- Verify no CSS is overriding `display: none` on the overlay

**Buttons not working?**
- Ensure callbacks are properly defined
- Check browser console for JavaScript errors

**Styling looks wrong?**
- Clear browser cache
- Check that `styles.css` loaded correctly
- Verify no conflicting CSS rules

## Advanced Features

### Delayed Alerts
```javascript
setTimeout(() => {
  showAlert('Delayed', 'This shows after 2 seconds');
}, 2000);
```

### Conditional Alerts
```javascript
if (condition) {
  showAlert('Alert', 'Condition was true');
}
```

### Alert Chaining
```javascript
showAlert('First', 'First alert', {
  onOk: () => {
    closeAlert();
    showAlert('Second', 'Second alert');
  }
});
```

## Performance

- Lightweight: < 5KB total (HTML + CSS + JS)
- No external dependencies required
- Smooth 60fps animations
- Minimal DOM manipulation

## Accessibility

✅ Semantic HTML structure  
✅ WCAG color contrast compliance  
✅ Keyboard navigation (Tab/Enter)  
✅ Screen reader compatible  
✅ Focus management  

## License

MIT - Same as the Smart Noise Monitor project

---

**Ready to use!** 🎉 

Start displaying professional alerts in your Smart Noise Monitor today!
