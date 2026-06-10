import type { CapacitorConfig } from '@capacitor/cli';

/**
 * JIKO CONNECT Android wrapper.
 *
 * The native shell loads the live PWA (server.url), so the Android app always
 * runs the latest deployed web build with no re-publish needed. webDir is only
 * the fallback bundle Capacitor copies during `cap add/sync`.
 *
 * To point at a different domain, change server.url (and re-run `cap sync`).
 */
const config: CapacitorConfig = {
  appId:   'tz.jikoconnect.app',
  appName: 'JIKO CONNECT',
  webDir:  'capacitor-www',
  server: {
    url: process.env.CAP_SERVER_URL ?? 'https://olomipay.vercel.app',
    cleartext: false,
  },
  android: {
    backgroundColor: '#160F0A',
  },
};

export default config;
