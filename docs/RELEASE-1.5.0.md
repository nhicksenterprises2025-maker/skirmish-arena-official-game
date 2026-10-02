# Skirmish Arena Reimagined — Live Update 1.5.0

This release updates the existing game with persistent server accounts, desktop updates, a second battlefield renderer and expanded Weapon Meta analytics. It preserves the original combat simulation, all eleven weapon definitions, 50 permanent bots, four simultaneous 5v5 games, matchmaking, Power/personality/Form/familiarity, careers, seasons, maps, controls, ADS, sprint, dash, healing, loadouts, weapon art and patch archives. The preceding 1.4.0 folder is retained separately.

## Open the game on Windows

1. Extract the complete release ZIP into a normal folder. Keep the folder together.
2. Install Node.js 24.15 or later if it is not already available.
3. Double-click **Start-Game.cmd**. It installs the small server dependency when necessary, starts the local account server and opens `http://127.0.0.1:8803/`.
4. Create an account with a username and password. Signup logs in immediately; save the one-time recovery code. An existing world on the same origin can be imported into an empty cloud account.
5. Use the opening **UPDATE GAME** button to check and install a published game release.

The starter keeps the database at `%LOCALAPPDATA%/SkirmishArenaServer/skirmish.sqlite`, outside the extracted build. A configured `SAR_DB_PATH` takes precedence. Leave that database in place when replacing game files. The local server stays running after the browser closes and stops when Windows stops the process or shuts down. Logs are beside the database. An already-running different release is reported instead of being stopped automatically.

For desktop play, install `launcher/dist/Skirmish Arena Reimagined_1.5.0_x64-setup.exe`, or run `launcher/dist/skirmish-launcher.exe`. Start the account server first. The launcher's default server is the same local `8803` address; its **Server connection** field also accepts your hosted HTTPS server. Browser and desktop use the same server accounts, with separate persistent login cookies.

A hosted internet cloud service and a GPT inference provider must be configured on your actual server. This package includes their implementation and setup documentation; it does not contain a predeployed public service or inference credentials. A standalone static host still runs the existing local game but does not provide cloud accounts or messages.

## Weapon Meta

**PRIMARY META** is the default and contains the nine primaries. **SIDEARM META** contains only 9mm and X16; their scores and usage are evaluated within their own category without a sidearm penalty. Both tabs use the existing live refresh and sortable table. Rank, weapon and sticky headers stay visible while the table scrolls inside its panel. The page does not expand horizontally.

The table shows rank, weapon, Gun Score, K/D, kills, deaths, usage, accuracy, kills/min, damage/min, average engagement range, average kill range, solo kill percentage, finisher kill percentage and sample confidence. Click a weapon for its procedural model, role, full statistics, body/head TTK, loadouts and Top 3 bot users. The P90 detail adds its designed **7–12 tile** range beside actual live measurements.

- Average engagement range samples real trigger pulls aimed toward visible enemies. Average kill range records lethal projectile travel separately.
- A solo kill requires the finishing weapon to remove at least **200 of the victim's 250 HP** since spawn. A finisher kill means that weapon removed **100 HP or less**. Overkill never inflates the ledger.
- New contribution percentages use only kills with recorded contribution data. Historical kills, career totals and original telemetry remain intact; new fields are never backfilled with invented observations.
- Missing or immature measurements display **—** or **LOW SAMPLE**. Confidence describes sample maturity.
- Active Meta uses only the current balance patch. Patch archives and manual sample restarts preserve the preceding measurements permanently.

P90 bot approach, reposition, chase and attacking-dash goals now respect its ranged-SMG role: ideal 7–12 tiles, acceptable 5–16, escape pressure below four, and no firing beyond eighteen. This changes AI movement choices, not weapon damage, spread, cadence, ammunition, reload or falloff values. Close emergency shots remain possible while a bot tries to separate.

## Battlefield and profiles

**Settings → View** switches between Classic top-down and **2.5D** without restarting the match. Both observe the same actor, projectile, collision, health, AI and score state. The WebGL view renders only the current match, with raised walls, cover, trees, dimensional armor/operators, distinct procedural weapon models, projectiles and shadows. The other bot matches continue without separate 3D scenes. Mouse aim uses a ground-plane raycast in 2.5D. Classic remains the fallback if WebGL is unavailable.

Spectator View offers Follow Operator and Tactical Overview. Click the spectated bot's name, a leaderboard name or a message profile link to inspect its actual lifetime record. Operator and weapon art remains visible in Classic during gameplay, as well as in the armory and weapon detail panels.

