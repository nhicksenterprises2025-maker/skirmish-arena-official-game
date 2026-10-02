# Game engine verification for 1.5.0

These checks execute the shipped `game.js` combat and AI functions. The harness
stubs DOM and canvas drawing so simulation checks can run in Node. The player
report assertions read the HTML produced by the actual results function. GPU
rendering, browser layout, accounts, server persistence, launcher signing and
message endpoint checks require their separate browser/server/launcher tests.

## Completed game checks

Run from the release directory:

```powershell
node dev/mechanics.cjs
node dev/district-check.cjs
node dev/meta-check.cjs
node dev/platform-game-check.cjs
node dev/p90-range-check.cjs
node dev/player-match.cjs
```

All of these passed after the final P90 approach/dash correction.

- `mechanics.cjs`: all eleven complete weapon definitions match the preceding
  balance; walls block perception; remembered targets retain last-seen positions;
  reaction delays, healing, dash cooldowns, trigger-pull accuracy, actual HP
  removed, held-weapon deaths, final-hit kill range and skill-adjusted scoring
  retain their established behavior.
- `district-check.cjs`: twelve buildings have 24 clear exits; 6,195 walkable
  navigation cells connect; 72 actual building-exit routes plus regression routes
  recover without crossing geometry. Camera conversion remains reversible at
  four viewport sizes. An actual 1.3.0 schema-15 world migrates to schema 17 with
  its original identities, Power, personalities, careers, Form, familiarity,
  seasons, weapon history, local accounts and settings retained.
- `meta-check.cjs`: exactly 200 HP counts as a solo kill; 199.999 does not.
  Exactly 100 HP counts as a finisher; 100.001 does not. The ledger records actual
  damage after overkill clamping, resets at spawn and counts the finishing
  weapon. Engagement range comes only from a real trigger pull aimed toward a
  visible enemy; kill range remains a separate final-hit observation. Missing
  historical counters remain zero/unmeasured. Patch changes archive new counters
  without changing lifetime careers. Primary and sidearm usage each sum to one;
  primary performance cannot alter sidearm score/confidence/usage. The tabs
  contain nine primaries and the two sidearms respectively.
- `platform-game-check.cjs`: during the player countdown all ten participants,
  firing and the player-match clock remain frozen while the other three games
  advance. FIGHT starts the full clock. Leaving the countdown restores the
  50-bot roster without completing a human game. Real player combat counters
  reconcile with both weapon totals and season totals; dead playtime is distinct
  from equipped/alive time. Per-weapon games, best games, win streaks, season
  archives, reloads and round restarts preserve their counters. Results display
  ten actual scoreboard rows, accuracy, headshots and the most-used weapon.
  Reading a 2.5D render snapshot does not advance or change the simulation.
- `player-match.cjs`: a natural stationary-human match completed through real
  combat in 7,633 physics ticks, then returned all 50 bots to rotation. Four
  matches completed during that run; all 40 participant records and 360 completed
  kills/deaths/score events reconciled.

The `*-results.json` files contain the corresponding outcomes. New tests record
their source hash so later UI/build changes cannot be mistaken for the exact
source tested at that time.

## Live simulation and P90 evidence

Two separate 100-match runs passed before the final P90 range-goal correction.
The first observed 5,689.3 simulated seconds, 9,048 live kills and
2,482,873.7608 actual damage. The second observed 5,721.5 seconds, 9,132 live
kills and 2,502,897.9229 actual damage, including the new range/classification
invariants. Live totals include the four games still in progress. Completed
match scores and participant totals are checked separately.

Both runs used source hash
`c53fe22012e4fd523dbc0b6407dd3f3724ef9e2a6805424f178a24cadc3915d1`.
The final P90 correction subsequently received focused decision/fire-gate checks
and a fresh 600-second live simulation. A 100-match run of the final correction
is not claimed.

The final P90 tests verified:

- A target at three tiles causes the bot to open distance rather than push
  toward it.
- A target at ten tiles selects fighting; an approach from nineteen tiles stops
  at nine tiles.
- Chasing a weakened target from ten tiles retains a nine-tile stand-off.
- An attack dash is rejected if it would land below seven tiles; a dash from
  twelve tiles is allowed when it lands inside the designed range.
- Normal fire is allowed through sixteen tiles; holding/peeking may fire through
  eighteen tiles. Fire beyond eighteen tiles is rejected.

The fresh post-correction live sample contains 1,803 aimed visible-enemy P90
trigger pulls across 600 simulated seconds and eight completed matches:

| Observation | Recorded result |
| --- | ---: |
| Average engagement range | 9.1583 tiles |
| Average kill range | 6.8282 tiles |
| Shots within the ideal 7–12 tiles | 50.97% |
| Shots within the acceptable 5–16 tiles | 88.91% |
| Shots outside 5–16 tiles | 11.09% |
| Shots under four tiles | 6.16% |
| Shots over eighteen tiles | 0% |
| Maximum consecutive movement recoveries | 2 |
| Maximum stuck-detection delay | 1.2667 seconds |

Close emergency shots remain possible. These values describe observed combat;
they are not seeded desired outcomes and are not written into player telemetry.
The observer reads the existing event before the real counter records it.
`p90-range-results.json` captures the source hash and full distribution.

The inherited `simulation-results.json`, browser/PWA/pose/restore report files
from older builds are historical evidence. Use the explicit `1.5.0` simulation
reports and the newly generated game/Meta/P90 result files for this release.
