# BLUE CIRCUIT — shared handoff

Status: all three runs are integrated for **1.11.0 BLUE CIRCUIT**, 2026-10-03. Balance 8.0 / `b-b9bdf00b` and analytics schema 1 are unchanged. Ranked/card/Phone integration, reviewed live dialogue, cached-profile native startup and physical owner-account launch/reopen have been checked. Automated combat/dialogue tests use isolated accounts and databases. See [BLUE-CIRCUIT-VALIDATION.md](BLUE-CIRCUIT-VALIDATION.md) for final package/publication evidence and limitations; earlier run-specific results below remain historical evidence.

## Run 3 integration paths

- `server/dialogue-context.cjs`: bounded public facts from the selected stable bot, existing weapon/balance/mode registries, `SAR.botLeaderboardRows`, `metaRowsForCohort` and ranked ledgers. Scopes identify mode/cohort/sort/patch/ruleset/retrieval time and the latest accepted persisted world. Bot Leaderboard covers eligible lifetime TDM; Ranked ELO, Power and account XP remain distinct. Active published numeric changes supplement missing account migration fields after validation against current constants.
- `server/weapon-dialogue.cjs`: reuses the dormant shipped-engine scorer for public leaderboard/Meta queries and current registries. No account configuration, conversations or live positions enter it; it never advances gameplay.
- `server/local-ai.cjs`, `server/social-personalities.cjs`: central competitor conditioning retains all permanent identities/traits, refreshes facts when queued work executes, bounds repairs, validates factual/style claims and keeps failures in the existing retry UI. Player statements remain attributed, untrusted conversation. Existing review/export facilities remain; no model training is performed.
- `server/social-events.cjs`, `server/world.cjs`: at most two relevant contacts per patch, no routine standings-refresh chatter, own ranked-result/rank-change evidence and event deduplication. Existing per-bot cooldowns, priority and global initiation budgets remain.
- `ai-ui.js`: existing Phone failure/retry presentation; navigation does not create generations. `dev/blue-circuit-dialogue-fixtures.cjs` and `dev/blue-circuit-dialogue-acceptance.cjs` provide synthetic examples and opt-in isolated live-model/Ranked acceptance. Focused regressions are `server/tests/blue-circuit-context.test.cjs` and `server/tests/blue-circuit-dialogue.test.cjs`.
- Unified 1.11.0 metadata/cache/staging uses the existing launcher workflow. [Validation](BLUE-CIRCUIT-VALIDATION.md) records unchanged balance/application identity, staged import/asset audit, native activation, account preservation and release delivery.

## Run 2 presentation and assets — historical checkpoint

- `game.js`, `index.html`, new `blue-circuit.css`: independent Loadout/Operator card viewers replace the global top inspector; unarmed front-facing operator previews; exact stat bars; separate lower-lobby Level/Ranked panels; compact Profile and result/breakdown presentation. Existing Play plus six secondary buttons remain.
- `inspect-25d.mjs`: one shared on-demand WebGL renderer. `mountCardPreview(canvas, options)` owns isolated transforms and controls under `.card-model-viewer`; `clearCardPreviews(root)` disposes listeners/models when a panel closes or is replaced. `paintInspection` remains the static-preview API. Cards use pointer/arrow-key rotation, Home/Reset and bounded 0.8–1.08 zoom; wheel/vertical touch scrolling remain native. Only visible dirty cards render, with two first-time models per frame. Cache limits: three static model instances and 48 thumbnails. `SAR.getPreviewDiagnostics()` exposes read-only counts.
- New `fonts.css`, `assets/fonts/`: self-hosted Inter/Oxanium variable fonts and complete OFL notices, source URLs and SHA-256 manifest. Inter handles body/Phone/dense stats with tabular numerals; Oxanium handles headings and short display labels. The existing SVG wordmark is unchanged.
- `tools/blender_blue_circuit_ranks.py`, `assets/25d/ranks/`: all 26 badges generated/exported with installed Blender 5.2.2 LTS, directly from `SARProgression.ranks`; editable `.blend`, optimized GLB, manifest/report and 26 transparent thumbnails. Separate lazy schema-1 library, `{kind:'rank',rankIndex}` in the preview API. See [BLUE-CIRCUIT-ASSETS.md](BLUE-CIRCUIT-ASSETS.md) and the existing [Blender workflow](BLENDER_PIPELINE.md).
- At the Run 2 checkpoint, `server/index.cjs`, `sw.js`, `launcher/scripts/stage-backend.cjs` served, cached and staged the runtime CSS/fonts/notices/rank assets for the later native build. Editable source/report stay out of installers. Rank assets are cached on demand with hashed manifest/version. No release was published during Run 2; the unified version/cache update was deferred to Run 3 and is now prepared as described above.
- Tests: `dev/blue-circuit-ui-check.cjs`, `dev/blue-circuit-preview-check.cjs`, `dev/blue-circuit-asset-check.mjs`, `dev/blue-circuit-presentation-check.cjs`, `dev/blue-circuit-cache-check.cjs`. Run 1 Profile assertions were adapted to the separate rank-name/ELO elements without changing expected rewards. `dev/skyline-analytics-check.cjs` now authenticates its fixture before allocating its human actor, matching the real stable-identity lifecycle.

