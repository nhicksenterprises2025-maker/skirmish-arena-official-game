# TACTICAL ADAPTATION maintenance and verification

This internal document carries operational details moved out of the public README. It routes work within the existing project; it is not a replacement architecture. **1.9.1 — TACTICAL ADAPTATION** is the integration target. See [Tactical Adaptation](TACTICAL-ADAPTATION.md) for the bot-only changes and checks. See [Core Tuning](CORE-TUNING.md) for the changed rules, scheduler, movement and balance checks. See [Tactical Instinct](TACTICAL-INSTINCT.md) for mode, tactical-revision and deletion routes. Completion of the acceptance checks below must be established by current test output, not inferred from this document. This historical document path remains stable for existing project routing.

## Targeted routes

| System | Entry points |
| --- | --- |
| Authoritative gameplay, movement, spread, match finalization, careers and meta | `game.js`; corresponding `dev/*-check.cjs` and simulation fixtures |
| 2.5D models and animation | `models-25d.mjs`, `renderer-25d.mjs`, `asset-loader-25d.mjs`; `dev/models-25d-check.mjs` |
| Map presentation and Blender exports | `environment-25d.mjs`, `assets/25d/manifest.json`, `tools/blender_assets.py`, `tools/blender_live_circuit.py`; `tools/blender_validate.mjs` |
| Audio events, mappings and licensing | `audio.js`, `assets/audio/LICENSES.json`; `dev/audio-check.cjs` |
| Account/world sync, cached mode and Phone conversations | Existing cloud/social client and server modules; `dev/cloud-client-check.cjs`, `dev/offline-client-check.cjs`, `dev/social-ui-check.cjs` |
| Tournament registration, schedule, bracket and persisted results | Existing tournament module and server routes/migrations; tournament tests added with the engine |
| Shell, navigation, public settings and Patch Notes | `index.html`, `game.js`, existing styles and release metadata |
| Native startup, bundled backend and updates | `launcher/`; `launcher/README.md` and `server/DEPLOYMENT.md` |
| Release/cache identity | `version.json`, `updater.js`, `sw.js`, package metadata and launcher version configuration |

Read the relevant entry point and direct dependencies. Do not rescan unrelated systems or rewrite working files to change a label. Do not let helpers make independent architecture or migration decisions.

## Preservation and authority

Game art is 2.5D-only; WebGL failure must have a clear recovery state rather than silently presenting legacy operator/weapon artwork. The existing articulated rig consumes observed actor state. Models, animation, Phone framing and set dressing never create another simulation or change collision, hitboxes, movement speed or weapon constants.

Use the existing degree values for stationary hip, walking hip, sprint hip and ADS. Actual character velocity/state chooses the target; cursor position changes aim only. Any transition interpolation must remain between configured states. Shotgun pellets independently sample the configured cone. SR-Aug uses three separate projectiles at the actual burst cadence. Head/body classification remains physical collision with no additional RNG.

One eligible standard-match finalization path commits totals exactly once, persists the local authoritative profile and refreshes its UI immediately. Preserve games, outcomes, kills, deaths, assists, resolved damage, accuracy, headshots, playtime, weapon records and other existing fields. Offline saves queue the existing revision-aware sync. Tournament match results have isolated totals and must bypass normal profile, career, season combat and meta accumulation.

Weapon Balance 8.0 (`b-b9bdf00b`, CORE TUNING) intentionally changes four weapons from Balance 7.0. Archive the previous full dataset once when its constants fingerprint differs; a version-only change must never reset telemetry. Only an intentional change to authoritative weapon constants can require a new balance fingerprint. Preferred range tiles always derive from preferred range divided by 70. Balance 6.0 remains historical telemetry.

Preserve current meta definitions: average engagement range samples actual trigger pulls aimed at visible enemies; kill range records lethal projectile travel. A solo kill requires the finishing weapon to remove at least 200 of the victim's 250 HP since spawn, while finisher credit uses 100 HP or less. Use resolved damage, never overkill. Missing historic contribution measurements remain unknown rather than receiving invented backfills. P90's existing ranged-SMG movement intent is ideal 7–12 tiles, acceptable 5–16, escape pressure below four and no bot firing beyond eighteen, with close emergency shots while separating.

