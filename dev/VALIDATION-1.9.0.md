# 1.9.0 — CORE TUNING verification

Date: October 2, 2026. The working 1.8.0 build was preserved as the baseline.

## Changed files

Runtime shell: `game.js`, `index.html`, `version.json`, generated `build-meta.js`. A SHA-256 comparison against the installed 1.8 shell confirms that the other 248 of 252 shell files are byte-identical, including Phone, tactical AI, tournament modules, styles, models and audio.

Release identity: root and launcher `package.json`/`package-lock.json`, `launcher/src-tauri/tauri.conf.json`, `Cargo.toml`, `Cargo.lock`, `launcher/ui/index.html`; generated backend bundle, executable, signed installer and update manifest. Documentation: `README.md`, `launcher/README.md`, `docs/LIVE-CIRCUIT.md`, `docs/CORE-TUNING.md` and this report.

Checks: new `dev/core-gameplay-check.cjs`, `dev/fixtures/balance-8.0.json`; updated `dev/simulate.cjs`, `mechanics.cjs`, `district-check.cjs`, `balance-update-check.cjs`, `update-five-check.cjs`, `player-match.cjs`, `tactical-instinct-check.cjs`, `live-circuit-profile-check.cjs`, `audio-check.cjs`, `spread-distance-check.cjs`, and their generated result files. Existing checks were adjusted only for intentional balance/rule/cooldown changes or for writing statistical fixtures to the current AI sample.

## Verified source behavior

- Standard and inherited custom TDM: 60 kills, five minutes, existing sudden-death overtime. Actual 59th and 60th lethal hits exercise the score boundary and exactly-once completion. Tournament rules remain at their existing 50 kills.
- Deathmatch: ten participants, 30 kills, four minutes. Shared HUD/scoreboard use kills, placement and leader kills; switching back restores TDM labels.
- Saved official slot deadlines are exactly 15,000ms. At 14,999ms no replacement occurs. At the deadline exactly one replacement initializes; stale callbacks and repeated reconnects cannot create another. Reserved rosters remain unique across all 50 bots. Queued human allocation consumes one slot. Other slots continue. Custom/practice is exempt.
- All 14 weapons match an independent numeric transcription of the request. Balance 8 fingerprint: `b-b9bdf00b`. Ranges derive from preferred range / 70; STK/TTK and AUG 0/65/130ms cadence are checked. Real physical head/body/miss, four-state spread, cursor invariance, pellet counts and damage-number clamping pass.
- Actual 1.8 simulated save migration archives the entire prior Balance 7 dataset and AI samples once. Profiles, careers, familiarity, mode records and seasons survive; reopening does not repeat the archive.
- Movement root cause reproduced: a nearby destination update retained the previous route endpoint, producing 18 direction reversals. Corrected run has zero. Forward-preserving avoidance also fixes ally repulsion opposing the intended path.
- Navigation passes 72 building exits, off-grid fence/crate starts, world corners, close three-prop doglegs, forced failed-path recovery and crowded-ally steering, with no collision bypass. Rendered 2.5D endpoint, doorway and fence/crate scenarios have recorded traces, screenshots and video with zero collisions.
- Seeded 100-match actual simulation passes score, kills/deaths and resolved damage reconciliation, 50-bot/weapon rotation, finite values, patch/season boundaries and bounded stuck recovery. The run observed approximately 7,401 simulation seconds.
- Existing mechanics, meta, P90 range intent, actual human TDM, weapon migration/derived stats, model, environment, asset, audio, pointer capture, damage-number and spread checks pass. Tactical regression checks cover 32 custom configurations, FFA completion, tied overtime and unchanged tactical decisions. Profile win/loss/zero-kill and tournament isolation checks pass. Tournament scheduling, bracket, payout and replay checks pass.
- Signed Windows build succeeds. All 252 staged shell assets match source; NSIS executable differs from the portable executable only in Tauri's expected bundle marker. Desktop preflight/owned-backend handoff checks and a real Chromium 1.8-worker → 1.9 cache upgrade pass without clearing local data.

## Desktop acceptance

The native 1.9 launcher starts its own healthy isolated backend and opens the exact `sar-shell-1.9.0-core-tuning-1` cache. The real 2.5D game passes custom selection, movement, ADS, firing, reload, pause and resume. The final natural Deathmatch runs 240,004.1ms to its resolved four-minute result, records the isolated profile once and supports Play Again. It then starts TDM with the visible 60-kill target and team labels restored. Spectator Escape correctly returns to the lobby; the explicit completed-world checkpoint is verified against the actual isolated account database. Final native result: PASS, zero page errors, owned test backend safely stopped.

During the final native observation, an official bot slot completes, retains a deadline exactly 15,000ms after completion, and begins a new match only after that deadline (first polling observation 628.7ms afterward). The independently tested exact boundary rejects replacement at 14,999ms and permits it at 15,000ms. An observed three-second frame sample with four background games averages 119 FPS, p95 8.5ms; this is a local observation, not a universal performance guarantee. Test windows and their isolated owned backend are closed afterward.

Installed-owner replacement/verification remains pending while the user's existing 1.8 game window is open. The signed 1.9 installer and release feed are built, published to the existing local update endpoint, and verified by downloading the offered installer and checking its exact size and SHA-256. `Update Game` can offer 1.9. The running backend still identifies as 1.8.0. Runtime files and owner data have not been replaced or cleared; the project workflow requires the open game's save checkpoint to finish first.

Evidence directory: `C:/Users/Noah/OneDrive/Documents/ChatGPT/freeshui/skirmish-core-1.9`.
