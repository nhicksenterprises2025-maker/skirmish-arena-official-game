# Skirmish Arena desktop launcher

Public game and window branding is **Skirmish Arena**. The historical installer product name and application identifier stay unchanged so updates reuse the existing installation, saved server configuration and account WebView. The small NSIS hook sets the public Installed Apps display name and setup caption, and renames installer-owned Start Menu/Desktop shortcuts after verifying their exact executable target. `installer-english.nsh` overrides the installer's display Name after the default template, so Welcome, Finish, Run and maintenance text also use the public title while the `PRODUCTNAME` path constant remains unchanged. It preserves shortcut targets, account paths and the existing uninstall registry key. Cancelled setup and unrelated shortcuts remain untouched.

The current desktop build is **1.9.3 — STARTUP REPAIR**. The Tauri 2 launcher opens the game from the configured account server in a separate persistent WebView and enters fullscreen. **F11** or the game's **Fullscreen** button switches between fullscreen and a normal window. Save-checkpoint and fullscreen commands are protected by the exact game origin; launcher and installation actions remain restricted to the bundled UI. Account databases and WebView profiles remain outside the installer payload.

The default connection is `http://127.0.0.1:8803`. Open the installed desktop shortcut and press **Play**. The app starts its bundled local backend invisibly and waits for health before opening the game; no terminal, npm command, separately installed Node, or Retry Connection is required. An already healthy compatible backend is reused, and a Windows process lock prevents duplicate startup. The shared service stays available after a game window closes so other browser/desktop windows and queued local messages are preserved. Hosted HTTPS connections never start a local backend. To install a shortcut, run **launcher/dist/Skirmish Arena Reimagined_1.9.3_x64-setup.exe** once. The browser game also enters fullscreen when you press **Play** or **Watch**, unless you turn off automatic fullscreen under **Settings → View**. Press **F11** to switch views; intentional Windows **Alt+Tab** continues to work.

The existing database stays in `SkirmishArenaServer/skirmish.sqlite` under Windows local application data. Existing installations created through packaged Codex retain their exact physical `Packages/OpenAI.Codex_*/LocalCache` database, account WebView, and connection configuration when Explorer launches the shortcut. `desktop-local-paths.json` records those selected paths. Startup failures are logged in the service directory's `startup.log`, `server.stdout.log`, and `server.stderr.log`. A static-only shell can keep an authenticated cached world reachable at the same origin if the local backend fails; first-time accounts still need the backend. Ollama remains an independent local service with the same GPT-OSS integration.

For a hosted universe, open **Server connection** and enter the backend's HTTPS origin. Browser and launcher use the same backend accounts and world records; sign in separately in each browser/WebView. Login cookies and launcher settings persist outside the installation directory. Local bot conversations use the existing Ollama service at `http://127.0.0.1:11434` and its installed `gpt-oss:20b` model. The launcher does not install, download or replace that model. Check **Settings → Messaging** in the game for the live connection and queue status.

After an update, the launcher verifies the owned local service and gracefully hands it off if its release is stale. Private named-pipe control checkpoints SQLite before shutdown. A pre-control legacy process is eligible only when its executable, entry point, process ID and open canonical database are verified. Unverified or remote processes remain untouched. The desktop preflight then verifies the backend, activates the exact service-worker version/cache revision from `version.json` and checks the actual `SAR.getVersion()` code identity. A stale worker with the same release number must still be replaced. Large world snapshots and retained local branches commit to durable IndexedDB before the game acknowledges an update checkpoint; account storage remains outside installation files.

## Build on Windows

Requires Rust with the MSVC toolchain, Visual Studio C++ Build Tools, Node, and WebView2. Install launcher dependencies with `npm ci`, then run:

```powershell
.\scripts\build.ps1
```

The generated updater private key is stored at `%USERPROFILE%\.tauri\skirmish\updater.key`, outside this release. Keep a secure backup: future updates must use the same key. The public key is pinned in `src-tauri/tauri.conf.json`. Neither the private key nor any account database belongs in an installer or release archive.

The build produces `src-tauri/target/release/skirmish-launcher.exe` and a per-user NSIS installer under `src-tauri/target/release/bundle/nsis`. The installer also has a `.sig` file. This updater signature is separate from Windows Authenticode signing; no Windows publisher certificate was supplied.

## Publish a signed launcher update

Edit the root `version.json` version, update name, date and categorized notes, then run `node dev/release-meta.cjs` from the release root. This generates the shared game/build metadata and updates root/launcher package versions, native Cargo/config versions and HTML identity. Build with the existing private key, then generate release files from `launcher/`:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = "$env:USERPROFILE/.tauri/skirmish/updater.key"
$env:TAURI_SIGNING_PRIVATE_KEY = $env:TAURI_SIGNING_PRIVATE_KEY_PATH
node scripts/release.cjs "src-tauri/target/release/bundle/nsis/Skirmish Arena Reimagined_1.9.3_x64-setup.exe" "https://YOUR-ACCOUNT-SERVER" "../server/releases"
```

This writes a standard Tauri `update.json`, its detached `update.json.sig`, the installer and installer signature. The server exposes the manifest, detached signature, and the allowlisted installer download. Upload these release files to the same hosted account server. A public server must use HTTPS; the native code accepts HTTP only for loopback development.

The launcher verifies the manifest signature with its pinned key, rejects a changed manifest, then verifies the downloaded installer's Tauri signature, signed version, byte count, and SHA-256 checksum before installation. The update button displays the version and download size and reports download progress. If a game is open, it pauses and finishes its queued cloud save; installation waits for its one-use acknowledgement and cancels if the save fails or times out. On Windows the Tauri updater runs the installer and restarts the launcher; if the game was open, the launcher reopens it against the same saved server origin. Server accounts, worlds and progress are outside the installer and remain intact.

The development config enables Tauri's insecure transport switch solely to support loopback tests. The native URL validator still forbids public HTTP servers. For a production-only build set `plugins.updater.dangerousInsecureTransportProtocol` to `false` and use a hosted HTTPS origin.

Once the signed **1.9.3** release is published to the configured server, an older installed launcher can fetch it with **Update**. The desktop app manages its required local service automatically. A launcher already on that published version reports that it is current. No public game/update host is preconfigured or deployed; a hosted release uses the owner's actual HTTPS server.

## Verification

Run `npm run check` for configuration and UI checks, and `cargo test --manifest-path src-tauri/Cargo.toml` for native URL/signature tests. From the release root, `npm run test:release` checks exact staged resources and isolated Windows service handoff/preflight behavior. Historical `verification-1.5.2.json` and `verification.json` retain earlier release evidence; they do not prove STARTUP REPAIR acceptance. Current checks must include the actual previous-build install, active game code, restart and account/world preservation. Database and account tests are part of the game server's tests in the release root.

With `TAURI_SIGNING_PRIVATE_KEY_PATH` set, run `node scripts/verify-release.cjs` to exercise the compiled updater against an isolated release copy. It checks signatures, installer tampering, checksum and version mismatches, transport restrictions and unchanged fixture progress. It does not tamper with published release files or install a launcher. When no server is using port 8803, `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/fullscreen-check.ps1` opens a temporary native window to verify fullscreen commands and monitor coverage, then closes its own fixture and application. It does not create game accounts or change launcher connection settings.

Official references: [Tauri updater](https://v2.tauri.app/plugin/updater/) and [Windows prerequisites](https://v2.tauri.app/start/prerequisites/).
