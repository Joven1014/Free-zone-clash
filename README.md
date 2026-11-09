# Freezone Internet

Freezone Internet is an experimental desktop client for Clash-compatible YAML profiles. It provides a clear, website-style dashboard for choosing a profile and starting a local connection engine.

## Current platforms

- **macOS (Apple Silicon):** local proxy connection with optional Wi-Fi system-proxy settings.
- **Windows x64:** device-wide TUN mode using the bundled connection engine and Wintun. Windows requests administrator permission because creating a virtual adapter and routes needs elevated access.

## Features

- Import an HTTPS subscription URL, paste YAML, or choose a local YAML file.
- Optional community default profile.
- Local-only profile storage.
- Connection readiness check before the interface reports a successful connection.
- Local engine log and Windows network-recovery action.
- Website-style navigation, activity view, and settings.

## Run locally

Requirements: Node.js 18 or newer.

```bash
npm install
npm start
```

## Build installers

```bash
# macOS Apple Silicon DMG
npm run dist

# Windows x64 app folder
npm run dist:win
```

The Windows build command creates `release/win-unpacked/`. Package that folder as a ZIP or sign it with your own Windows code-signing certificate before distribution. Before building from a lightweight source archive, restore the engine files described in [`resources/README.md`](resources/README.md).

## Important notes

- This project is experimental and needs real Windows-device testing before a public production release.
- A Clash subscription is not the same thing as a traditional IKEv2 or IPsec VPN profile.
- Review every profile before importing it. The community default is externally maintained and may change or stop working.
- Do not commit personal subscription URLs, credentials, certificates, or packaged installers.

## Third-party components

The application bundles a connection engine and Wintun for development and packaging. Review their upstream licenses and release terms before publishing a release.
