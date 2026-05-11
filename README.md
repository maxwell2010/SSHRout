# SSHRout

SSHRout is a Windows desktop SSH client with a remote file manager and an interactive terminal. It is inspired by tools like MobaXterm: connect to a server, browse files over SFTP, upload/download data, change permissions, and work in a shell from one window.

The default UI language is Russian. English can be enabled from the top menu: `Язык -> English`.

## Features

- Saved SSH sessions with name, color, icon, host, port, user, password or private key.
- Multiple active server connections with quick switching from the `Серверы` panel.
- Interactive SSH terminal based on xterm.js.
- Remote SFTP file manager:
  - browse directories;
  - upload files;
  - download files;
  - create folders;
  - rename files and folders;
  - delete files and empty folders;
  - change permissions with chmod, for example `755` or `644`.
- File type coloring and icons for folders, code, text, images, archives, and regular files.
- Permissions column with values like `rwxr-xr-x`.
- Bottom monitoring bar for the active server:
  - load average;
  - RAM usage;
  - uptime;
  - disk usage by mount point.
- Dark Windows-oriented interface.

## Requirements

- Windows 10/11
- Node.js 22+
- npm 11+

## Development

Install dependencies:

```powershell
npm install
```

Run the development version:

```powershell
npm run electron:dev
```

Build renderer and Electron main process:

```powershell
npm run build
```

Run the built app locally:

```powershell
npm start
```

## Build Windows Installer

Create a Windows x64 NSIS installer:

```powershell
npm run dist
```

The installer will be created in the `release/` directory.

## Android Preview Branch

The `android-version` branch contains an Android/Capacitor preview build.

Build the Android release APK:

```powershell
npm run android:build
```

The local APK is generated here:

```text
android/app/build/outputs/apk/release/app-release-unsigned.apk
```

Current Android limitation: this preview includes the mobile UI shell, but the native Android SSH/SFTP bridge is not implemented yet. The Windows desktop app remains the fully working version.

## Releases

GitHub releases are intended to contain the Windows installer produced by `npm run dist`.

Suggested release flow:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

Then attach the generated installer from `release/` to the GitHub release.

## Security Notes

Saved sessions are currently stored by Electron in the app data directory as a local JSON file. Treat this as an early MVP storage model. For production use, passwords and private key passphrases should be moved to Windows Credential Manager or another encrypted secret store.

## Current Status

This is an early working MVP. Core SSH terminal and SFTP file operations are implemented, but the project still needs deeper testing for large transfers, recursive folder operations, and packaged release signing.
