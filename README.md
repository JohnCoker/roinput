## RASOrbit Input Editor

RASOrbit Input Editor is a desktop app (Tauri + React) for editing input files for
[RASOrbit](http://www.rasaero.com).

> [!TIP]
> For downloads and basic usage [see the product page](https://johncoker.github.io/roinput).

## Development

The application version is defined only in `src-tauri/Cargo.toml` (`[package] version`).
Tauri reads that for bundles and the About dialog. The app uses it for upgrade checks.

### Prerequisites

- Node.js and npm
- Rust toolchain

### Building the app

From the `roinput` directory:

```bash
npm install
npm run tauri dev
```

This starts the React dev server and launches the Tauri shell window pointing at it.

### Production build

```bash
npm install
npm run tauri build
```

This produces a platform‑native bundle / installer in Tauri’s bundle output directory.

### App icon

`apple-icon.sh` regenerates `src-tauri/icons/icon.icns` from `artwork/app-icon-apple.png`.
The `src-tauri/icons/` directory ships with placeholder icons until roinput artwork is produced.

## License

Copyright © 2026 [John Coker](mailto:john@jcsw.com)
Licensed under the ISC License. See `LICENSE` for details.

This app is free software; feel free to use it for personal, educational or commercial missions.
There is no support and no warranty.
