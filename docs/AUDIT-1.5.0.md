# Audit and release evidence — 1.5.0

The existing 1.4.0 game was copied into the separate 1.5.0 release folder. The preceding folder and the user's original preview at port 8801 were retained. No combat system was replaced. All eleven complete weapon balance snapshots were compared directly with 1.4.0 and matched exactly.

## Corrections and integration

- Meta now evaluates nine primaries and two sidearms independently. The existing component weights remain; category baselines and usage remove direct primary-versus-sidearm comparisons. Confidence remains separate from Gun Score.
- Engagement range and lethal-projectile range have distinct real counters. The damage ledger uses actual HP removed, applies exact inclusive solo/finisher boundaries, and clears on respawn. Migrated historical data is retained without fabricated contributions or engagement observations.
- P90 close repositioning had approached the enemy, while generic chase/push goals and attacking dashes could pull it inside its ranged-SMG role. Away/lateral reposition goals, 7–12 tile approach stand-off and dash-landing guards correct those choices. Emergency close shots remain possible. Weapon values did not change.
- The Meta table contains all requested sortable columns. Its horizontal overflow stays inside the table, with sticky headers and rank/weapon columns. Sidearm help, visible contribution metrics, detail models and Top 3 users remain in the current dashboard style.
- Classic continues to show procedural operators and weapon models during combat. The additional WebGL view renders raised geometry and dimensional models from the same simulation snapshot. Ground raycasting preserves aim coordinates, and discarded model geometries/materials are disposed. Tactical overview and the real minimap/full map remain available.
- The player-only countdown freezes its ten participants, trigger input and match clock until FIGHT. Other games continue. End results capture all ten actual participants before bot recycling and use their actual combat data for MVP and statistics.
- Real server accounts, additive player career/season data, stable bot IDs, permanent normalized SQLite records, migration backups, profiles and persistent messages were integrated without reconstructing unknown old player statistics.
- Cloud checkpoints now await in-flight writes and newer queued progress. PWA activation, desktop installation, logout and import wait for acknowledged progress. A newest-queued conflict branch is retained rather than replaced by an older request.
- Pending progress survives client restarts. Transient recovery failures retain it and gate play. Confirmed conflicts fetch the latest cloud revision and expose the preserved branch through a recovery notice/export. Rejected saves retain their backup. Notice exports select the corresponding branch.
- Cloud calls time out after twenty seconds. Expired sessions pause the simulation and show re-authentication while preserving pending progress. Hydration/import/logout prevent the old game's unload handler from writing over a replacement world.
- Server validation reconciles careers, per-weapon and per-actor telemetry, Power-band samples, season deltas and completed 5v5 records. Explicit manual sample archive/restart remains supported while archive history stays immutable. Recovery-code rotation is single-use under concurrent requests.
- GPT workers serialize per universe, prioritize replies, retry stored failures and avoid duplicate events. Message deletion removes its conversation summary text and cancels pending replies. The endpoint receives actual game context; generated opinions never alter gameplay statistics.
- The native Play action was made asynchronous to avoid Windows WebView creation deadlock. Launcher and account WebView data persist outside the installer. Remote game content receives only a narrow checkpoint acknowledgement protected by the exact origin and a one-use nonce.

## Final automated checks

`npm test` passed on the final client/game source. It runs:

- Eight server integration tests, including database upgrades/backups, signup/session/recovery/logout, isolation, import, actual engine match writes, counter rejection, server season rollovers, manual sample restarts, message read/delete and mocked GPT failures/retries/serialization.
- Mechanics, district/navigation/migration, Meta, player/countdown/results/season, P90 and natural player-match checks.
- Twenty-five cloud/PWA behavioral checks, including offline/stalled/rejected writes, pending recovery, revision races, re-authentication, safe imports, logout, activation ordering, timeout resumption and one reload.

The natural player match completed through actual combat in 7,633 physics ticks. Four matches completed during that run, with all 40 participant records and 360 completed kills/deaths/score events reconciled. Two 100-match simulation runs passed before the final P90 movement correction; they are labeled separately and are not represented as final-source runs.

The final correction received targeted decision/fire/dash assertions and a fresh 600-second live simulation. It recorded 1,803 actual P90 engagements: average engagement 9.1583 tiles, average kill 6.8282, 50.97% inside 7–12, 88.91% inside 5–16, and none over eighteen. The reports contain source hashes and actual observations, not desired outcomes inserted into game telemetry.

## Browser and native checks

The final browser checks loaded the account gate, created a username/password account, continued into its cloud world, retained the session/progress after reload, and used both Meta tabs and selected P90 details. At a 390-pixel viewport the page width remained 390 while the table's 1,077-pixel content scrolled inside a 296-pixel panel; headers remained sticky. Bot/player profiles, all-bot conversation selection, stored replies, deletion, Classic, 2.5D and Tactical views worked without recorded console errors.

During a thirty-frame 2.5D sample, average frame spacing was 8.3 ms with 50 bots in the shared simulation. This is a measurement of this machine and viewport, not a guarantee for every device. 2.5D observed only the viewed match.

The native Windows launcher passed configuration checks and all three Rust tests. The actual Tauri application opened the same account origin, saved a canonical 50-bot world, rejected general native commands from the game, and retained its server selection and session across restarts. Its signed-download checks rejected changed manifests, changed installers, signed checksum/version mismatches and public HTTP packages without changing database progress.

An actual lower-version fixture (1.4.99) detected, downloaded, checkpointed and installed the signed 1.5.0 NSIS package. The installed process automatically reopened both launcher and game windows. A further installed-app launch retained the same account, bot IDs, Power values, monotonic careers and cloud revision. `launcher/verification.json` includes the detailed outcomes and package hashes.

## Delivery and operational boundaries

The distributable includes web/game/server source, vendored Three.js and license, database migrations, reproducible tests, the native source/build/public signing configuration, portable launcher, NSIS installer/signature and deployment/update documentation. It excludes dependency/build directories, smoke databases, account/browser profiles and private signing keys.

Internet cloud hosting and production GPT-OSS-20B inference were not supplied. Their real integrations are implemented and the inference path was tested with a mock endpoint, as requested for unavailable production credentials. Deploy the account server with a persistent database path and configure the inference environment variables to activate them publicly. The included signed launcher manifest is for the default local server and must be regenerated for the hosted HTTPS origin.

The account database is the canonical persisted copy; combat still runs in the existing browser engine. Validation detects inconsistent snapshots, but does not provide server-run competitive anti-cheat. Ambiguous closes or competing sessions prefer the newer valid cloud revision and retain an exportable local branch; histories are never automatically blended.

See `README.md`, `server/DEPLOYMENT.md`, `launcher/README.md`, `dev/VALIDATION-1.5.0.md` and `verification-results.json`. Older unversioned dev reports are retained historical evidence, not claims about this release.
