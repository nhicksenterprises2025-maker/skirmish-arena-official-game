# BLUE CIRCUIT validation

Application **1.11.0**, Balance **8.0**, analytics schema **1**. This maintenance record distinguishes completed checks from release gates still awaiting confirmation. Test accounts, databases, browser profiles and generated conversation histories are isolated fixtures. Evidence files live in the directory selected by `SAR_TEST_OUTPUT`; do not commit account backups or local service credentials.

## Verified implementation

| Area | Verified assertions | Commands |
| --- | --- | --- |
| Ranked and XP | All 26 rank boundaries; integer hundredths; existing level requirements and Level 50 overflow; highest award tiers; 5K damage reward; bounded ranked losses and actual zero-floor delta; independent ranked streaks | `node dev/blue-circuit-progression-check.cjs` |
| Actual match finalization | A real resolved 60-kill Ranked TDM awards 485.20 XP / 230.10 ELO; ten participant receipts agree; retries are idempotent; custom/practice excluded; ordinary XP and official ×1.30 retained; named bots cannot be double-booked | `node dev/blue-circuit-game-check.cjs` |
| Persistence | Non-destructive migration backups; legacy receipts unchanged; midmatch checkpoint followed by finalization; account ownership; duplicate sync/restart; rejected tampering; exclusions | `node dev/blue-circuit-persistence-check.cjs`; `node dev/progression-check.cjs`; `node dev/blue-circuit-browser-check.cjs` |
| Cards and progression UI | All 14 weapon and 8 operator cards have independent rotation; front-facing unarmed operators; separate equipped weapon; all 112 numeric bars use authoritative constants; all 26 badge assets render; earned rank/result/Profile updates; three viewport sizes | `node dev/blue-circuit-ui-check.cjs`; `node dev/blue-circuit-presentation-check.cjs` |
| Preview and assets | Full rotation, isolated transforms, cleanup, transparent badges, on-demand shared rendering, exact font/GLB hashes, editable Blender source retained; previous construction checks covered 14,000 poses | `node dev/blue-circuit-preview-check.cjs`; `node dev/blue-circuit-asset-check.mjs`; `node dev/models-25d-check.mjs`; `node tools/blender_validate.mjs` |
| Cache and offline | Selective shell activation retains saves/backups; asset allowlists and hashes match; resize/open-close preserve valid viewers; genuine offline restart retains progression, fonts, operator previews and rank GLB | `node dev/blue-circuit-cache-check.cjs` |
| Public dialogue facts | All 50 stable identities; real leaderboard sort/position; distinct ranked title/ELO/streak/result ledger; exact cohort/mode Meta; automatic weapon/mode registry context; active patch changes on fresh accounts; all 14 TTKs match display; no private/live-position state; meaningful own-event deduplication | `node --test server/tests/blue-circuit-context.test.cjs` |
| Dialogue contract and queue | Existing persona traits preserved; competitor style; bounded correction; unsupported rank/mechanical claims rejected; fresh facts at execution; no internal text in messages; player request retry/deduplication; unchanged channel preferences and queue limits | `node --test server/tests/blue-circuit-dialogue.test.cjs` |
| Existing services and Phone | Account/world/tournament checks; cached/offline startup; independent dialogue availability; Phone navigation, lazy histories, drafts and correction controls; durable cache ownership | `npm run test:server`; `npm run test:client` |

The combined Run 3 server log records **54 passing tests, zero failures**. The dedicated context suite records **8 passing tests**. The final UI report records **9 passing groups**, zero page errors and zero generation requests from navigation; the cache report records **4 passing groups**, zero errors. Earlier Run 1/2 counts, policies and detailed interfaces remain in [the handoff](blue-circuit-handoff.md).

The final browser UI run measured Loadout opening at 751 ms, Operator at 278 ms and Profile at 209 ms. One shared preview context remained, with zero extra idle renders. The largest observed individual render was 217 ms. These are measurements from this test run, not promised timings on other hardware; the earlier Run 2 measurements remain historical evidence.

## Release preservation audit

