# OlomiPay — Mobile apps (Capacitor)

Native **iOS + Android** shell that wraps the OlomiPay web app and talks to the
**same Railway backend** (API + Socket.io) as the website. This is set up in
**hosted mode** — it loads `https://olomipay.vercel.app` inside a native app and
adds native features (push, biometrics, QR) on top.

> You build the apps from this folder. The `android/` and `ios/` native projects
> are generated on your machine by `npx cap add` (they're not committed yet).

---

## Prerequisites

| For | Install |
|-----|---------|
| Both | **Node.js 18+** (you already have it) |
| **Android** | **Android Studio** (free) — includes the JDK + emulator |
| **iOS** | A **Mac with Xcode**, OR a cloud Mac build (**Codemagic** / **EAS**) — Apple requires macOS to build iOS |
| Push (later) | A free **Firebase** project (FCM) + Apple **APNs key** (.p8) |

---

## 1. Android (do this first — works on Windows)

```bash
cd mobile
npm install
npx cap add android      # generates the android/ project
npx cap sync             # copies config + plugins into it
npx cap open android     # opens Android Studio
```

In Android Studio: pick an emulator or plug in a phone → press **Run ▶**.
The OlomiPay app launches and loads the live site against your Railway backend.

To build a shareable APK/AAB: **Build → Build Bundle(s)/APK(s)**.

---

## 2. iOS (needs a Mac or a cloud Mac)

On a Mac:
```bash
cd mobile
npm install
npx cap add ios
npx cap sync
npx cap open ios         # opens Xcode → Run ▶ on a simulator/device
```

No Mac? Use **Codemagic** (recommended for Capacitor) or **Expo EAS Build** to
compile + sign in the cloud — point it at this repo, root `mobile/`.

---

## 3. App identity

- **App ID:** `com.olomipay.app`
- **App name:** `OlomiPay`
- Change these in `capacitor.config.ts` before your first store submission if needed.

---

## 4. Whenever the config or plugins change

```bash
npx cap sync
```

(Re-run after adding any plugin or editing `capacitor.config.ts`.)

---

## 5. Coming next (I'll wire these when you're ready)

- **Push notifications** — native FCM (Android) + APNs (iOS). Needs your Firebase
  config files (`google-services.json`, `GoogleService-Info.plist`) + APNs key,
  plus a small backend change to send native push. Place the config files here
  (they're git-ignored) and tell me.
- **Biometric unlock** (Face ID / fingerprint) for login + payment confirm.
- **Secure token storage** (Keychain / Keystore).
- **Native QR scanner** for scan-to-pay.
- **Deep links** so notification taps open the right screen.

---

## Store accounts you'll need

- **Google Play Developer** — $25 one-time.
- **Apple Developer Program** — $99/year (also required for iOS push/APNs).
- A hosted **privacy policy URL** (both stores require it).

## Security note

Never commit signing keys or Firebase/APNs secrets — `.gitignore` already blocks
`*.keystore`, `*.jks`, `*.p8`, `google-services.json`, `GoogleService-Info.plist`.