**Display-only scales:** `weaponDisplayMetrics(name)` / `SAR.getWeaponDisplayMetrics(name)` use all 14 current weapons as one comparison group. Each damage/capacity/preferred-range bar is `value / maximum`; TTK/reload is `1 - value / maximum`, starting from zero. No per-card maxima or invented accuracy/control scores. Values come from existing constants and `weaponSheet`, including real burst cadence/reloads, combined shotgun-shell damage, seconds and preferred range / 70 tiles. These ratios never enter combat, bot selection or Gun Score. Meta continues through the existing `currentMetaRows` cohort/mode source. The in-page Reading the Stats note documents the scale and ideal-TTK convention.

**Construction audit:** no new floating-part defect was reproduced. Existing repairs have identity attachment transforms, solid upper-component contacts and preserved stock/grip/magazine/animation connections across all 14 weapons. Correct source/export geometry was left unchanged. The selection cards' armed angled pose came from caller options, not a broken shared rig; isolated card previews now use the existing unarmed showcase pose. No weapon anchors, timing, hitboxes or palettes changed.

**Run 2 verification:** real Edge UI acceptance passed 9 groups with zero page errors or generation requests, including all 22 cards, 112 numeric bars, explicit Equip/Select, inspection-state preservation, all 26 badges and a real 60-kill Ranked result (485.20 XP / 230.10 ELO). Captures at 1920×1080, 1720×1080 and 1280×800 show no horizontal overflow or clipped labels. Preview checks passed 6 groups, with 24 orientations per weapon/operator, isolated poses, transparent badges, offscreen scheduling, native scrolling and cleanup. Asset checks passed 4 groups; existing construction/model checks passed 14,000 poses / 9 tests. Existing input/damage/spread checks also passed.

Presentation checks passed 3 groups, including independently calculated TTK, Level 50 overflow, Ascendant, every rank label and custom-result exclusions. Cache checks passed 4 groups against the production server/service worker: selective shell activation preserves local/IndexedDB saves and unrelated caches; font/asset hashes and allowlists agree; height-only resize and rapid open/close retain valid isolated viewers; genuine offline restart retains XP/rank/career, fonts and 3D previews. The resize regression is fixed by leaving card canvas sizing/clearing to its owning viewer. Additional regressions passed: Run 1 browser 7 groups / 14 successful writes, Run 1 game 5 groups, persistence 5 groups, progression 5 groups, Profile 4 cases, SKYLINE analytics 6 groups, and all 40 server tests. At that checkpoint, weapons, default configuration and active patch identity matched the published Git baseline; release metadata had not yet been advanced. The current final integration metadata is 1.11.0, with the same preserved balance.

Measured UI opening: Loadout 261 ms, Operator 200 ms, Profile 92 ms in the isolated Edge fixture. One preview WebGL context, zero idle renders, zero resident card models after close. Cold maximum individual render was 112 ms; this is measured test hardware behavior, not a frame-rate guarantee. The entire badge GLB is 1,141,300 bytes / 19,348 triangles; one badge is at most four material draws. Thumbnails total 768,768 bytes.

Historical Run 2 evidence (the test output directory selected by `SAR_TEST_OUTPUT`) contains 12 comparable `before-*` screenshots, 17 `after-*` screenshots including the 26-badge board, and the UI/preview JSON reports. At that checkpoint native installed renderer/package validation was deferred to Run 3. Those browser checks used the production model modules and local asset-loading path; the current final gates are listed below.

## Changed paths

- `progression.js`: shared XP/ranked calculations, 26 ranks, ledgers, validation and presentation queries.
- `match-modes.js`: shared registration/eligibility contract for standard TDM, Deathmatch and Ranked TDM.
- `game.js`: existing Play route, canonical identities/events, immutable finalization, ranked storage, local migration backup, minimal result/Profile readout, official roster reservations.
- `server/progression.cjs`, `server/world.cjs`: account ownership, immutable match evidence, append-only reward validation and migration backup within existing world transactions.
- `index.html`, `server/index.cjs`, `sw.js`, `launcher/scripts/stage-backend.cjs`, `dev/simulate.cjs`: load/cache/serve/stage the shared registry.
- New tests: `dev/blue-circuit-progression-check.cjs`, `dev/blue-circuit-game-check.cjs`, `dev/blue-circuit-persistence-check.cjs`, `dev/blue-circuit-browser-check.cjs`.
- Existing fixtures: `dev/progression-check.cjs` supplies authenticated participant IDs; `dev/live-circuit-profile-check.cjs` reads exact stat cells without crossing progression markup.
- Documentation: this file and the route in `docs/LIVE-CIRCUIT.md`.

