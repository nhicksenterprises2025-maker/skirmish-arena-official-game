# Skirmish Arena Reimagined — completed in-place release 1.5.2

Completed on 29 September 2026, America/New_York, inside the existing project:
`C:/Users/Noah/Downloads/skirmish-arena-reimagined-live-update-1.5.0-pwa`.
The existing installed desktop application and its Reimagined shortcuts now use
1.5.2. The project directory, account origin, database location and save key are
retained. The supplied current build was the baseline; no second game was made.

## Run the updated build

1. Double-click `Start-Game.cmd` in this project to start the local account/game
   server. It checks the existing service before starting another process.
2. Open the **Skirmish Arena Reimagined** desktop shortcut, or use
   `http://127.0.0.1:8803/`. The server was left running at completion.
3. Press **PLAY** or **WATCH BOT GAMES**. Browser entry requests fullscreen and
   focuses the game canvas. Native entry opens a fullscreen game window. F11 or
   the fullscreen control returns to a window. Tab remains in combat for the
   scoreboard. Settings → View remembers fullscreen preferences.
4. Sign into the existing account, then open Settings → AI. The already-installed
   `gpt-oss:20b` is detected through local Ollama. Open Messages to select a bot
   and send a real reply. There was no Ollama installation or model download.

The older, separate **Skirmish Arena** shortcut still targets its older launcher;
use **Skirmish Arena Reimagined** for this update.

## AI architecture implemented

Actual simulation facts produce structured events. Eligibility combines event
importance, permanent traits, Form, relationships and per-bot cooldowns. The
server queues one local generation at a time, with direct replies ahead of
routine events. Requests use `http://127.0.0.1:11434/api/chat`, the installed
`gpt-oss:20b`, one speaking bot's identity, bounded conversation memory and
relevant current-patch facts. Exact hit-count/TTK/breakpoint calculations and
explicit units accompany weapon context. Current Meta uses the shipped engine's
Gun Score calculation with separate primary and sidearm categories.

Strict six-field JSON validation and targeted factual checks precede durable
message publication. Invalid JSON or detected mechanical contradictions receive
one repair attempt; failures do not become fake messages. Durable queued work
survives server restart. Connection states distinguish connected, offline,
missing model and model error. The social worker never controls combat or writes
match outcomes, Power, damage, pathfinding or weapon balance.

## Messages and personality features implemented

- The existing Messages tab has unread counts, bot conversations, subjects,
  previews, timestamps, categories, bot Power/playstyle/Form and qualified season
  rank. All fifty bots can be selected. History is paged in full, read state is
  saved, and drafts are preserved separately by account and bot.
- Real replies enter the priority queue immediately. Bot-initiated balance,
  Meta, weapon, season, career, rivalry, map and supplied tournament events use
  anti-spam limits. The game continues while the model generates dialogue.
- All fifty supplied permanent identities and all 450 assigned trait values
  were checked against the supplied document. Stable bot IDs and existing combat
  personalities remain intact. Gratitude, competitiveness and rivalry tendency
  use documented derived defaults where the supplied sheet provided no numeric
  assignment. Power is gameplay ability, not dialogue intelligence.
- Conversation summaries, real event/conversation memories, attributed opinions,
  player trust/respect and game-controlled friendship/rivalry persist in SQLite.
  Context remains bounded; the complete history is retained separately.
- Live refresh preserves reply drafts, correction text, lab input, open tools,
  selected conversation, focus and scroll. Account changes discard stale
  asynchronous results. Message deletion removes associated active memory
  references and pending reply work.
- The established paper/sage visual language is retained. The current character,
  weapon, map, Classic/2.5D and Meta visuals from 1.5.1 remain integrated.

## Training data implemented

Settings → AI has Developer Mode, Test Model, queue status, Personality Lab and
Training Data → Export JSONL. GOOD records an accepted response, BAD records a
rejected response, and EDIT preserves the original with a preferred correction.
Rated records retain identity, social profile, event, relevant context, memory,
actual prompt, raw/validated response, rating/correction, model digest, game
version and balance patch ID. Accepted/corrected rows include chat-format
examples; rejected rows are not promoted into accepted examples. Account
credentials are excluded from the context and dataset queries.

## Database and save migration

`server/migrations/003_local_ai.sql` migrates SQL schema 2 to 3 additively. It adds
social profiles, relationships, AI preferences, durable jobs, generations,
training feedback, message fields and indexes. Game save schema remains 17.
Existing IDs, accounts, careers, familiarity, telemetry, seasons and messages are
preserved; historical telemetry is not reconstructed or mixed into current Meta.

The actual installed database was backed up to:
`C:/Users/Noah/AppData/Local/SkirmishArenaServer/backups/pre-1.5.2-1790735656471.sqlite`.
At migration, sorted record hashes using every original column of every existing
table matched before and after. This includes the account, 50 bots, 50 bot career
records, 600 bot weapon records, 12 player weapon records, patch archives,
messages, summaries, structured events and 60 backups. Integrity was `ok`, schema
3 was active, and 50 new permanent social profiles existed. Normal simulation
and social activity may subsequently add legitimate records. Evidence:
`dev/installed-db-1.5.2.json`.

## Tests run and observed results

- **Full `npm test`: passed.** This includes 17 server tests, game mechanics,
  district/navigation, migration, Meta, platform, P90 range, player match, all 12
  official weapon definitions, articulated models, environment cutaways and
  actual exported Blender asset validation. Eight articulated model checks and
  25 cloud/PWA checkpoint tests passed. The social UI checks cover full-history
  pagination, live updates, per-account drafts, correction/lab preservation,
  settings races and Escape-lock cancellation.
