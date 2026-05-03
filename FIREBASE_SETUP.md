# Firebase Setup Guide

## Error: auth/configuration-not-found

This error means your Firebase project is not properly configured. Follow these steps to set up Firebase Authentication:

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"
3. Enter your project name (e.g., "my-room-budget-app")
4. Follow the setup wizard

### 2. Enable Authentication

1. In your Firebase project, go to **Authentication** in the left sidebar
2. Click on the **Sign-in method** tab
3. Enable **Email/Password** provider
4. Click **Save**

### 3. Enable Firestore Database

1. Go to **Firestore Database** in the left sidebar
2. Click **Create database**
3. Choose **Start in test mode** (for development)
4. Select a location for your database

### 4. Get Your Firebase Config

1. Click the gear icon (⚙️) → **Project settings**
2. Scroll down to "Your apps" section
3. Click the web icon (`</>`) to add a web app
4. Register your app with a nickname (e.g., "Room Budget App")
5. Copy the config object that looks like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
```

### 5. Update Your Code

1. Open `firebase-config.js`
2. Replace the placeholder config with your actual Firebase config
3. Save the file

### 6. Test Registration

1. Open `register.html` in your browser
2. Try registering with an email and password
3. The registration should now work!

## Security Rules

For production, update your Firestore security rules in the Firebase Console:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow authenticated users to read/write their own data
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Troubleshooting

- **Still getting errors?** Double-check that Authentication is enabled
- **CORS errors?** Make sure you're running the app from a web server (not file://)
- **Project not found?** Verify the project ID in your config matches the Firebase console

## Need Help?

Check the [Firebase Documentation](https://firebase.google.com/docs/auth/web/start) for more details.