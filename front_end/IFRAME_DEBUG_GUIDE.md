# How to Get Iframe Console Logs

This guide explains different methods to access console logs from the login page when it's loaded in an iframe.

## Method 1: Direct Console Access (Same Origin)

If the iframe and parent page are on the same domain:

1. **Open DevTools** (F12) on the parent page
2. **Go to Console tab**
3. **Select the iframe context** from the dropdown at the top of the console
   - Look for a dropdown that says "top" or "frame" and select your iframe
4. All console logs from the iframe will appear there

## Method 2: Inspect Iframe Element

1. **Right-click on the iframe** → "Inspect Element"
2. In the **Elements** panel, select the `<iframe>` element
3. In the **Console** tab, the context should automatically switch to the iframe
4. You'll see all logs from the iframe

## Method 3: Open Iframe URL Directly

1. **Get the iframe URL** (e.g., `https://yourdomain.com/login?username=user@example.com`)
2. **Open it in a new tab** directly
3. **Open DevTools** (F12) on that tab
4. All console logs will be visible in the Console tab

## Method 4: PostMessage Listener (Cross-Origin Support)

The login page now automatically sends logs to the parent window via `postMessage`. Add this code to your parent page to receive the logs:

### HTML Example

```html
<!DOCTYPE html>
<html>
<head>
    <title>Parent Page with Iframe</title>
</head>
<body>
    <iframe 
        id="loginFrame"
        src="https://yourdomain.com/login?username=user@example.com"
        width="100%"
        height="600"
    ></iframe>

    <div id="logs" style="background: #000; color: #0f0; padding: 10px; font-family: monospace; max-height: 300px; overflow-y: auto;">
        <h3>Auto-Login Logs:</h3>
        <div id="logContent"></div>
    </div>

    <script>
        const logContent = document.getElementById('logContent');
        
        // Listen for messages from iframe
        window.addEventListener('message', function(event) {
            // For security, you should verify event.origin
            // if (event.origin !== 'https://yourdomain.com') return;
            
            if (event.data && event.data.type) {
                const logEntry = document.createElement('div');
                logEntry.style.marginBottom = '5px';
                
                switch(event.data.type) {
                    case 'AUTO_LOGIN_LOG':
                        logEntry.style.color = '#0f0'; // Green
                        logEntry.textContent = '[LOG] ' + event.data.message;
                        break;
                    case 'AUTO_LOGIN_SUCCESS':
                        logEntry.style.color = '#0ff'; // Cyan
                        logEntry.textContent = '[SUCCESS] ' + event.data.message;
                        if (event.data.data) {
                            const details = document.createElement('div');
                            details.style.marginLeft = '20px';
                            details.style.fontSize = '12px';
                            details.textContent = JSON.stringify(event.data.data, null, 2);
                            logEntry.appendChild(details);
                        }
                        break;
                    case 'AUTO_LOGIN_ERROR':
                        logEntry.style.color = '#f00'; // Red
                        logEntry.textContent = '[ERROR] ' + event.data.message;
                        if (event.data.error) {
                            const errorDetails = document.createElement('div');
                            errorDetails.style.marginLeft = '20px';
                            errorDetails.style.fontSize = '12px';
                            errorDetails.style.color = '#f88';
                            errorDetails.textContent = event.data.error;
                            logEntry.appendChild(errorDetails);
                        }
                        break;
                }
                
                logContent.appendChild(logEntry);
                logContent.scrollTop = logContent.scrollHeight; // Auto-scroll
                
                // Also log to console
                console.log('[Iframe Message]', event.data);
            }
        });
    </script>
</body>
</html>
```

### React Example

```jsx
import { useEffect } from 'react';

function ParentPage() {
  useEffect(() => {
    const handleMessage = (event) => {
      // Verify origin for security
      // if (event.origin !== 'https://yourdomain.com') return;
      
      if (event.data && event.data.type) {
        switch(event.data.type) {
          case 'AUTO_LOGIN_LOG':
            console.log('[Iframe LOG]', event.data.message);
            break;
          case 'AUTO_LOGIN_SUCCESS':
            console.log('[Iframe SUCCESS]', event.data.message, event.data.data);
            break;
          case 'AUTO_LOGIN_ERROR':
            console.error('[Iframe ERROR]', event.data.message, event.data.error);
            break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  return (
    <div>
      <iframe 
        src="https://yourdomain.com/login?username=user@example.com"
        width="100%"
        height="600"
      />
    </div>
  );
}
```

## Method 5: Browser Extension

Some browser extensions can help capture iframe logs:
- **Chrome**: "Iframe Log Viewer" extensions
- **Firefox**: Built-in iframe console switching

## Expected Log Messages

When auto-login is working, you should see these messages:

1. `[Auto-login] Found username from window.location.search: user@example.com`
2. `[Auto-login] Attempting auto-login with username: ...`
3. `[Auto-login] Starting login process...`
4. `[Auto-login] Login successful. User ID: ...`

If it's not working, you might see:
- `[Auto-login] No username parameter found. URL: ...`
- `[Auto-login] Skipped - conditions not met: ...`
- `[Auto-login] Login failed: ...`

## Troubleshooting

### No logs appearing?

1. **Check if JavaScript is enabled** in the iframe
2. **Check browser console** for any errors
3. **Verify the URL** has the `username` parameter
4. **Check CORS settings** if cross-origin
5. **Try Method 3** (open URL directly) to see if logs work outside iframe

### Logs appear but auto-login doesn't work?

1. Check the log messages to see where it's failing
2. Look for error messages in the logs
3. Verify the username format is correct
4. Check network tab for failed API requests

## Security Note

When using `postMessage`, always verify the `event.origin` in production:

```javascript
window.addEventListener('message', function(event) {
    // Only accept messages from trusted origin
    if (event.origin !== 'https://yourdomain.com') {
        return;
    }
    // Process message...
});
```

