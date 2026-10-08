# ARENA REFINED audit handoff

**Current status — 2026-10-08: Audits 1–10 are complete and released together.** Final build, signed updates, physical installation, original-data preservation, actual installed gameplay, existing-account migration/lobby/reopen, public downloads and native update-feed checks all pass. No user rule decision or release blocker remains.

Release: **1.13.0 — ARENA REFINED**, **Weapon Balance 9.0**, schema **10**, analytics schema **1**, cache revision **arena-refined-2**, existing **live** channel. Application identity, signing key, save keys and installation paths stay unchanged. Do not restart completed feature work.

Public release: [v1.13.0 — ARENA REFINED](https://github.com/nhicksenterprises2025-maker/skirmish-arena-official-game/releases/tag/v1.13.0). Code/source commit: `54f4f7b0cffd925590bb29ce3007e7595086a360`. The documentation completion commit does not change the tested executable or game bundle.

## Completed implementation and routes

| Audit | Implemented behavior | Relevant paths |
| --- | --- | --- |
| 1 | Retire Messages, dialogue providers, queues, settings and exclusive dependencies; keep Phone and all four remaining apps. Recoverable retirement precedes message-only deletion. | `phone-ui.js`, `phone-apps.js`, `cloud.js`, `game.js`, `audio.js`, `server/retirement-archive.cjs`, migration 009, native backend |
| 2 | Distinct three-second-minimum mode preparation with real readiness, cancellation, clean Retry and safe entry; two TDM plus two Deathmatch slots, fair rotation and 15-second cooldowns. | `mode-entry.js`, `boot.css`, `game.js`, Phone match displays |
| 3 | Keep and seat all three AK magazine ribs; subtle preview breathing and 24-second weapon rotation; exact-number performance colors, neutral combat panels and 26 genuine dimensional ranked emblems. | `models-25d.mjs`, `inspect-25d.mjs`, `game.js`, HUD styles, `assets/25d/ranks/`, Blender sources/exports |
| 4 | Apply the supplied Balance 9.0 table: 15 weapons, 17 changed existing fields across eight weapons plus fully integrated FAL. Archive prior patch once; retain lifetime records. | `game.js`, `tools/apply_arena_refined_balance9.cjs`, FAL models/audio/manifests and acceptance fixtures |
| 5 | Confirm square 2 m² metadata and one tested meter conversion; public ranges/speed/falloff use correct units while world-space simulation remains unchanged. New samples have unit provenance; unknown history stays unknown. | `distance-units.js`, `game.js`, `server/world.cjs`, `dev/fixtures/balance-9.0-world-baseline.json` |
| 6 | Play all 3/3/5 games, advance by aggregate kills then damage, persist unique game/series totals and finalize idempotently. Preserve old rulesets and isolated tournament rewards/statistics. | `server/tournaments.cjs`, `server/tournament-runtime.cjs`, `server/progression.cjs` |
| 7 | Persist anchored Eastern recurring schedule, check-in/lock/countdown/game times, real bot reservations, permanent no-show replacements and reconnect checkpoints. Missed offline events cancel without fabricated results. | `server/tournament-schedule.cjs`, `server/tournament-lifecycle.cjs`, runtime, `cloud.js`, tournament branches in `game.js` |
| 8 | Skirmish Challenge Tournament branding, connected bracket, sortable tournament-only leaderboards, actual upcoming events and persisted official history. Keep custom names and historical snapshots. | `tournaments-ui.js`, `skyline-tournaments.css`, `server/tournament-presentation.cjs`, API routes |
| 9 | Clickable 3D rank inspection and current ladder; Ranked/Combined profile tabs use unique eligible participation and raw totals, refresh once, respect season/lifetime scope and missing history. | `profile-stats.js`, `progression.js`, profile/rank presentation in `game.js`, profile tests |
| 10 | Current guide, categorized application notes, separate numeric Balance 9.0 notes, coherent version/cache/package metadata, final integration/installed verification and one published release with verified downloads/update feeds. | `README.md`, `docs/PLAYER-GUIDE.md`, maintenance docs, `version.json`, `build-meta.js`, launcher packaging/update scripts |

The full background allocation is 40 distinct active bots and ten waiting from the same persistent pool of 50. Official reservations take priority; configured background slots wait when participants are unavailable. TDM remains 5v5/60 kills/five minutes; Deathmatch remains ten FFA participants/30 kills/four minutes. No bot is cloned or officially double-booked.

## Confirmed user decisions

The user explicitly approved this complete rule set on 2026-10-07:

- **FAL PreferredWorld: 1100**, displayed as **48.61 m**. FAL is semi-automatic, one round per activation at a 0.26-second interval.
- Preserve the **4320×2880** world, layout, collision, navigation and spawns. Hidden metadata is **135×90 square cells**, each **32×32 world units** and **2 m²**. No visible grid.
- Official recurrence is every **three calendar days at 19:30 America/New_York**, following daylight saving and the persisted event anchor.
- Each game has **90 seconds check-in inside 120 seconds preparation**; the existing three-second countdown ends at combat start. Fixed clocks do not shift for a local loading screen.
- Quarterfinal preparation starts: **19:30/19:38/19:46**, latest finish **19:53**. Semifinal: **19:55/20:03/20:11**, latest finish **20:18**. Final: **20:20/20:28/20:36/20:44/20:52**, latest finish **20:59**.
- Play all **3/3/5** games. Aggregate kills determine advancement; total team damage breaks a kill tie. An exact damage tie holds for an explicit ruling. Preserve the **50-kill/five-minute** per-game tournament rules.
- Absent humans are replaced for the remainder of the tournament by eligible persistent bots. The replacement receives that slot's payout. Checked-in slow clients are not no-shows; a returning player cannot reclaim a running slot or receive duplicate payout.
- Events missed while Windows/the local authority is off are cancelled without invented results or rewards. Custom dates remain independent.

**Conversion specification:** map `brightfield-blocks`, calibration `brightfield-square-2m2-v1`; one world unit is `sqrt(2)/32` meters. Legacy weapon tuning still uses **70 world units per legacy tile**, independent of map cells. Convert preferred world distances by multiplying by the meter scale; legacy falloff/speed by 70 times that scale; legacy falloff percent per tile by dividing by 70 times that scale. Retain raw totals and provenance; never convert twice or rewrite unknown historical units. The captured post-Balance-9/pre-conversion baseline proves physical damage/travel preservation.

**Statistics/rewards:** Combined includes unique casual TDM, casual Deathmatch and Ranked TDM records. Ranked TDM is one participation. Official tournaments, custom matches and practice remain excluded from Combined/normal combat careers/meta. Ratios derive from raw totals. Official tournament XP retains its existing 1.3 multiplier; fictional payouts remain per participant `[50000,35000,20000,12500,7500,5000,2500,1000]`. Custom/practice exclusions and rating formulas are unchanged.

## Migration and startup safety

- Schema 9 makes a consistent, integrity-verified pre-migration SQLite snapshot and verified JSONL export before retiring message-only tables. Browser drafts archive durably before conditional deletion. Failed archive/write/drop retains originals; shared account/world data is never cleared.
- Recovery artifacts remain beside the private DB: `<db>.pre-schema<old>-<timestamp>-<uuid>.sqlite` and `<db>.pre-messages-retirement9-<timestamp>-<uuid>.jsonl`. Browser archive key is `sar-dialogue-retirement-backup-v1` in existing `sar-world-cache-v1/entries`.
- Schema 10 adds tournament cancellation while retaining accounts/worlds, 23-game ledgers, earnings, checkpoints and foreign-key integrity. Reopening is idempotent. Balance 9.0 fingerprint **b-59670f2d** archives the previous patch once without resetting careers, familiarity, seasons, XP or settings.
- Retained gameplay bot personalities/relationships/competition traits are independent of retired conversation services. Shared accounts/payments/persistence backend remains; system Ollama and external downloaded models are untouched.
- A genuine owner-scale startup defect was found before publication: fixed 15-second health waiting killed a backend still creating/verifying a large migration backup. The existing owner's schema-8 DB has **13,798,117,376 used bytes**; a **13,802,016,768-byte** recoverable backup passed integrity and streamed logical equality before installation.
- The corrected private startup contract binds random attempt, exact PID/process creation/executable/entry, database, origin and release. Snapshot/verification/archive progress uses real CPU/I/O/file growth/stage transitions. Inactivity is bounded at **60 seconds**; those stages at **15 minutes**, migration application at **two minutes**, total attempt at **70 minutes**. Ordinary startup remains **15 seconds**. Competing/reopened launchers reuse the exact active attempt; timestamps alone cannot fake progress or reset bounds.
- **Essential loading contract:** real preparation begins immediately; the application startup screen and separate mode-entry screen each require their minimum three seconds **and** genuine essential readiness. Three seconds is not a deadline. Longer work shows its actual stage, and bounded failures identify that stage with safe Retry. Optional audio/previews and cloud sync with valid authenticated cached access cannot block the entire game. Login and save loading are never fabricated; first-time authentication still requires the account service. Retry invalidates the old attempt without duplicate loops, results or rewards.
- `server/startup-status.cjs`, `server/db.cjs`, `server/retirement-archive.cjs`, `server/desktop-service.cjs`, `launcher/src-tauri/src/{backend,startup_progress}.rs` and the existing launcher UI show actual stages. Login remains blocked until real health/schema compatibility. Asset activation retires application caches only, never user databases/storage.
- Unvirtualized Windows inspection identified the existing physical installation as **1.12.1**; earlier Codex direct reads resolved to an older virtualized 1.8.0 copy. Keep the pinned existing account DB/profile paths and stable application identity. Never select a blank default world to make startup appear successful.

## Current test evidence

Main evidence: `C:/Users/Noah/OneDrive/Documents/ChatGPT/freeshui/arena-refined-release/`. Scheduled browser evidence: `arena-refined-audit-10/scheduled-browser/` beside it.

| Verification | Actual result |
| --- | --- |
| Final server suite after startup instrumentation | **129/129 PASS**, `server-final2.log` |
| Client/account/offline/cache/retired drafts | **61 PASS** |
| Mode entry/rotation/presentation; real Edge Phone | **37 PASS; 7 PASS** |
| Balance 9.0; range integration; pure conversion | **11 PASS; 6 PASS; 14 PASS** |
| FAL firing/reload audio | **2 PASS** |
| Scheduled real Edge/HTTP/SQLite/IndexedDB; scheduled client; XP acknowledgment | **5 PASS; 7 PASS; 5 PASS** |
| Profile engine; safe exit | **6 PASS; 8 PASS** |
| Current 15-weapon visual suite | **25 PASS**, 120 bars, 365 AK poses, 26 ranks/832 rotations, six HUD paths; `final-visual-suite.log`, `final-visual-current/` |
| FAL/operator models | Prior **5,256 poses PASS** across eight operators/all 15 assets; no model source changed afterward |
| Private startup stages; retirement/cancellation preservation | **4 PASS; 9 PASS** |
| Native source tests | **17/17 PASS**, including real Windows CPU/I/O and exact Node/CIM identity; `startup-progress-cargo.log` |
| Existing updater/service lifecycle | **11/11 PASS** |
| Actual final installed native gameplay | **16/16 groups PASS**, `native/installed-native-release-results.json`; exact physical executable and served hashes, real FAL/TDM/DM/offline play, Phone/rank/HUD and 2 TDM + 2 DM. Startup 3022/3020/3013 ms; mode entry 3067/3032/3070 ms. |
| Revised arena-refined-2 build/staging and signed native download | **PASS; 7/7 signed checks PASS** |
| Physical binary installation | **1.12.1→1.13.0 PASS**; five shortcuts and launcher settings preserved. Installed hash `32cfbd6e8a39f1095d50c1c72e74cb46b34e414a79b7d68d884df89e120f596f`; verified three-byte NSIS difference from portable. Full original 13.8 GB DB/profile/config comparison passes before migration. Actual owner schema 8→10 migration completes in about 296 seconds, followed by five lobby/reopen preservation checks. |
| Original persistent-account gameplay | **5/5 PASS**, `native/installed-owner-lobby-results.json`; original profile and actual account enter the lobby, preserve progress and reopen successfully. |
| Final installed launcher and live feed | **3/3 PASS**, `native/installed-launcher-feed-check.json`; physical launcher/game are 1.13.0, native signed check reports current, actual Check for Updates finishes without errors, and port-8803 manifest/signature/download match the final candidate. |
| Public release/source and download verification | **PASS**; v1.13.0 published and source pushed. All three public assets match their exact candidate SHA-256. Both existing project/installed update feeds have the same four verified release files. |
| Source security review | **737 files, zero findings**; private owner reports are not release assets |

Physical map geometry hash remains `d309d94568cfd7fde10635939bd903095e046ca20a2d8887b77869c785c56032`; fixed-world damage/travel and all 60 spread states match the actual post-balance baseline. Populated migration fixtures preserve 40 positive payouts and all 23 historical games.

The earlier intermittent API 400 has a deterministic regression: custom auto-allocation consumed an invited bot before the human team was complete. Unfinished human rosters now remain editable. Fractional legacy epoch anchors preserve their identity; new timestamps remain integer. No assertion was bypassed.

## Final installed verification and delivery

- Final **arena-refined-2** candidate build/staging, 7 signed-update checks, physical 1.12.1→1.13.0 update, full original DB/profile/config preservation, **16 installed-native groups** and **5 actual-owner lobby/reopen groups** pass. Installer SHA-256 **43b6ee82b0405aa0c37df6d2afb9840d41396fe7e0553755ea1a1b18ba759e0a**.
- The large schema-8 database reaches genuine schema-10 health after a progressing, verified migration lasting **295.7 seconds**, with **138 observed activity samples** and a verified approximately **13.795 GB** snapshot. Private evidence: `native/installed-owner-migration-completed-account-gate.json`; its preliminary temporary-profile account gate was subsequently resolved and verified by the final owner test. XP, level, ranked record, human careers, preferences, all 50 identities and season history survive; no owner human match or XP award was created. Balance archives once and reopening restores the same account.
- Two outside test-harness defects were corrected: equivalent Windows long-path prefixes were normalized, and EdgeDriver was explicitly bound to the preserved account profile instead of its default temporary profile. Actual process data-directory verification confirms the original profile. No authentication was fabricated or user storage cleared. Failed preliminary evidence remains private.
- The exact signed installer and tested source are published as **one application release**, [v1.13.0](https://github.com/nhicksenterprises2025-maker/skirmish-arena-official-game/releases/tag/v1.13.0), on 2026-10-08. Public setup, detached signature and `SHA256SUMS.txt` were downloaded and hash-verified against the candidate. Installer SHA-256 is `43b6ee82b0405aa0c37df6d2afb9840d41396fe7e0553755ea1a1b18ba759e0a` (30,018,057 bytes).
- Project and real installed backend update feeds contain the same verified installer, installer signature, manifest and manifest signature for **1.13.0**. The actual installed launcher checks the port-8803 signed feed and reports **Launcher is current**; launcher and backend close cleanly. No remaining delivery gate.
- **Unverified:** physical Windows reboot and physical Alt+Tab. Native close/reopen, cold local-service preparation and authenticated offline entry are verified. Historical measurements without known provenance remain unavailable.

## Historical evidence

Earlier per-audit reports record the state at their execution time. Pre-approval FAL/calibration/timetable/tie questions, Balance 8.0 and incomplete Audio checks are **superseded**, not current blockers. Full pre-cleanup handoff is preserved privately at `arena-refined-release/handoff-before-final-cleanup.md`.

- Audit 1: `arena-refined-audit1/combat-preservation.json`, `arena-refined-audit-1/{phone,native}/`; recoverable retirement and actual native offline/reopen evidence.
- Audit 2: `arena-refined-audit-2/`; controller/rotation/real-browser/native preparation, cooldown, fairness, pool and save checks.
- Audit 3: `arena-refined-audit-3/`; Blender/shared AK inspection, 26 rank assets, preview/HUD screenshots and native hashes.
- Audit 4: `arena-refined-audit-4/`; pre-balance source/constants, staged FAL assets/audio, exact preservation and model turntables.
- Audit 5: `arena-refined-audit-5/`; original calibration conflict and independent conversion contract. Current approved calibration and live integration are recorded above.
- Audits 6–7: `arena-refined-audit-6/` and `arena-refined-audit-7/`; aggregate fixture (128–136), complete final, idempotence, checkpoints, countdown and controllable schedule tests.
- Audits 8–9: `arena-refined-audit-8/` and `arena-refined-audit-9/`; actual presentation/history/upcoming and unique profile participation/raw-ratio evidence.
- Early Audit 10: `arena-refined-audit-10/`; regression summaries, first API failure, pre-activation guides/audio and release workflow review. Current fixes/results above supersede those provisional statuses.
