/**
 * Capacitor configuration — C1.1
 *
 * Wraps the Next.js app into iOS + Android native shells via Capacitor.
 * The web layer is identical to discoverparadocs.com; native shells get
 * their own bundle ID, app icon, splash screen, and access to native
 * APIs (push, share, biometric, deep links).
 *
 * Build flow:
 *   1. `npm run cap:build` — produces `out/` via `next build && next export`
 *      under PARADOCS_CAPACITOR=1 (see next.config.js for static-export gating)
 *   2. `npm run cap:sync` — copies `out/` into both native projects
 *   3. `npm run cap:open:ios` / `npm run cap:open:android` — opens Xcode / Android Studio
 *   4. Build + archive in the native IDE → upload to App Store Connect / Play Console
 *
 * server.url alternative: during development you can point the native
 * shell at your local dev server (`npm run dev` on port 3000) by
 * uncommenting the `server` block below. Comment it back out before
 * shipping.
 */

import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.paradocs.app',
  appName: 'Paradocs',
  webDir: 'out',
  // The bundled static export ships in the native binary; runtime API
  // calls go to the deployed Vercel backend at discoverparadocs.com
  // (Capacitor doesn't host APIs, only the front-end web layer).
  bundledWebRuntime: false,

  ios: {
    // Allow links to discoverparadocs.com to open in-app via Universal
    // Links once C2.2 deep-linking is wired and the
    // apple-app-site-association file is served from the web origin.
    contentInset: 'always',
    scrollEnabled: true,
    // Backgrounds the splash for 1.5s while the bundled web layer hydrates
    backgroundColor: '#0a0a14',
  },

  android: {
    // Same intent: serve assetlinks.json from the web origin to enable
    // Android App Links (the Google equivalent of Universal Links).
    allowMixedContent: false,
    backgroundColor: '#0a0a14',
  },

  plugins: {
    SplashScreen: {
      // Stays up until the web view reports first paint. App icon + splash
      // images live under the native projects (ios/App/App/Assets.xcassets,
      // android/app/src/main/res/) and are generated from the master sources
      // produced in C3.3.
      launchShowDuration: 1500,
      backgroundColor: '#0a0a14',
      showSpinner: false,
    },
    PushNotifications: {
      // Native push uses APNs (iOS) + FCM (Android) — wired in C2.1.
      // Token registration happens on first launch; tokens are posted
      // to /api/push/register-native and stored alongside web push subs.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },

  // During development you can point the native shell at your local
  // dev server. KEEP THIS COMMENTED OUT before building for distribution.
  // server: {
  //   url: 'http://192.168.X.X:3000',
  //   cleartext: true,
  // },
}

export default config
