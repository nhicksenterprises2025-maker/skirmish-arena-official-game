# 1.9.0 — CORE TUNING

This update changes only standard TDM rules, the shared mode-aware HUD, official slot scheduling, movement execution and four weapons. Phone, XP, tactical decision logic, tournament rules, models and audio remain unchanged.

- Application: `1.9.0`; shell: `core-tuning-1`.
- Weapon balance: `8.0`, fingerprint `b-b9bdf00b`. Changed values are in `version.json` and `WEAPON_PATCH_NOTES`.
- Movement/match rules: `core-gameplay-1`. Tactical AI remains `tactical-instinct-1`.

## Rules and scheduler

`game.js` owns standard/custom TDM's 60-kill target, five-minute clock and existing tied overtime. Deathmatch retains ten participants, 30 kills and four minutes. Tournament games retain their preceding 50-kill target.

`SAVE.matchSlots` persists each official slot's active identity/generation or completed-match cooldown deadline. `wallNow()` uses the existing server-corrected scheduler clock; `readyAt = endedAt + 15000`. Cooling rosters remain reserved. Reload reserves them before rebuilding other slots; expired slots synchronously consume one replacement. Custom/practice and tournament sessions do not enter this scheduler. Gameplay time begins only after replacement initialization/countdown.

## Movement correction

Nearby goals could move within the old 110-unit repath threshold while the stored path still ended at the old destination. Bots overshot and repeatedly reversed around that stale endpoint. Local ally/obstacle repulsion could also reverse a valid path vector.

The existing navigator now rebases reachable final waypoints, stops within its arrival tolerance, skips intermediate waypoints only with body clearance, and limits necessary replans to 350ms. Local avoidance retains a forward component and falls back to the original swept-clear path if its steered probe is blocked. Existing tactical choices, smoothing, speeds, collision, recovery and animations remain authoritative.

## Verification

Run `node dev/core-gameplay-check.cjs` for the independent 14-weapon sheet, real TTK, 59th/60th kills, exact cooldown/restart/duplicate boundaries, mode-aware HUD, custom isolation and moving-endpoint regression. An optional previous `game.js` path adds a real previous-world migration test.

Run `node dev/district-check.cjs`, `node dev/tactical-instinct-check.cjs`, the existing game suite and profile/tournament checks. Native and installed-release evidence is recorded separately in `dev/VALIDATION-1.9.0.md` after verification. A cooldown snapshot is small additive world data; no database schema or user-data reset is required.