## Blender assets

The existing local authoring executable is `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` (5.2.2 LTS). Runtime uses local decoder-free GLB with Y up, X forward and game units. The simulation X/Y plane maps to Three X/Z. Keep named nodes, editable `.blend` source and `assets/25d/manifest.json` together.

FIELDCRAFT expands the existing `live-circuit-details.glb` path to all 14 weapon kits, the shared operator detail kit used by all eight operators, and the complete phone: 16 assets, 1,297,436 bytes, 17,368 triangles and 63 material meshes. `brightfield-props.glb` retains all 14 named props with refined geometry: 820,456 bytes, 10,342 triangles and 57 material meshes. Shared parts, material reuse and spatial batching keep those details practical during live matches. Existing model names and attachment contracts remain stable.

Operator attachment keys are `torso`, `pelvis`, `foot`, `cuff`. The kit's `sar_vest` and `sar_accent` finishes map to the existing operator palette. Weapon entries map the exact weapon name to `body` and applicable `mag`/`slide` attachments. All attachment origins, rotations and scales are identities so reparenting keeps the existing animation contract. Palette-tinted materials should be shared per palette; actor disposal must not dispose shared geometry/materials.

The phone faces +Z with +Y up. Its readable screen overlay is 151 × 287 units, centered at `{x:0,y:-1.5,z:9.7}` with a five-unit safe inset. Phone app content remains normal DOM UI.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python .\tools\blender_live_circuit.py
node .\dev\live-circuit-assets-check.mjs
node .\tools\blender_validate.mjs
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python .\tools\blender_live_circuit_preview.py
```

`tools/blender_assets.py` rebuilds the prop manifest, so run `tools/blender_live_circuit.py` afterward to append the current FIELDCRAFT detail entries. Add every runtime GLB to the existing server allowlist, native staging and immutable PWA shell cache. Do not ship editable source boards, preview renders or large source archives solely because runtime assets are cached. The [Blender pipeline](BLENDER_PIPELINE.md) describes both libraries and their 2.5D-only presentation contract.

## Audio identity

`dev/prepare-fieldcraft-audio.py` deterministically masters the retained CC0 sources. Runtime audio contains 56 firing clips (four per weapon), 120 weapon handling clips (three per existing phase), and the retained movement, impact, UI and ambience assets. All 219 runtime assets total 2,779,800 bytes. Source archives, component attribution and exact hashes remain in `assets/audio/LICENSES.json`; source archives stay outside installers and shell caches.

Firing events remain one sound per real bullet or shotgun shell. SR-Aug still emits separate rounds at 0/65/130 ms. Reload cues use existing authoritative phases and completion times. Shuffle bags exhaust variations before reuse; a separate ambience gain stage briefly lowers scenery beneath nearby combat without rewriting user volume settings. Run `node dev/audio-identity-check.cjs` and `node dev/audio-check.cjs` after audio edits. Rebuild with the project's Python environment containing numpy and imageio-ffmpeg; no new recordings or network downloads are required.

## Dialogue internals

The internal service remains Ollama `gpt-oss:20b`, normally at `http://127.0.0.1:11434`. Detection uses `/api/tags`; dialogue uses structured non-streaming `/api/chat`. No account-backend outage should disable an otherwise reachable local dialogue service. Preserve the native fallback transport and canonical job/database handlers.

The server owns persistent jobs, generations, social preferences, permanent bot personalities, relationships and training feedback. Player replies acknowledge immediately and run asynchronously in the existing serialized queue. Interrupted running jobs recover on startup. Failed generation is recorded and never published as invented placeholder dialogue. Existing transport retry and structured-output repair rules remain applicable.