## Schema and queries

The existing `sar-persistent-save` world and revision-aware `/api/world` GET/PUT remain authoritative. SQLite still stores the entire atomic snapshot in `worlds.save_json`; no schema/table migration or new sync service.

| Path | Contract |
| --- | --- |
| `world.progression` | Existing version 1, `totalXPUnits`, derived `currentLevel`, `usedWeapons`, `awards[matchId]`. New receipt rules version 2 adds the 5K tier; legacy receipts without a rules version retain version 1 calculations. |
| `world.ranked` | Version 1, `participants[stableParticipantId]`. Absent participants display 0 ELO / Beginner I, without fabricated receipts. |
| `world.ranked.participants[id]` | `ratingUnits`, independent `winStreak`, `awards[matchId]`. Ranked receipt rules version 1. |
| `world.rankedResults[matchId]` | Immutable canonical mode/session, completion time, winner team and ten distinct 5v5 participant rows containing stats, events, outcome and tied-leader flags. Human XP and all ten ELO receipts must agree with it. |
| Receipt identity | `transactionKey = JSON.stringify([participantId, matchId, 'xp' or 'ranked'])`. Rules version is metadata, never part of identity. Legacy match keys stay intact. |

All `*Units` are integer hundredths. Ranked receipts retain `beforeUnits`, `afterUnits`, `performanceUnits`, `calculatedUnits`, `appliedUnits`, `winStreakBefore` and `winStreak`. Server validation binds new human receipts to the authenticated account, checks career evidence and rejects changed/missing history before writing. Whole-match measurements reconcile against cumulative careers because earlier combat may already have been checkpointed midmatch.

Migration only adds empty ranked registries. Existing XP, discoveries, careers, seasons and unknown fields are retained. Before local migration, `sar-ranked-migration-original` preserves the original once; existing XP/schema backups remain. Before the first accepted ranked snapshot, `world_backups` preserves the previous world with reason `before ranked progression migration` in the same SQLite transaction. No retroactive awards or balance resets.

Use these existing runtime entry points in Runs 2/3:

- `SAR.getProgressionSummary(participantId?)` returns `{xp, ranked}` from `SARProgression.summary`; default ID is the authenticated account. XP is account-owned, while the ranked slice uses the requested participant ID.
- `SAR.getRanked(participantId?)` returns the canonical rank view: rating/units, complete rank name, threshold, next rank/threshold, remaining ELO, progress, independent streak and games.
- `SAR.getRewardBreakdown(matchId, participantId?)` returns XP/ranked lines and totals, tournament multiplier, calculated/applied ELO and before/after rank views. XP is null for non-account participants. On a loss the performance lines explain the bounded penalty; they must not be added to that penalty again.
- `SAR.getProgression()` remains compatible. Do not independently compute level/rank thresholds in components.
- `SAR.getModes()` exposes registry entries; `SAR.startRanked()` uses the existing queue. The Play button calls this same path. The shared `SARMatchModes` module exposes `register/get/resolve/officialStats/ranked/botEligible/list`.

## Policies

- Ranked TDM is explicit `sessionType:'ranked', mode:'tdm', eligible:true, practice:false`: same map/combat, 60 kills and 300,000 ms. Standard TDM/Deathmatch grant XP only. Official tournaments retain XP ×1.30 and their existing earnings; custom/practice/custom tournaments grant neither track and consume no first-use discovery.
- The allocator uses canonical named bots, independent of Power. Official tournament participants are reserved from the roster; idle substitutes keep the four ordinary slots' IDs, scores and clocks intact. Active human/Ranked commitments cannot be preempted. Completion/cancel/abandon releases reservations once.
- All supplied awards are used, with only the highest combo, K/D, damage, kill-count and kill-streak tier. New 5K damage is 100 XP / 50 ELO. Account first-use remains 25 XP and zero ELO. Deaths are +0.5 XP / −0.25 ELO.
- Ranked wins sum the ELO schedule including deaths and +2.5 for the win. A separate ranked streak gives its bonus only on wins 3 and 5; casual/custom outcomes do not change it. Existing XP streak eligibility remains separate.
- **Chosen loss formula:** let `P` be net performance ELO including deaths once, excluding the result award and weapon discovery. `strength = clamp(P / 100, 0, 1)`. Calculated loss is `−31 + 12 × strength`, rounded to hundredths centrally with integer arithmetic (half-up). Thus P≤0 gives −31, P=50 gives −25, P≥100 gives −19. No positive award or second death charge follows. Apply the zero floor afterward and report the actual delta separately.
- Existing definitions remain: solo/finisher use finishing-weapon resolved damage since spawn (≥200 / ≤100 of 250 HP); assists require ≥35 recent damage within five seconds; successful dashes/actual weapon fire count; headshot milestones use physical lethal headshot kills. K/D divides by `max(1,deaths)`; all tied leaders, including zero-valued ties, receive existing leader awards.
- TDM ties use the existing sudden-death overtime. An unresolved ranked draw is rejected instead of inventing an award policy. Deathmatch tie/placement policies are unchanged.
- Official XP multiplies the subtotal once by 13/10, then rounds centrally to hundredths. Level requirements remain unchanged, cap 50 retains lifetime/overflow XP and the configured level-50 future cost. Ascendant at 10,000 ELO is the final supplied rank.