Read-only comparison against published commit `3e2f56a` confirmed all 14 complete weapon definitions and the authoritative balance snapshot are unchanged. The fingerprint remains `b-b9bdf00b`; no new balance patch, telemetry reset or progression curve was introduced.

Application identifier, product identity, updater public key/configuration, live channel, server origin and save paths remain unchanged. Launcher service/launch code, cloud persistence code and the web app manifest match that baseline. The existing `sar-persistent-save` key remains stable.

The staged 1.11.0 backend contains exact source hashes for the new dialogue modules, shared progression/mode registries, game code, fonts/styles and badge assets. All 38 relative imports across 14 staged server modules resolve. The 339-file bundle has no database, session, environment, private signing key, training export or editable Blender source files. `node launcher/scripts/backend-bundle-check.cjs` passed. Staging validation does not establish native installation or successful update activation.

## Isolated compiled native verification

`native-blue-circuit-results.json` records **9 passing groups** in the compiled native application, with an isolated database and cached 1.10.0 WebView profile:

- The actual 1.11.0 code/assets and new shell cache activate; the loading minimum remains 3,000 ms. Account identity, XP receipts, careers, seasons, balance fingerprint and archives remain intact.
- The lobby renders at 1920×1080, 1720×1080 and 1024×768. Profile, exactly four Settings tabs, all five Phone apps and expanded statistics use their existing routes.
- A real custom match starts with the correct team perspective and no official XP, career or human-Meta awards. Normal Exit saves before closing and leaves the shared backend alive.
- Reopening preserves identity/progression. Checking an already-running local service reuses its process without duplication. An actual backend outage loads the authenticated cached world and durably retains its pending save; service restoration, reconnect and a further checkpoint succeed.

The automation driver can terminate its child backend when the driver itself is cleaned up. The final missing-pipe cleanup error belongs to that test teardown, after successful checks; normal in-game Exit was separately verified to preserve the service.

## Signed package and physical installation

The final Windows 1.11.0 installer was built with the existing signing identity. The compiled updater accepted the signed download and rejected a tampered manifest, tampered installer, signed checksum mismatch, signed version mismatch and public HTTP URL. Its fixture database remained unchanged. `release-verification.json` records these checks; `release-checks-final.log` records the ten existing release/lifecycle groups, including real Windows named-pipe and legacy-service handoff.

The normal installer completed an in-place update of the physical installation, outside the desktop tool's package virtualization. All **339 installed resource files** match the final staged source, the executable reports 1.11.0, and the shell revision is `blue-circuit-1`. Connection settings are unchanged. Before the first launch, read-only hashing confirmed the existing account and world database rows are byte-for-byte identical to the pre-update snapshot. A recoverable original world was retained privately; this was not a full copy of the large historical database. Evidence: `final-installed-update-result.json`, `installed-database-preservation.json`.

Final installer: **29,710,684 bytes**, SHA-256 `c93ddbc4809daa8a4d6959fc6e2195d933ccddfedd792f1e49ad46bbe71949d6`. It carries the existing updater signature; a Windows Authenticode publisher certificate is still not configured. The final advice-validation guard is included in this installer; all 339 physical resources were rechecked after installation, with account/world database rows and connection settings again preserved exactly.

The physical installed launcher then passed **5 owner-profile checks**: actual 1.11.0 runtime/assets/cache; unchanged account, 323.50 XP and reward ledger, player career and historical balance data; retained bot identities/careers/seasons; all four Settings tabs and five Phone apps; normal Exit, reopen and durable checkpoint. Exact fetched hashes cover game code, progression/mode registries, card rendering/styles, fonts and rank GLB. No synthetic match or dialogue was added to the real account. Evidence: `installed-owner-results.json`, `screenshots-owner/` (private local evidence).

Two owner-test assumptions were corrected without changing the game: WebDriver's alphabetical object-key serialization changed a JSON byte hash despite identical values, so progression is checked by recursive value equality; the existing unread badge is excluded when checking the Messages app's text label. Their initial reports and the exact key-order diagnosis are retained alongside the successful result.

