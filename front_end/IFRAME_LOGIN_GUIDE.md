# Iframe Auto-Login Guide

This guide explains how to use the login page with auto-login functionality in an iframe.

## Overview

The login page supports automatic login via URL parameters (`username` and `password`). When these parameters are present, the page will automatically authenticate the user without requiring manual form submission.

## URL Format

### Basic Format
```
/login?username=USER_EMAIL&password=BASE64_ENCODED_PASSWORD
```

### Parameters

- **`username`** (required): The user's email address.
  - Example: `user@example.com`
  
- **`password`** (required): The user's password encoded in Base64
  - The password must be Base64 encoded before being added to the URL
  - Example: If password is `mypassword123`, the Base64 encoded value is `bXlwYXNzd29yZDEyMw==`

### Full Example

```
https://yourdomain.com/login?username=user@example.com&password=bXlwYXNzd29yZDEyMw==
```

## Base64 Encoding

You need to encode the password in Base64 before adding it to the URL.

### JavaScript
```javascript
const password = 'mypassword123';
const encodedPassword = btoa(password); // Returns: bXlwYXNzd29yZDEyMw==
```

### Python
```python
import base64

password = 'mypassword123'
encoded_password = base64.b64encode(password.encode()).decode()
# Returns: bXlwYXNzd29yZDEyMw==
```

### PHP
```php
$password = 'mypassword123';
$encodedPassword = base64_encode($password);
// Returns: bXlwYXNzd29yZDEyMw==
```

### Online Tools
You can also use online Base64 encoders like:
- https://www.base64encode.org/
- https://base64.guru/converter/encode

## Using in an Iframe

### HTML Example

```html
<iframe 
  src="https://yourdomain.com/login?username=user@example.com&password=bXlwYXNzd29yZDEyMw=="
  width="100%"
  height="600"
  frameborder="0"
  allow="autoplay"
></iframe>
```

### React Example

```jsx
function LoginIframe() {
  const username = 'user@example.com';
  const password = 'mypassword123';
  const encodedPassword = btoa(password);
  
  const loginUrl = `https://yourdomain.com/login?username=${encodeURIComponent(username)}&password=${encodedPassword}`;
  
  return (
    <iframe
      src={loginUrl}
      width="100%"
      height="600"
      frameBorder="0"
      allow="autoplay"
    />
  );
}
```

### Important Notes for Iframe Usage

1. **URL Encoding**: Make sure to properly URL-encode the username (email) parameter:
   ```javascript
   encodeURIComponent('user@example.com') // Handles special characters
   ```

2. **Cross-Origin**: If the iframe is on a different domain, ensure CORS is properly configured.

3. **Redirect Behavior**: After successful login:
   - If user has a connected account: Redirects to `/accounts/{accountId}`
   - If user has no connected account: Redirects to `/accounts`
   - In iframe context, the redirect will attempt to navigate the parent window if possible

4. **Admin Login**: When using URL parameters, the login automatically includes `admin: true` in the API request.

## Security Considerations

⚠️ **Important Security Notes:**

1. **Never expose passwords in plain text** - Always use Base64 encoding (though Base64 is not encryption, it's better than plain text)

2. **Use HTTPS** - Always use HTTPS when passing credentials, even if Base64 encoded

3. **URL Length Limits** - Be aware that URLs have length limits (typically 2048 characters). Very long passwords might cause issues.

4. **Browser History** - URLs with credentials may be stored in browser history. Consider this for sensitive applications.

5. **Logging** - Server logs may contain URLs with credentials. Ensure proper log security.

## Error Handling

The auto-login will handle errors gracefully:

- **Invalid Base64**: If password decoding fails, an error message is displayed
- **Invalid Credentials**: If login fails, the standard "Invalid email or password" error is shown
- **Missing Parameters**: If either `username` or `password` is missing, auto-login is skipped

## Testing

### Test URL Example

```bash
# Test with a real account
https://yourdomain.com/login?username=test@example.com&password=dGVzdHBhc3N3b3Jk
```

### Manual Testing Steps

1. Encode your test password to Base64
2. Construct the URL with username and encoded password
3. Open the URL in a browser or iframe
4. The page should automatically log in and redirect

## Troubleshooting

### Auto-login not working in iframe

1. **Check URL parameters**: Verify both `username` and `password` are present
2. **Check Base64 encoding**: Ensure password is properly Base64 encoded
3. **Check console**: Look for JavaScript errors in browser console
4. **Check network**: Verify the login API call is being made
5. **Check CORS**: Ensure cross-origin requests are allowed if iframe is on different domain

### Common Issues

- **Password encoding**: Make sure you're encoding the actual password, not an already-encoded value
- **Special characters**: URL-encode the username parameter if it contains special characters
- **Timing**: The auto-login has a 200ms delay to ensure everything is initialized

## Support

If you encounter issues, check:
1. Browser console for errors
2. Network tab for failed API requests
3. That both parameters are correctly formatted in the URL

