# Tactical Adaptation 1.9.1 — validation

Built and signed through the existing Windows pipeline; the existing local update feed serves the matching manifest, signature and 27 MiB installer. This publishes the update; it does not replace an open installed game.

- Balance 8.0 / b-b9bdf00b and all weapon constants remain exact.
- 247 of 252 runtime assets remain unchanged. Navigation, obstacle steering, player movement, firing, projectiles, dash, regen, equipped-time recording and save normalization remain byte-identical.
- 13 targeted regression suites, mechanics and damage-number checks pass. The 100-match simulation passed career/event/telemetry reconciliation, all-weapon sampling, permanent profiles, seasons and bounded movement checks. That run includes the null-alternate repair; subsequent transient goal/debug cleanup is covered by the final targeted and native checks.
- Controlled low/mid/high scenarios use the same two weapons with sides swapped across twelve one-minute matches; win rates are not the acceptance criterion.
- Final interleaved CPU medians: baseline 1030.8 ms, current 1154.9 ms per 900 ticks (12.0% / 0.138 ms additional CPU per tick). Below the 20% regression guard.
- Native 2.5D: 100.7 FPS, p95 16.7 ms; 115.3 FPS, p95 8.6 ms in short TDM/FFA observations. These are measured samples, not minimum-FPS guarantees. Four matches, chases/support, nine-bot Pro FFA, owner debug, persistence and an empty runtime-error log were verified.
- Actual service-worker upgrade preserved local data and activated sar-shell-1.9.1-tactical-adaptation-1.
- Migration preserves aggregate Balance 8 data, earlier AI samples, archives, careers, profiles, familiarity and seasons.

## Changed source files

**runtime**: `game.js`, `tactical-instinct.js`.

**tests**: `dev/simulate.cjs`, `dev/tactical-adaptation-check.cjs`, `dev/tactical-lineup-check.cjs`, `dev/p90-range-check.cjs`.

**release**: `version.json`, `build-meta.js`, `index.html`, `package.json`, `package-lock.json`, `launcher/package.json`, `launcher/package-lock.json`, `launcher/src-tauri/tauri.conf.json`, `launcher/src-tauri/Cargo.toml`, `launcher/src-tauri/Cargo.lock`, `launcher/ui/index.html`.

**docs**: `README.md`, `launcher/README.md`, `docs/LIVE-CIRCUIT.md`, `docs/TACTICAL-ADAPTATION.md`, `docs/TACTICAL-ADAPTATION-VALIDATION.md`.

Generated test reports, the staged backend, dist files and signed release artifacts were refreshed. Detailed evidence and native screenshots are in `C:/Users/Noah/OneDrive/Documents/ChatGPT/freeshui/skirmish-tactical-adaptation`. The installed game was left running with its account/world untouched; Update Game is required to load 1.9.1.
