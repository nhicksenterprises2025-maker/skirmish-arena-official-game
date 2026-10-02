# Building Skirmish Arena

Players should use the [Windows installer](https://github.com/nhicksenterprises2025-maker/skirmish-arena-official-game/releases/latest). These instructions are for working on the source.

## Browser development

Use Node 24.15 or newer in the Node 24 series. From the repository root:

```powershell
npm ci
$env:SAR_DB_PATH = Join-Path $env:LOCALAPPDATA 'SkirmishArenaDevelopment/skirmish.sqlite'
$env:SAR_PORT = '8804'
npm start
```

Open `http://127.0.0.1:8804`. This uses a separate development database and port, so it does not reuse an installed player's account service. Accounts and browser storage belong to this address. Do not copy a live database into the repository.

The shipped models, audio and renderer are already present. Blender and audio authoring tools are not needed to run the game.

## Windows desktop

Install the Rust MSVC toolchain, Visual Studio C++ Build Tools with the Windows SDK, and WebView2. Use the same Node version as above.

```powershell
npm ci
cd launcher
npm ci
node scripts/stage-backend.cjs
npm run dev
```

The desktop launcher defaults to the installed account service on port 8803. For an isolated development account, set its **Server connection** to `http://127.0.0.1:8804` while the browser-development server above is running. Do not run destructive tests against your playing account.

Official installers are built through `launcher/scripts/build.ps1`. This requires the existing updater signing key, which is deliberately kept outside the repository. The pinned public key is included. Do not replace that key to build an official update. See [launcher maintenance](../launcher/README.md) for packaging, signature verification and publication to the configured update server.

GitHub Releases distributes the installer for direct download. It does not replace the configured in-game update server or move anyone's account database to GitHub.

## Asset sources

Editable `.blend` files and exported `.glb` assets are in `assets/25d/`. Export scripts are in `tools/`; the [Blender pipeline](BLENDER_PIPELINE.md) documents the existing node and attachment contracts.

All runtime audio is included. To rebuild it, also download [prepared-firearm-library.zip](https://github.com/nhicksenterprises2025-maker/skirmish-arena-official-game/releases/download/v1.9.3/prepared-firearm-library.zip) from the release and place it at:

```text
assets/audio/source/prepared-firearm-library.zip
```

This 228 MB source archive exceeds GitHub's per-file Git limit. It is distributed unchanged as a release asset, with its SHA-256 in the release's `SHA256SUMS.txt`. Other original audio sources are tracked in the repository. Credits, licenses and source hashes are in `assets/audio/LICENSES.json`. Audio authoring uses Python with `numpy` and `imageio-ffmpeg`; see `dev/prepare-fieldcraft-audio.py`.

## Checks

From the repository root:

```powershell
npm run test:server
node dev/progression-check.cjs
node dev/core-gameplay-check.cjs
npm run test:spread
node tools/blender_validate.mjs
```

`npm test` runs the broader existing server, gameplay and client suite. Historical test scripts retain their version-specific expectations; refer to [maintenance routing](LIVE-CIRCUIT.md) for the checks that apply to a changed system.

The startup browser check uses Playwright. Set `SAR_PLAYWRIGHT` to the absolute path of your installed Playwright module, then run `node dev/startup-contract-check.cjs`. Windows installer and service-lifecycle checks require the staged native build. Run `npm run test:release` after staging, and `cargo test --manifest-path launcher/src-tauri/Cargo.toml` for native tests.

Tests and generated installers are not personal save backups. Keep playing accounts and release signing keys outside the checkout.