Facts come from simulation records: actual weapon mechanics, observed meta, career/season results, relationships and recorded tournament events. Text cannot create a score, result, opponent, ranking, record or balance change. Model opinions remain attributed opinions and never affect Power, balance or telemetry. Preserve bounded memories/history, account-owned drafts, stale-response rejection and read/unread state. Opening Phone or Messages must not enqueue generation.

Maintain all 50 persistent identities and their social traits. Meaningful questions, complaints, opinions, reactions, rivalry and tournament discussion replace routine reminder spam. Cooldowns and event identities prevent repeated topics; low-social bots remain quieter. See [LOCAL_AI.md](LOCAL_AI.md) for historical queue, validation, training export and environment-variable details. Its old public tab/settings labels and tournament limitations are historical; use current code for those names.

Owner debug visibility is restricted to the exact username `noahhicks719`; retain the preference and server authorization where applicable. Never expose passwords, session tokens, recovery codes or account secrets in diagnostics, prompts, exported datasets or screenshots.

## Tournament invariants

Official schedules derive from server-authoritative season start in 72-hour increments, only while the scheduled start falls inside the active season. Schedule and registration survive restart, reconnect and updates. The client does not need to remain open for deadlines to advance.

Valid tournaments contain eight distinct five-participant teams, with no bot duplicated across teams. Registration/invitation decisions use existing personality/state and commitments. Quarterfinals and semifinals are BO3; the final is BO5 using standard 5v5 TDM rules without normal-stat writes. Placement among same-round eliminations sorts by game differential, kill differential, damage differential and initial seed.

Official fictional earnings per participant are `[50000,35000,20000,12500,7500,5000,2500,1000]` for placements 1–8. Never divide by five. Persist payout identity and history so retries cannot pay twice. Custom tournaments use the same engine, preserve their own results and pay zero. Tournament results must not contaminate normal player/bot combat careers, seasons, Weapon Meta or Gun Score.

Calendar display converts authoritative timestamps to the player's local timezone. Phone reactions consume persisted invitation, acceptance, bracket, elimination, placement and championship facts; they cannot fabricate tournament progress.

## Startup, persistence and release delivery

The Windows launcher starts or reuses the bundled local backend at the configured address, waits for health and restores the account/world. Hosted HTTPS configuration must never trigger a local server launch. Compatible processes are reused; duplicate starts are prevented. The existing browser-development `Start-Game.cmd` still requires Node 24.15 or later; packaged desktop play uses the included runtime.

Persistent SQLite normally lives at `%LOCALAPPDATA%/SkirmishArenaServer/skirmish.sqlite`; `SAR_DB_PATH` overrides it. Native account cookies/WebView storage and database files live outside installer payloads. Diagnostics include `startup.log`, `server.stdout.log` and `server.stderr.log` beside the database. Preserve backups, account cache and any recovered offline branch. Never remove a database or browser profile to repair an update.

Before LIVE CIRCUIT, SQLite schema 3 and game save schema 17 were the installed baseline. These are historical migration inputs, not a requirement to freeze schema numbers. New tournament fields/tables must be additive and backed up. Do not import older records over newer permanent data. Browser storage is origin-specific; changing origin alone does not move an account save.

Existing world sync uses revisions and counter/history validation. Updates, logout and import checkpoint pending progress. An interrupted request retains an account-owned checkpoint; recovery applies only to its original revision. Preserve unsynced branches when cloud state diverges and expose the existing backup/export recovery path. Previously authenticated local accounts continue under cloud-offline mode and synchronize when the matching session reconnects.

Large world snapshots and retained backup branches use `window.SARStorage` in `cloud.js`: IndexedDB `sar-world-cache-v1` hydrates before authentication/world selection, while a synchronous in-memory map serves gameplay reads. Legacy `localStorage` entries migrate transactionally; remove an original only after its durable commit succeeds. Failed commits retain their queued batch and report an error. Keep account ownership, pending revision checkpoints and every retained branch together in complete exports. Imports, replacement, logout and update checkpoints await the durable flush before navigation or installation; never load an older local snapshot merely because synchronous storage quota was exhausted. New large-world tests must exercise real IndexedDB, failed/delayed commits and restart restoration, rather than only the no-IndexedDB client mock.