- **Actual installed model: passed.** Fourteen final lab cases cover eight
  distinct bot voices and targeted mechanics/sample-size/personal-versus-global
  reasoning. A real map event and real Pump conversation passed. Context was
  persisted, queued work resumed after restart, GOOD/BAD/EDIT records and valid
  JSONL survived, SQLite integrity was `ok`, and social generation left the
  fixture game world byte-for-byte unchanged. Missing tournament results did not
  invent a winner. Earlier failures and replaced generations are preserved as
  regression evidence rather than hidden. See `dev/ollama-acceptance-results.json`
  and `dev/ollama-rejected-baseline.json`.
- **Actual browser flow: passed.** Sign-in, connected status, all 50 recipients,
  fullscreen entry, focused canvas, Tab containment, Escape, pause and leave
  worked. At 390 pixels, the page did not overflow horizontally. All 21 service
  worker core assets returned HTTP 200. The final live inbox reply from Quill
  correctly reported P90 designed range 7–12 tiles in about 18.5 seconds. GOOD
  displayed `GOOD SAVED`, and export produced valid current-version JSONL.
  Background telemetry advanced through the exchange with simulation unpaused.
  See `dev/browser-1.5.2-results.json` and the screenshots it lists.
- **Native release: passed.** Three Rust tests, configuration checks, valid signed
  download, tampered manifest/installer rejection, checksum/version mismatch
  rejection and public HTTP rejection passed. Actual native game fullscreen
  matched the 1920×1080 monitor and toggled off/on. The signed update package was
  built and the existing installed app was updated to 1.5.2. Existing launcher
  settings were unchanged and the actual Reimagined shortcut showed 1.5.2. See
  `launcher/verification-1.5.2.json`, `launcher/fullscreen-results-1.5.2.json`
  and `launcher/installed-update-results-1.5.2.json`.
- **Final running service: passed.** The original local account service at
  `http://127.0.0.1:8803/api/status` returned version 1.5.2 and SQL schema 3. The
  release endpoint also reported 1.5.2. Isolated browser/model test runtimes were
  closed; the user's Ollama installation/service was retained.

## Files modified in this release

Gameplay/UI and update integration:
`game.js`, `cloud.js`, `index.html`, `updater.js`, `sw.js`, `version.json`,
`package.json`, `package-lock.json`, `README.md`.

Server and deployment:
`server/db.cjs`, `server/index.cjs`, `server/messages.cjs`, `server/DEPLOYMENT.md`.

Native launcher and release workflow:
`launcher/src-tauri/src/main.rs`, `launcher/src-tauri/build.rs`,
`launcher/src-tauri/Cargo.toml`, `launcher/src-tauri/Cargo.lock`,
`launcher/src-tauri/tauri.conf.json`,
`launcher/src-tauri/capabilities/game-checkpoint.json`,
`launcher/package.json`, `launcher/package-lock.json`, `launcher/README.md`,
`launcher/scripts/build.ps1`, `launcher/scripts/release.cjs`,
`launcher/scripts/check.cjs`, `launcher/scripts/install-check.cjs`,
`launcher/scripts/native-check.cjs`, `launcher/scripts/update-check.cjs`.
Generated native executables, installer signatures and local release manifest
were updated together. Private signing material remains outside the project.

## New files created

Runtime and documentation:
`fullscreen.js`, `ai-ui.js`, `ai-ui.css`, `docs/LOCAL_AI.md`,
`server/local-ai.cjs`, `server/social-personalities.cjs`,
`server/social-events.cjs`, `server/weapon-dialogue.cjs`,
`server/migrations/003_local_ai.sql`.

Verification tools and tests:
`server/tests/local-ai.test.cjs`, `server/tests/social-api.test.cjs`,
`server/tests/dialogue-accuracy.test.cjs`, `dev/social-ui-check.cjs`,
`dev/ollama-acceptance.cjs`, `dev/preserve-installed-db.cjs`,
`dev/serve-ui-check.cjs`, `launcher/scripts/verify-release.cjs`,
`launcher/scripts/fullscreen-check.ps1`,
`launcher/scripts/apply-installed-update.ps1`,
`launcher/scripts/check-installed-binary.cjs`.

Evidence artifacts:
`dev/ollama-acceptance-results.json`, `dev/ollama-rejected-baseline.json`,
`dev/installed-db-1.5.2.json`, `dev/browser-1.5.2-results.json`,
`dev/VALIDATION-1.5.2.md`, `launcher/verification-1.5.2.json`,
`launcher/fullscreen-results-1.5.2.json`,
`launcher/installed-update-results-1.5.2.json`, and five browser screenshots.

## Known limitations

Personality conditioning works immediately and training examples are collected;
the installed model weights have not been fine-tuned. Natural-language factual
guards cover tested errors, not every possible future claim. A 20B local model
can take tens of seconds per reply; queueing is asynchronous, but shared CPU/GPU
resource contention can still affect performance on a busy computer. Missing
facts remain unknown; tournament result messages require actual recorded result
metadata. Browser Escape locking depends on support and permission. Deliberate
Windows task switching such as Alt+Tab remains available.

Earlier visual/Meta/balance implementation evidence is retained in
`dev/VALIDATION-1.5.1.md`; this release preserves that work and changes no weapon
balance values. The new 1.5.2 installer is
`launcher/dist/Skirmish Arena Reimagined_1.5.2_x64-setup.exe`.