The player match starts with **3–2–1–FIGHT**. Its participants, firing and full five-minute clock wait for FIGHT while other bot games continue. Results display Victory/Defeat, team scores, MVP, your combat statistics and the ten actual participants, followed by Play Again, Lobby or Spectate.

The top-right username opens Profile, Settings, Account and Logout. Player Profile includes actual career totals, accuracy/headshots/playtime, records, weapon history, recent completed games and season history. Every bot retains a stable ID and its Power, personality, lifetime career, familiarity, weapons, seasons and Form. Newly introduced per-weapon completed-game counters are labeled as observations beginning in 1.5.0.

## Accounts, saves and messages

The included Node server uses persistent SQLite schema **2**. Game save schema **17** migrates additively from earlier worlds. Passwords and recovery codes are hashed on the server; session cookies persist across restarts. Cloud writes use revisions, validate identities/history/counter consistency and preserve original import backups. Server time anchors season deadlines. Database migrations back up existing files before applying changes.

Game updates, desktop installation, logout and save-file import pause and checkpoint pending cloud progress first. Interrupted requests retain an account-owned checkpoint. On the next launch it recovers only against the original revision. If another session changed the world, the valid cloud revision wins and the newest unsynced branch remains available through an explicit recovery notice and **EXPORT BACKUP**. Transient errors retain the checkpoint and wait for reconnection. An expired session pauses play and requests login again. Offline/rejected updates resume play while retaining progress, except when authentication must be renewed.

**Save Data** exports a full offline backup. To move a world from the earlier local-only game at another address, export there, open a fresh cloud account, and import the file through Save Data. An established account rejects imports that regress permanent records; use an empty account for a historical baseline. Browser storage is origin-specific, so changing address alone does not transfer an old local save.

The **Messages** inbox supports persistent threads, read/unread state, replies, deletion, bot-profile links and new conversations with all 50 bots. The server creates structured events from actual records before requesting GPT-OSS-20B text. Career milestones, season champions, affected favorite weapons and announced tournaments can create events. Stored replies and generation requests survive builds; cooldowns, probability gates and unique event IDs avoid constant or duplicate messages. Conversation context stays bounded. Opinions never feed back into weapon balance, telemetry or Power.

Without a configured GPT endpoint the inbox truthfully says generation is pending; player messages still persist. A mock OpenAI-compatible endpoint was used to verify generation, context, failures, retries and duplicate protection. Persistent tournament IDs, participants, statuses and bracket/event metadata are included; tournament combat/bracket execution is future work.

## Deployment and future updates

See **server/DEPLOYMENT.md** for the complete database tables, API, environment variables, HTTPS setup, backups and GPT endpoint configuration. See **launcher/README.md** for native builds, pinned public keys, signed manifests, package hashes and safe publication.

Publish web releases atomically at the existing origin and increase the matching version in `game.js`, `index.html`, `updater.js`, `sw.js`, `version.json` and package manifests. Each service-worker cache belongs to one immutable release. Its API traffic is never cached. The Update Game button checks, downloads, checkpoints progress and activates the whole new shell.

For desktop updates, retain the private updater key outside this release, build with the new version, and publish the signed manifest and signed installer to the account server. The native launcher verifies manifest and package signatures plus version, size and SHA-256 before installation. An open game must acknowledge a completed cloud checkpoint. Accounts, database and WebView login storage live outside the installer. Updater signatures are separate from Windows Authenticode publisher signing; no publisher certificate was supplied.

A future update becomes available only after it is published to your configured server. The included launcher release metadata is for local verification; regenerate it for the actual HTTPS deployment address. Neither static hosting nor clicking Update publishes an unpublished version.

## Validation

Run from this release:

```powershell
npm ci
npm test
```

This runs server integration tests, mechanics/navigation/migration/Meta/platform/P90/player-match checks and client checkpoint/PWA tests. The native launcher's configuration, Rust, signature and actual Windows UI/update checks are recorded in `launcher/verification.json`. Detailed game evidence is in `dev/VALIDATION-1.5.0.md`; the release audit is `AUDIT.md`.

Two 100-match live-simulation runs passed before the final P90 movement correction. Focused movement/fire assertions and a fresh 600-second simulation validate that correction; no final-source 100-match run is claimed. Browser screenshots verify both Meta tabs, mobile width, profiles, messages, Classic and WebGL views. Test accounts, databases, browser profiles, node_modules, Rust build intermediates and private signing keys are excluded from the distributable ZIP.

Combat remains the existing browser simulation. Server validation detects inconsistent snapshots; it does not make coordinated forged client combat records impossible. The game must be open, visible and unpaused for simulation to advance. Stored season deadlines advance by server time even when the game is closed.