Publish the game shell atomically at its existing origin. Launcher, game, installer, package manifests, update manifest and cache must identify the same release. `version.json.shellRevision` identifies the exact immutable shell within that release; TACTICAL ADAPTATION uses `sar-shell-1.9.1-tactical-adaptation-1`; the preceding CORE TUNING shell was `sar-shell-1.9.0-core-tuning-1`. The preceding Balance 7.0 shell was `sar-shell-1.6.0-live-circuit-2-balance-7`. Native windows enter through uncached `desktop-entry.html`, which is bundled and served with `no-store` but intentionally excluded from service-worker CORE. Older workers may retain `desktop-launch.html` with a stale inline bootstrap; retaining that legacy route while using the fresh entry avoids resetting the account profile. The external `desktop-launch.js` also uses `no-store`. The desktop preflight checks both worker version and cache revision before navigation, using the same `./sw.js` registration as the browser updater. An older same-version worker is insufficient. Never cache account APIs. The updater verifies version, size, SHA-256 and existing signatures before installation. An open game must acknowledge its completed checkpoint before replacing runtime files. Private signing keys remain outside the repository; updater signatures do not replace Windows publisher signing.

Public titles, menus, README and launcher content use **Skirmish Arena**. The existing Tauri `productName`, package name, executable name, installer basename, application identifier and physical install/account paths remain unchanged for upgrade compatibility. Renaming those storage or installer identities could create a second installation or disconnect an existing account profile. `launcher/src-tauri/installer-hooks.nsh` sets the public installed-app DisplayName and setup caption, and renames only Start Menu/Desktop links whose exact target belongs to this installation. Uninstall removes only those owned renamed links; update mode retains them. The internal legacy identity is deliberate; it is not the active in-game wordmark. `version.json.history` retains previous release metadata unchanged for expandable historical notes.

Start the service-worker update without awaiting its promise before the bounded activation loop. A worker waiting for `SKIP_WAITING` can keep that update promise unresolved; awaiting it first prevents the loop from activating the very worker it needs. The lifecycle fixture holds the promise until activation and verifies that the exact revised cache becomes active before navigation.

Use [server/DEPLOYMENT.md](../server/DEPLOYMENT.md) and [launcher/README.md](../launcher/README.md) for API/environment variables, HTTPS, native builds and publication. A configured server must actually receive the signed release before Update Game can offer it; clicking Update does not publish a release.

Every meaningful release has version, short name, date and concise public categories: New Features, Improvements, Balance, Bug Fixes. Omit empty categories. Latest notes expand by default; historical notes stay available and collapsed. Every user-visible change appears in notes. Public release notes and README omit internal model branding; maintenance docs may retain it.

## Verification gates

Run commands from the existing project. Use isolated databases/accounts and a separate native WebView profile for tests. Never run migration or synthetic combat tests against the player's live account.

```powershell
npm ci
npm test
node .\dev\live-circuit-assets-check.mjs
node .\tools\blender_validate.mjs
```

Run changed-system checks first, then relevant integration checks. The existing game suite covers mechanics, navigation, migration, weapon balance/meta, actual player matches, model mechanisms, map cutaways, audio, pointer lock, resolved damage numbers and movement spread. Client tests cover revision checkpoints, cached mode and social UI. Add tournament/profile/UI tests alongside their implementation; do not describe planned checks as passing evidence.

Current acceptance must demonstrate:

