# 1.8.0 — TACTICAL INSTINCT

Application 1.8.0, AI revision `tactical-instinct-1`, weapon Balance 7.0 (`b-2bec20b9`). These are separate identities. Named releases remain mandatory.

The existing simulation owns all modes, movement, hitboxes, firing, timing and results. `tactical-instinct.js` evaluates bounded utility adjustments from observations; `game.js` applies them above the unchanged navigator. Power affects judgement, communication delay and consistency through each participating member. No team-average combat multiplier exists. Reports arrive after 220–720 ms, round positions to 140 units, carry no exact health/ammunition/velocity, expire, and cannot authorize firing. FFA never receives team reports or support actions. Route/cover experience is session-local and survives respawns.

Custom difficulty uses the same physical rules and permanent identities. Multipliers apply only to observation/decision scheduling, reaction delay and existing aim execution error:

| Preset | Reaction delay | Decision interval | Aim/decision error |
| --- | ---: | ---: | ---: |
| Easy | 1.28 | 1.22 | 1.25 |
| Medium | 1.00 | 1.00 | 1.00 |
| Hard | 0.90 | 0.90 | 0.80 |
| Pro | 0.80 | 0.82 | 0.62 |

No preset changes damage, health, spread, movement, projectile speed, dash cooldowns or permanent Power/personality. Named custom actors carry `sourceBotId` and a different session participant ID. Their career, weapon, familiarity and learned-performance objects are isolated copies. Shared season/patch writers additionally reject ineligible actors. No custom result is submitted to the cloud or official social event path.

Deathmatch reserves nine idle persistent actors, preserving all four background TDM matches. Releasing the session restores their TDM bindings and returns them to the allocator. FFA aggregates live in `modeStats.deathmatch`; the profile has a separate view. TDM counters, careers, seasons, meta and form retain their existing meaning. Final results include mode, eligibility, session type, match ID, application, balance and AI revision. FFA ends at 30 kills or 240 seconds; rank is kills descending, deaths ascending, then damage descending, with exact ties retained.

`patchState` remains the cumulative weapon-patch ledger for existing validation and history. `patchState.aiSamples` preserves the pre-update sample and records each subsequent AI revision separately. Current Weapon Meta and dialogue sample the current revision. Careers, balance archives and patch identity are retained. The server validates sample sums and monotonic mode records.

Custom tournament deletion uses an additive SQLite schema-5 `deleted_at` tombstone. The authoritative store checks creator or existing administrator authorization, exact name confirmation and custom kind. Invitations/reservations are removed and pending dialogue jobs cancelled; active matching runtime engines stop without result/payout writes. Clients poll their active tournament and return to the lobby if it was deleted. Official records remain protected.

Run `node dev/tactical-instinct-check.cjs`, `node --test server/tests/tactical-instinct.test.cjs`, existing profile/tournament/input/spread/meta checks, and the native acceptance runner recorded with release artifacts. Test databases and WebView profiles must be isolated from the owner account. Deployment follows `docs/LIVE-CIRCUIT.md`, `server/DEPLOYMENT.md` and `launcher/README.md`.
