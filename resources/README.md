# Bundled engine files

The distributable application bundles these files, but they are intentionally excluded from the lightweight source archive:

- `mihomo` — macOS Apple Silicon engine binary
- `mihomo.exe` — Windows x64 engine binary
- `wintun.dll` — Windows virtual network adapter library

Download trusted release assets from the upstream projects, verify their checksums, and place them in this folder before building a distributable app.

- Mihomo releases: https://github.com/MetaCubeX/mihomo/releases
- Wintun releases: https://www.wintun.net/

Do not replace these files with binaries from untrusted sources.