- All operator/weapon presentation uses 2.5D, all eight operators and all 14 weapons receive their refined detail kits, and animation leaves hitboxes/speed unchanged.
- Actual AR-15 and Tundra movement states produce their exact configured degrees. Moving the stationary Tundra cursor from close to medium to the edge changes neither degrees nor reticle size. Real shots, pellets and SR-Aug rounds share that state cone.
- Completed standard wins/losses update every profile delta exactly once, immediately and after reopening/restart; zero-kill matches count correctly. Tournament results produce no normal-profile/meta deltas.
- A large retained world exceeding synchronous storage quota still restores the newest accepted progress after restart. Complete export includes durable retained branches, and imported world/settings wait for their durable commit before reloading.
- Every weapon uses four distinct firing cuts and three variations per reload phase, with correct event timing, bounded peaks, licenses and retained audio settings.
- Phone opens quickly, all 50 contacts load, history remains lazy/cached, drafts/read state persist, replies work and public model branding is absent. Actual varied personality-driven conversations respect known facts and topic cooldowns.
- Official schedule survives restart; all team/series/placement rules hold; each participant receives the exact official amount once. Custom earnings are zero and all tournament totals remain isolated.
- Actual previous-build update loads the new launcher and shell, survives restart and preserves database, world, account cookies, careers, seasons, familiarity and historical telemetry. Verify the deployed build, not only source version strings.
- A previously active same-version shell with an obsolete cache revision upgrades successfully even while its registration update promise waits for `SKIP_WAITING`; no startup deadlock or stale world load is allowed.
- Normal 5v5, four bot simulations, spectating, loadout/operator selection, owner-only debug, offline/local play and audio settings regressions pass.

LIVE CIRCUIT integration verification completed on October 1, 2026. `dev/VALIDATION-1.6.0.md` records those historical checks, native installed-account restart and uninterrupted tournament-result acceptance. Earlier `dev/VALIDATION-1.5.*.md`, simulation JSON and launcher verification files also remain historical evidence. FIELDCRAFT requires fresh changed-system and installed-release evidence; earlier reports do not establish its acceptance.

## Version 1.9 account progression (installer build 1.9.2)

`progression.js` is the shared exact reward/level calculation. The account world has one `progression` object: integer `totalXPUnits` (100 = 1 XP), derived `currentLevel`, permanent eligible `usedWeapons`, and an append-only `awards` map keyed by the completed match ID. `totalXP` is exposed in normal units by `SAR.getProgression()`. Hundredths preserve the final official ×1.3 multiplier without per-event rounding. The 50th threshold remains configured for future use; only the first 49 can advance the player.

The existing completed-match pipeline commits XP before its single world checkpoint and freezes the receipt in the result. Successful human trigger pulls and dashes collect eligible match events; kill types use the existing resolved telemetry branches. Result statistics supply assists, deaths, headshot kills and accumulated alive time. Highest-tier bonuses do not stack; exact leader ties qualify. Official eligibility comes from the registered tournament context and is rechecked against account-owned official events during server world writes. Custom/practice never mutate progression. Existing actual standard weapon-use history seeds migration discovery without retroactive XP; menu picks do not. No careers, ratings, weapon constants or tactical samples are reset.

`server/progression.cjs` validates reconciliation, irreversible discovery, immutable receipts, completed standard games and tournament registration. Whole-world revision/checkpoint/recovery rules remain authoritative. There is no second XP database or localStorage balance. Conflicting offline branches retain the existing backup/export recovery flow.

`boot.js` and `boot.css` share a three-second minimum across the uncached desktop entry and game page, while startup continues concurrently. The game gate or initialized 2.5D renderer releases the presentation; failures expose bounded retry states. Build 1.9.2 uses `sar-shell-1.9.2-account-progression-3`; public Version 1.9, weapon Balance 8.0 and tactical/ruleset revisions remain distinct.

Run `node dev/progression-check.cjs` and `node dev/boot-presentation-check.cjs` for targeted progression and real-browser startup checks, then the existing cloud/offline, tournament, persistence and updater checks. Native release acceptance uses an isolated account/database/profile and a complete standard match.

Startup waits for the waiting worker’s activation state change (with a bounded timeout) before probing the old controller again. Immediate repeated version messages could keep the retiring controller busy and stall activation. Real-browser cache upgrades and native account-cache upgrades verify the transition without deleting user data.