## Local dialogue review

Live evaluation used the existing `gpt-oss:20b` installation, one serialized queue, disposable accounts and explicitly synthetic scenarios. All 50 permanent identities and numeric traits resolve unchanged. Actual responses were reviewed for Ace, Vex, Sage, Quill, Jinx, Ghost, Moss and Zane, plus the actual selected Ranked participant. The initial 15-case run is retained as diagnostic evidence, not presented as an all-pass run.

Eight observed bad outputs are now rejected when replayed against their exact saved contexts: internal field names/unsupported population claims; damage mislabeled as hit count; unsupported community-Meta consensus; an all-modes leaderboard claim from TDM data; an unrelated question replacing the bot's own weapon reaction; hit count conflated with projectile spread; conditional coaching with an unsupported SMG-9 mechanical comparison; and an unsolicited human-targeted recommendation/combat instruction. One correct unavailability answer had been rejected because its negation followed the scope phrase; that exact answer now passes. The nine replay checks are in `blue-circuit-dialogue-regression-replay.json`.

The actual Ranked → Phone test completed a 60-kill match, awarded 485.20 XP / 230.10 human ELO exactly once, rendered the rank/badge/level, then queried the participating bot's separate Beginner I / 10 ELO ledger. An initial 10,000-ELO model claim was blocked; the bounded repair returned 10 ELO, and only that corrected reply reached Phone. Duplicate requests/events and navigation created no duplicate replies. A custom 60-kill match changed neither reward track nor official careers. Browser/backend restart preserved identity, history, unread state, attributed memory and progression; unavailable dialogue left the initialized game usable without fake messages. These complete integration checks are recorded in `repaired-cases/blue-circuit-dialogue-acceptance.json`, independently of its failed wording cases.

The final Quill retest returned correct 125→124 damage, two→three hits and 1.5→3.0-second ideal TTK without the earlier spread conflation. A subsequent unavailable-leaderboard query produced no content: two 180-second test-provider attempts exhausted the 390-second test job wait, with no bot message published. The previously produced correct denial passes the final exact-context validator replay. Production's existing 120-second provider timeout was not changed; test job wall time can include transport retries and is not single-request latency. `final-three/blue-circuit-dialogue-acceptance.json` retains this real limitation.

The final off-meta request completed in **153.747 seconds**, exceeding the production timeout, and still contained unsolicited advice. Manual review failed it even though the preceding validator accepted it. The final minimal guard now rejects that exact saved response, including its combat instruction when the closing recommendation is removed. Direct factual clarifications, personal preferences and banter remain valid. All **14 manually accepted representative outputs** still pass the final guards. No further live sampling was performed to seek a passing response. See `final-offmeta/blue-circuit-dialogue-acceptance.json` and the consolidated `final-selected-review.json`; the final guard was verified by unit tests and independent exact-context replay, not another clean live generation.

Existing GOOD/BAD/EDIT and export facilities were exercised in a disposable review database. Reviewed examples remain private synthetic test artifacts. No real history was populated, and no model weights were trained or downloaded. Validation reduces observed failures; it does not guarantee factual or stylistic perfection.

## Evidence and delivery

Completed browser evidence: `blue-circuit-ui-check.json`, `blue-circuit-cache-check.json`, `after-lobby-*`, `after-loadout-*`, `after-operator-*`, `after-profile-*`, `after-ranked-result-*`, `after-all26-rank-badges.png`, and `blue-circuit-offline-cache.png`. Server/client results are in `server-tests-verified.log` and `client-tests.log`.

The reviewed live evaluation and protected integration checks are complete with the limitations above. The final advice guard is included in the verified signed installer and physical installation. Publication target: one application release, `v1.11.0`, named BLUE CIRCUIT. Record public download verification after publication. Balance remains 8.0.

A full Windows reboot and installation on a second PC were not repeated in this run. Cached/offline restart and the actual owner installation's close/reopen were exercised. Optional dialogue remains subject to the observed latency and generation failures above.
