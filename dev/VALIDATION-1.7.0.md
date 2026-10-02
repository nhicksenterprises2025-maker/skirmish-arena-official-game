# 1.7.0 — FIELDCRAFT validation

Verified October 1, 2026 in the existing project. This is a presentation release; the active weapon balance remains **7.0**, fingerprint **`b-2bec20b9`**. Final shell identity is `sar-shell-1.7.0-fieldcraft-2`.

## Changed-file groups

| Area | Files / output groups |
| --- | --- |
| Game interface and HUD | `index.html`, `styles.css`, `game.js`, `tournaments-ui.js`, `renderer-25d.mjs` |
| Phone and dialogue | `ai-ui.js`, `ai-ui.css`, `server/local-ai.cjs`, `server/social-personalities.cjs` |
| Models and environment | `models-25d.mjs`, `inspect-25d.mjs`, `environment-25d.mjs`; `tools/blender_assets.py`, `tools/blender_live_circuit.py`; the two editable Blender sources, two runtime GLBs, manifest, reports and preview outputs in `assets/25d/` |
| Audio | `audio.js`, `dev/prepare-fieldcraft-audio.py`, `assets/audio/LICENSES.json` and generated firing/handling/UI/feedback variants; original licensed recordings retained |
| Branding, release and startup | `cloud.js`, `version.json`, `build-meta.js`, `manifest.webmanifest`, `desktop-entry.html`, `desktop-launch.html`, `desktop-launch.js`, `server/index.cjs`, package manifests/locks, `dev/release-meta.cjs`; launcher UI, Cargo/package/Tauri metadata, native entry point, backend staging, installer hooks/language overrides and release outputs |
| Maintenance and validation | `README.md`, `launcher/README.md`, `docs/LIVE-CIRCUIT.md`, `docs/BLENDER_PIPELINE.md`; targeted UI, balance, migration, model/environment, audio, updater and dialogue checks plus their generated results |

The art pass covers all **14 weapons**, all **8 operator appearances**, the Phone shell and existing neighborhood props. This grouping intentionally omits individual WAV filenames and build-cache files.

## Preservation evidence

- `simulation-preservation.json` records byte-identical SHA-256 comparisons for eleven functions: `moveWithCollision`, `buildNavigation`, `startReload`, `finishReload`, `fire`, `applyDamage`, `updateProjectiles`, `decideBot`, `effectiveSpreadDeg`, `updateCrosshairVisual` and `updatePlayer`.
- Balance Seven checks independently compare the active constants with the frozen Balance 7 fixture and retain `b-2bec20b9`. They verify real burst timing, physical damage/hits, authoritative spread, cursor-independent reticles and preservation through save normalization/restart. No new balance rollover is introduced by 1.7.0.
- Existing tests still exercise 1.3-world migration and archive retention. Stale tests that compared current weapons with pre-Balance-7 ammunition values now use the frozen Balance 7 fixture; migration tests still intentionally change two constants and require a genuine telemetry rollover.
- Tournament payout, bracket, persistence and standard-career isolation checks pass. Durable cache, offline account ownership, unsynced progress and restart checks pass with isolated fixtures.

## Automated checks observed passing

- `npm run test:game`: mechanics, arena/navigation, analytics, player match, P90 range simulation, loadout/balance, 2.5D models/environment, Blender validation, audio, pointer capture, resolved damage numbers and spread checks.
- `npm run test:live-circuit`: tournament core, completed profile accounting, audio identity and exported assets.
- `npm run test:client`: cloud/offline/cache checks and Phone UI regressions. `node dev/tournaments-ui-check.cjs` additionally passes loading/empty states, form preservation during pending refresh, month navigation/focus and bracket markup.
- `npm run test:server`: **38 passed, 0 failed** after the map-dialogue guard change.
- `node dev/balance-seven-check.cjs`: all balance and persistence groups passed against the current release metadata and the fixed Balance 7 fingerprint.
- Updated `dev/social-ui-check.cjs`: native-discovered Messaging focus regression reproduced through detached-node simulation and fixed; direct activation, delayed status/preferences refresh and checkbox focus now pass alongside existing draft/history/account checks.
- Native launcher unit tests: **10 passed**. Preflight lifecycle checks pass the cold-start activation race, delayed matching worker activation, exact shell selection and preservation of unrelated/account caches.
- Signed-download validation rejected tampered manifests/installers, wrong checksum/version and inappropriate transport while preserving database progress. Final release artifact hashes are recorded separately after the last rebuild.

## Visual and native verification

The completed isolated native run in `native-fieldcraft-results.json` contains **14 passing groups**:

- Managed backend startup; current version, Balance 7, fifty profiles and four live matches.
- Home and Weapon Meta layouts at 1440, 1280 and 900 pixel widths; rotatable inspection for fourteen weapons and eight operators.
- Phone Home/Inbox/Contacts, all fifty contacts, thread navigation, preserved unsent drafts and no generation from navigation.
- Meta row focus through refresh; Settings tab navigation and Messaging focus through delayed status refresh; owner-only debug and expanded current release notes.
- Accessible leaderboard, profile and tournament calendar; direct switching across all four matches and both 2.5D observer modes.
- Human 5v5 HUD, native pointer capture, pause/settings release and recapture on resume.

