# ARENA REFINED follow-up

Baseline: released application 1.13.0, Weapon Balance 9.0. Continue from this checklist; the ten completed audits remain in `arena-refined-audit.md`.

- [x] One-release, recoverable tournament reset; preserve completed history and all shared progression.
- [x] Real-pool official/custom autofill, advance reservations, deadline replacements and restart-safe ownership.
- [x] Registry-based, bounded bot exploration from current TDM + Deathmatch samples; no balance changes.
- [x] Unique Combined participation view including official games, excluding custom/practice/test sessions.
- [x] Shared dark-green surfaces, controls, hierarchy and all ten page presentations.
- [x] Before/after captures and interactions at 1920×1080, 1720×1080, 1366×768 and 1024×768; Phone additionally checks narrow/short windows.
- [x] Targeted migrations, tournament fixtures, real simulation coverage, profile raw totals, preservation and performance checks.
- [ ] Accurate application Patch Notes and guide; existing signed installed-game delivery and verification.

Preserved rules: every-three-day Eastern/DST official anchor; 90-second check-in inside two-minute preparation; fixed 3/3/5 aggregate-kill games; damage tiebreak/exact-tie ruling; replacement owns the roster slot for the remainder of the event. No new balance release or telemetry reset. Application assets may refresh; user storage is never cleared.

## Implementation and evidence

- `server/migrations/011_tournament_reliability_reset.sql`, `server/tournament-reset.cjs`, `server/db.cjs`: verified original before schema11; once-only `arena-refined-followup-tournaments-v1` marker; completed events preserved exactly; accepted games/stats from unfinished official events retained in a read-only archive. Established per-account schedule anchors survive reset.
- `server/tournaments.cjs`, `tournament-{lifecycle,runtime,schedule,presentation}.cjs`, `server/index.cjs`: invitation acceptance remains meaningful for invitations; automatic roster filling uses actual eligible bots independently. Seated and standby reservations begin seven minutes before official entry. Custom events have the existing creator start time plus90-second check-in/120-second preparation; subsequent queues follow accepted prior results. No new recurring custom timetable, network multiplayer or monetary policy.
- `cloud.js`, `tournaments-ui.js`, `game.js`: account-scoped tournament calendar/pending results/cyclic checkpoints archive and verify before retirement. Failure preserves originals and blocks stale tournament recovery while ordinary cached play continues. Reserved background participants finish real games and cooldowns; new allocation excludes them. Permitted TDM overtime remains intact; genuine late resource conflicts are visible.
- `game.js`: all registry weapons retain playstyle/meta/familiarity fit; exposure uses bot TDM+DM samples. Under-sampled boosts fade with actual exposure and cap at5×/3.5×/2.25× for Discovery/Developing/Stable. Real four-cycle test completed16 games: all15 weapons fired, hit and recorded resolved damage/ranges/equipped time, minimum374 shots, nonuniform primary exposure. A fresh-world baseline already sampled all15; repaired defects were stale role fit, deterministic coverage and missing Deathmatch/sidearm evidence.
- `profile-stats.js`, `server/profile-participations.cjs`, profile/cache hooks: Combined reads unique accepted official participation and reset archives alongside casual/Ranked records. Raw totals determine ratios; missing historical measurements remain identified. Source tournament careers, ordinary careers, rating, earnings and Weapon Meta remain separate.
- `theme.css`, `refined-ui.css`, scoped `skyline.css` / `skyline-tournaments.css`: shared dark-green tokens,150ms controls, visible focus, dark stages, selected/equipped states, compact tables and summaries, grouped profile statistics and expandable release categories. Existing pooled/culling model renderer retained. No new rendering loop. Narrow Phone heading overflow was reproduced and fixed.
- Installed contract: schema11 agrees across metadata, desktop preflight and native stage validation. New stylesheet is in static serving, service-worker essentials and desktop packaging; app cache revision is `arena-refined-3`.

Private evidence root: `C:/Users/Noah/OneDrive/Documents/ChatGPT/freeshui/arena-refined-followup/`. `before-after.html` links all ten screen pairs; `after/ui-results.json` records40 layouts. `ui-performance.json` records observed median opening247ms before /240ms after, including150ms settling time; CPU/cache conditions differ, so this is a responsiveness check, not an FPS speed claim.

Passed: full server155/155; client regressions; tournament66 groups including17 new reliability cases; reset client5 plus actual Edge2; Combined8 plus real Edge profile6; Phone7; independent UI interactions6 including23 finalized custom games/history; rotation13; scheduled-client7; input11; damage6; spread6; Balance9 exact11; units14/range6; retirement8; desktop startup5; native Rust14; updater lifecycle8; startup browser2.

Exact committed-baseline proof: all15 weapon constants, fingerprint `b-59670f2d`, and nine projectile/firing/damage/spread/reticle functions unchanged. No balance archive/reset introduced. Forty-/twenty-human tests are legitimate isolated database fixtures; real runtime checks use the existing one-human local-game architecture.

No unresolved rule decisions. Delivery remains pending the exact final-source signed package, recoverable owner backup, installed/owner startup checks and publication gate. A first staging snapshot missed a late tournament safety guard and was rejected by file parity; its candidate is not approved for delivery.

Final independent review: legacy `!important` keybinding styles caused2.10:1 text contrast; scoped button styles and the existing capture-state class now give13px default/hover text at12.54:1 and capture feedback at least6.07:1. Real Edge verified capture, Escape cancellation and binding persistence at all four widths; Settings after captures were refreshed. Input11 re-passed after the presentation-only class change. Source and final package must include these corrections.