## Verification

Passed:

- `node dev/blue-circuit-progression-check.cjs` — 9 groups: all 26 rank boundaries, level boundaries/overflow, precise schedules, highest tiers, legacy receipts, eligibility, loss endpoints/midpoint/rounding, streaks, promotion/demotion, replay and summaries.
- `node dev/blue-circuit-game-check.cjs` — 5 groups: actual 60-kill resolved match (485.20 XP / 230.10 ELO), all ten receipts, Profile/retry/restart, bot events, exclusions, official multiplier and reservation/release/overlap behavior.
- `node dev/blue-circuit-persistence-check.cjs` — 5 groups: original backup, migration, midmatch checkpoint then finalization, duplicate sync/SQLite restart, exclusions, tampering/identity rejection and legacy replay.
- `node dev/progression-check.cjs` — 5 existing progression groups.
- `npm run test:server` — 40 tests.
- `npm run test:client`, `npm run test:game`, `npm run test:live-circuit` — all passed. Existing harmless Node module/optional-preview harness warnings remain.
- `node dev/blue-circuit-browser-check.cjs` — 7 groups in Edge with an isolated SQLite backend and browser profile: real Play → Ranked allocation, 60 resolved lethal events, immediate Profile/repeated finalization, failed checkpoint and offline retention, reconnect/repeated sync, full browser/backend restart, custom exclusion and an existing-account migration preserving both backups once. 14 successful world writes, zero page errors. Test-only hooks freeze background simulation and drive existing combat; production rewards, UI, persistence and validation execute unchanged. Screenshots inspected at normal page size.
- JavaScript syntax check for `game.js`; `git diff --check`.

Historical Run 1 browser evidence: `blue-circuit-browser-check.json` in the test output directory, with `blue-circuit-play.png`, `blue-circuit-ranked-result.png`, `blue-circuit-profile.png` and `blue-circuit-custom-result.png` alongside it. Set `SAR_TEST_OUTPUT` to choose a different evidence directory when rerunning.

## Combined release notes

**BLUE CIRCUIT / Gameplay:** Ranked TDM is available through Play with a separate 26-rank ELO ladder for players and named bots. Official participant reservations prevent overlapping appearances.

**Progression:** Adds the 5,000-damage reward tier, exact fractional scoring, ranked-only win streaks and clear calculated/applied ELO results. Existing XP, levels, first-use history and careers carry forward.

**Reliability:** Match receipts use stable participant/match/track identities and immutable result evidence, preserving rewards across local saves, retries and cloud reconnects.

**Equipment:** Every weapon and operator card has its own drag, keyboard, Reset and zoom controls. Operator showcases face forward unarmed; equipped weapons retain their separate showcase. Weapon bars pair consistent comparisons with exact values and an optional advanced sheet.

**Presentation:** Separate Level and Ranked panels sit below the lobby navigation, with a complete family of 26 modeled rank crests and clear Profile/result progress. Self-hosted Inter and Oxanium improve headings, messages and numeric readability while retaining the blue identity and existing logo.

## Final integration record

Runs 1/2 viewers, assets, ranked rewards and persistence retain their verified architecture. The final server suite passes 54 tests; nine UI groups and four cache groups pass. Nine isolated native groups cover cached-profile upgrade, exact assets, custom exclusions, service reuse and offline recovery. Five physical owner-profile groups verify current runtime/assets, preserved account/progress and normal Exit/reopen. Fourteen reviewed representative dialogue outputs remain valid; eight observed bad outputs are rejected by final exact-context replay. One fresh query timed out, and the final off-meta style repair was replay-tested without another live sample. No model training occurred. Package hashes, installed resource checks, public delivery and limitations are recorded in [BLUE-CIRCUIT-VALIDATION.md](BLUE-CIRCUIT-VALIDATION.md). Preserve Balance 8.0 telemetry and the stable application/save/update identity.
