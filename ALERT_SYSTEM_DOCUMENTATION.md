# Alert Notification System Documentation

## Overview
A professional alert notification system has been integrated into the Smart Noise Monitor application. This system displays on-screen alert windows for important notifications, including system errors and warning messages.

## Features

### Visual Components
- **Animated Modal Window**: Smooth slide-in animation with fade-in overlay
- **Icon Container**: Visual indicator area with customizable icons
- **Header**: Displays alert title with close button
- **Message Body**: Shows detailed alert message with word-wrapping
- **Action Buttons**: "OK" and "Dismiss" buttons for user interaction
- **Responsive Design**: Works on desktop and mobile devices

### Styling
- Modern gradient background (purple to pink)
- Professional shadow effects
- Smooth hover and click animations
- Accessible button states
- Semi-transparent overlay

## Implementation

### Files Modified/Created

#### 1. `index.html`
Added alert modal HTML structure:
```html
<!-- Alert Notification Modal -->
<div id="alert-overlay" class="alert-overlay" style="display:none;"></div>
<div id="alert-modal" class="alert-modal" style="display:none;">
  <!-- Modal content -->
</div>
```

#### 2. `styles.css`
Added comprehensive CSS styling:
- `.alert-overlay`: Semi-transparent background overlay
- `.alert-modal`: Modal container with animations
- `.alert-modal-content`: Main modal box
- `.alert-header`, `.alert-body`, `.alert-footer`: Section styling
- Button styles: `.alert-btn-primary`, `.alert-btn-secondary`
- Animations: `@keyframes fadeIn`, `@keyframes slideIn`

#### 3. `renderer.js`
Added JavaScript functions:

**`showAlert(title, message, options = {})`**
- Parameters:
  - `title`: Alert title text
  - `message`: Alert message text
  - `options.onOk`: Callback when OK button is clicked
  - `options.onDismiss`: Callback when Dismiss button is clicked
  - `options.autoClose`: Auto-close alert after delay (boolean)
  - `options.autoCloseDelay`: Delay in ms for auto-close (default: 5000)

**`closeAlert()`**
- Hides the alert modal and overlay

**`showNoiseAlert()`**
- Demonstrates the noise alert sample from requirements
- Shows: "High Noise level detected in this area. Kindly lower your voice to respect others"

## Usage Examples

### Basic Alert
```javascript
showAlert('Warning', 'This is a warning message');
```

### Alert with Callbacks
```javascript
showAlert(
  'Confirm Action',
  'Are you sure you want to proceed?',
  {
    onOk: () => {
      console.log('User confirmed');
      closeAlert();
    },
    onDismiss: () => {
      console.log('User dismissed');
      closeAlert();
    }
  }
);
```

### Auto-closing Alert
```javascript
showAlert(
  'Success',
  'Operation completed successfully!',
  {
    autoClose: true,
    autoCloseDelay: 3000  // Close after 3 seconds
  }
);
```

### Noise Level Alert (Sample Requirement)
```javascript
showNoiseAlert();
```

This displays:
- **Title**: ⚠️ High Noise Level Detected
- **Message**: High Noise level detected in this area.\n\nKindly lower your voice to respect others

## Integration with Sound Classifier

To integrate alerts with the noise detection system, you can call the alert functions when noise thresholds are exceeded. Example:

```javascript
// In sound_classifier.js or when processing noise data
if (noiseLevel > NOISE_THRESHOLD) {
  showAlert(
    '⚠️ High Noise Level Detected',
    `Noise level: ${noiseLevel} dB\n\nKindly lower your voice to respect others`,
    {
      autoClose: true,
      autoCloseDelay: 5000
    }
  );
}
```

## Styling Customization

### Change Alert Colors
Edit `.alert-header` background gradient in `styles.css`:
```css
.alert-header {
  background: linear-gradient(135deg, #YOUR_COLOR_1 0%, #YOUR_COLOR_2 100%);
}
```

### Adjust Animation Speed
Edit animation duration in `styles.css`:
```css
.alert-modal {
  animation: slideIn 0.3s ease-out; /* Change 0.3s to desired duration */
}
```

### Modify Button Styles
Update button classes:
- `.alert-btn-primary`: Primary action button
- `.alert-btn-secondary`: Secondary/cancel button

## Testing

A demo file `alert_demo.html` has been created for testing purposes. It includes:
- Show Noise Alert (main requirement)
- Show Custom Alert
- Show Error Alert
- Show Success Alert

To test:
1. Open `alert_demo.html` in a browser
2. Click any button to trigger the alert
3. Try different interaction patterns (click OK, Dismiss, Close button, outside overlay)

## Accessibility Considerations

- All buttons have clear labels
- Modal has semantic structure
- Color contrast meets WCAG standards
- Keyboard-navigable (Tab key between buttons)
- Close button provides alternative to button choices

## Browser Compatibility

- Chrome/Edge: ✓ Fully supported
- Firefox: ✓ Fully supported
- Safari: ✓ Fully supported
- Mobile Browsers: ✓ Responsive design

## Future Enhancements

Possible additions:
1. Sound notification on alert trigger
2. Different alert types (error, warning, success, info)
3. Alert history/logging
4. Persistent alerts that don't auto-close
5. Multiple alerts queue system
6. Alert severity levels with different styling
