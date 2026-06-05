import type { CapacitorConfig } from '@capacitor/cli';

/**
 * OlomiPay — Capacitor (native iOS/Android shell).
 *
 * HOSTED MODE: the native app loads the live web app and connects to the SAME
 * Railway backend (API + Socket.io) as the website. No backend changes needed
 * for it to run — only push/CORS additions to make it feel fully native.
 *
 * When you move to a bundled/offline build later, drop `server.url` and point
 * `webDir` at an exported static build instead.
 */
const config: CapacitorConfig = {
  appId: 'com.olomipay.app',
  appName: 'OlomiPay',
  webDir: 'www',
  server: {
    // The live web app. Change to a staging URL while testing if you like.
    url: 'https://olomipay.vercel.app',
    cleartext: false,
  },
  backgroundColor: '#060b18',
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#060b18',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
