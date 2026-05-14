# Android APK build notes

This document explains how the Android APK for SSHRout is built, what the Android version is written with, and why the build is fast enough for quick iteration. It is intended as a reusable reference for other services that want to borrow the same APK build approach.

## Stack

SSHRout Android is a hybrid mobile application:

- UI: React 18 + TypeScript.
- Bundler: Vite.
- Native Android wrapper: Capacitor.
- Android project: Gradle + Android Gradle Plugin.
- Native SSH bridge: Java Capacitor plugin.
- SSH library on Android: `com.github.mwiede:jsch`.
- Terminal UI: xterm.js in WebView.

The same React UI is used by the Windows Electron app and the Android app. Platform-specific behavior is isolated behind `window.sshRoute`:

- Electron exposes it from `electron/preload.ts`.
- Android exposes it through `src/platform.ts` and the native Capacitor plugin in `android/app/src/main/java/com/maxwell2010/sshrout/SSHRoutePlugin.java`.

## Important Files

- `package.json`: npm scripts for web and Android builds.
- `capacitor.config.ts`: Capacitor app id, app name, and web output directory.
- `src/platform.ts`: Android-side bridge adapter for the React app.
- `android/app/build.gradle`: Android build settings, dependencies, and preview signing.
- `android/app/src/main/AndroidManifest.xml`: Android permissions and activity settings.
- `android/app/src/main/java/com/maxwell2010/sshrout/SSHRoutePlugin.java`: native Android SSH/SFTP bridge.

## Build Commands

Install dependencies once:

```powershell
npm install
```

Build only the web assets:

```powershell
npm run build:web
```

Sync web assets into the Android project:

```powershell
npm run android:sync
```

Build an installable Android preview APK:

```powershell
npm run android:build
```

Build a debug APK:

```powershell
npm run android:build-debug
```

The main local preview APK is copied to:

```text
release/SSHRout-android-preview-installable.apk
```

The Gradle output APK is:

```text
android/app/build/outputs/apk/release/app-release.apk
```

## What `npm run android:build` Does

The script is:

```json
"android:build": "npm run android:sync && cd android && gradlew.bat assembleRelease"
```

It runs these steps:

1. Type-checks TypeScript with `tsc`.
2. Builds the React app with Vite into `dist/`.
3. Runs `capacitor sync android`, which copies `dist/` into the Android project.
4. Runs Gradle `assembleRelease`.
5. Produces an APK from the Android project.

## Why Builds Are Fast

The build is fast because most work is incremental:

- Vite only bundles the web app and is very quick for React/TypeScript projects.
- Capacitor copies static web assets into Android instead of recompiling UI as native views.
- Gradle reuses its build cache and daemon after the first run.
- Android Java code is small and isolated to the bridge plugin.
- Dependencies are stable and installed once through npm and Gradle caches.
- The Android app does not run a heavy native UI framework compile step.

In practice, the first Android build is slower because Gradle starts a daemon and resolves dependencies. Later builds are much faster because only changed web assets or changed Java files are rebuilt.

## Preview Signing

For local testing, the Android `release` build is signed with the debug signing config:

```gradle
buildTypes {
    release {
        minifyEnabled false
        signingConfig signingConfigs.debug
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
    }
}
```

This is intentional for preview builds because it creates an installable APK without setting up a production keystore.

Important:

- This is good for internal testing.
- This is not a production Play Store signing setup.
- A real public release should use a private release keystore and should not commit that keystore to git.

Verify APK signing:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.0.0\apksigner.bat" verify --verbose release\SSHRout-android-preview-installable.apk
```

Expected result includes:

```text
Verifies
Verified using v2 scheme (APK Signature Scheme v2): true
Number of signers: 1
```

## Capacitor Configuration

`capacitor.config.ts`:

```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.maxwell2010.sshrout",
  appName: "SSHRout",
  webDir: "dist",
  bundledWebRuntime: false
};

export default config;
```

Key idea: Vite outputs the app into `dist/`, and Capacitor packages that directory into Android WebView assets.

## Native Android Bridge Pattern

The React app talks to a single abstract API:

```ts
window.sshRoute.connect(...)
window.sshRoute.listSavedSessions()
window.sshRoute.saveSession(...)
window.sshRoute.listDirectory(...)
window.sshRoute.writeTerminal(...)
```

On Android, `src/platform.ts` registers a Capacitor plugin:

```ts
const native = registerPlugin<SSHRouteNativePlugin>("SSHRoute");
```

The Java plugin exposes native methods such as:

- `connect`
- `disconnect`
- `startTerminal`
- `writeTerminal`
- `listDirectory`
- `saveSession`
- `listSavedSessions`

This keeps the React UI platform-neutral and places Android-specific code only in the Android plugin.

## Android Permissions

The Android app needs network access for SSH:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

The activity uses:

```xml
android:windowSoftInputMode="adjustResize"
```

This helps the WebView resize when the software keyboard opens.

## Local APK Copy Step

After a successful build, copy the Gradle APK to the stable local file name:

```powershell
Copy-Item android\app\build\outputs\apk\release\app-release.apk release\SSHRout-android-preview-installable.apk -Force
```

This gives testers one predictable file path.

## Common Installation Issues

If Android says the APK cannot be installed:

- Make sure the file is `SSHRout-android-preview-installable.apk`, not an old unsigned APK.
- Uninstall the previous app first if it was signed with a different key.
- Confirm Android version is 7.0+ because `minSdkVersion` is 24.
- Enable installing apps from unknown sources for the app used to open the APK.

If ADB install fails on Windows:

```powershell
Get-Process -Name adb -ErrorAction SilentlyContinue | Stop-Process -Force
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" start-server
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
```

Then install:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r release\SSHRout-android-preview-installable.apk
```

## What Other Services Can Reuse

The useful pattern is:

1. Build the UI as a normal Vite web app.
2. Wrap it with Capacitor for Android.
3. Keep platform APIs behind one JavaScript facade.
4. Implement only true native functionality as Capacitor plugins.
5. Use debug signing for internal preview APKs.
6. Keep a stable local APK filename for testers.
7. Do not publish preview Android releases until the APK is ready.

## Security Notes

Do not commit:

- saved sessions;
- passwords;
- private keys;
- release keystores;
- generated APKs unless intentionally publishing artifacts.

In this project, generated output such as `release/`, `dist/`, and `node_modules/` is ignored by git.

## Current Android Status

The Android branch is a preview branch. It has:

- mobile UI;
- local session saving;
- SSH connection bridge;
- terminal bridge;
- basic SFTP operations.

Known remaining work:

- production signing;
- better Android file upload/download pickers;
- deeper real-device testing across screen sizes;
- encrypted credential storage.