Screenshots are retained for Home, equipment, operators, Meta, leaderboard, profile, Phone states, Calendar, settings/notes, observer cameras and the human HUD. Asset preview comparison passed without browser errors. In that fixed preview, static meshes changed from 977 to 697 and draw calls from 955 to 916; triangles increased from 132,732 to 216,984. These are fixture measurements, not a claim about every gameplay view.

Native frame samples on this PC at **1440 × 900**, pixel ratio 1:

| Mode | Sampling interval | Observed cadence | Median frame | 95th percentile |
| --- | --- | --- | --- | --- |
| 2.5D Follow | 3.000 seconds | 104.0 frames/s | 8.3 ms | 16.7 ms |
| Tactical | 3.000 seconds | 29.7 frames/s | 33.3 ms | 41.8 ms |

These are the final FIELDCRAFT-2 samples and use no artificial pass threshold. Earlier runs of the same art measured 74–81 frames/s in Tactical and 109–112 in Follow. The final Tactical sample rendered fewer calls/triangles than the earlier faster sample, so runtime performance was variable; no cause is asserted from these short observations. They are not sustained-performance or cross-hardware guarantees, and Tactical performance remains a documented limitation.

## Audio and conversation evidence

- Four distinct firing recordings per weapon, three variations per reload phase, fourteen distinct firearm sources, PCM identity/peak/duration/provenance checks, bounded mixing, no immediate shuffle repeats, authentic event timing, pellet feedback coalescing and saved-volume behavior passed.
- Three real isolated local-model conversations completed for Ace, Vex and Sage: factual current weapon values, different competitor voices and an explicit unknown tournament result. A rejected earlier response was not published.
- A further real map reply explicitly confirmed that roofs add no playable height/vertical firing angles, crosswalk paint provides no cover, and visual polish changes no collision/cover/line-of-sight rules. Targeted regressions reject the observed unsupported claims while allowing existing physical-wall cover and truthful denials.
- Those isolated runs preserved the world byte-for-byte and retained all fifty permanent social identities. Dialogue remains variable; targeted guards and these samples do not prove every possible natural-language statement correct.

## Final installed release

- Final signed NSIS package installed successfully in the actual Windows installation, outside the development application's filesystem virtualization. Both installed copies match the exact NSIS executable and all **251** source shell assets. The installed NSS bundle marker differs from the portable UNK marker by three documented bytes; this is expected and independently verified against the extracted installer payload.
- Native first launch and repeat launch passed against the existing authenticated owner account and canonical database. The backend starts automatically and is reused on the next launch (same service PID), with no login prompt, Retry Connection or SERVER OFFLINE blocker. The active cache is exactly `sar-shell-1.7.0-fieldcraft-2`.
- The original pre-install world was compared with the final checkpoint: all fifty permanent profiles, player career/seasons, settings and patch archives/history are preserved; bot lifetime counters and familiarity never decrease. The active patch remains **`b-2bec20b9-5`**, with no extra archive or reset. Revisions advanced from 14544 to 14548 through normal checkpoints.
- Actual Windows Desktop and Start Menu shortcuts now point to this build as **Skirmish Arena**. Conflicting older Electron launcher shortcuts were retained as **Skirmish Arena (Legacy Launcher)**. The current Installed Apps entry is **Skirmish Arena 1.7.0**; internal legacy installation/account paths remain intact.
- Eight lifecycle checks cover exact cache selection, the activation-response race, cached legacy inline bootstrap routing and upgrades from Balance 7 / FIELDCRAFT-1. The new native entry is deliberately outside immutable shell caches and its HTML/script are served without HTTP caching. Independent real Chromium and Tauri/WebView2 warm-upgrade probes both sent one `SKIP_WAITING` and successfully activated FIELDCRAFT-2 without clearing account data.

Installed evidence: `actual-install-result.json`, `installed-resource-proof.json`, `installed-branding-proof.json`, `installed-actual-first.json`, `installed-actual-restart.json`, `installed-preservation-proof.json`, `installer-payload-verification.json` and `sw-webview-upgrade-probe.json`.

## Observed upgrade caveat

One transition in the existing owner profile timed out while a matching worker was waiting during successive development installations. The cached legacy HTML issue was reproduced and corrected with the uncached native entry; the later owner-only wait was not reproduced with unchanged final code in either Chromium or actual Tauri/WebView2. Subsequent installed launches and restart passed. No unsupported worker-identity workaround or profile/cache reset was applied. This isolated observation is retained here rather than claimed as a fully attributed fix.

## Limits and evidence location

No subjective listening evaluation or Windows reboot was performed during this validation. PCM/mixer/event checks establish technical audio behavior, not a subjective sound-quality verdict. Native performance measurements cover three seconds per camera on this PC.

Evidence is in `C:/Users/Noah/OneDrive/Documents/ChatGPT/freeshui/skirmish-ui-polish/`: `*-regression.log`, `simulation-preservation.json`, `art-visual-results.json`, `model-budget.json`, `native-fieldcraft-results.json`, `phone-live-dialogue-results.json`, `phone-map-live-results.json`, launcher/preflight logs and screenshots. Test databases/WebView profiles are isolated and are not release payloads.
