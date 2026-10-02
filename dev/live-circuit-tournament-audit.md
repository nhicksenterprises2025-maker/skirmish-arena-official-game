# LIVE CIRCUIT tournament audit and verification contract

This audit reads only the current tournament routes, their persistence schema,
message integration, and directly relevant test harnesses. Production saves and
databases are not used by the verification suite.

## Existing implementation

- `server/migrations/002_social.sql` already owns `tournaments` and
  `tournament_participants`. Tournaments are per-account event records with
  bracket/metadata JSON. Participants currently store bot IDs, seeds, and states.
- `server/index.cjs` exposes the per-account event list and an administrator-only
  transactional creation endpoint. It rejects repeated/unknown bot IDs and can
  emit winner/elimination events from explicitly supplied completed results.
- `server/messages.cjs` deduplicates tournament announcements and invitations by
  stable structured-event IDs.
- `cloud.js` renders the event board; the existing game menu delegates to it.
- `server/tests/platform.test.cjs` checks account boundaries, administrator
  authorization, duplicate rejection, and transactional rollback. There are no
  current automatic scheduling, championship-series, placement, or earnings
  tests.

The current records should be extended. A second unrelated event store is not
needed. Architecture, production implementation, and migrations belong to the
main agent.

## Required observable behavior

- Official events repeat every 72 real-world hours, using authoritative season
  timestamps. The agreed schedule is `seasonStart + n * 72h`, starting at `n=1`,
  with starts strictly before `seasonEnd`.
- Each valid field contains eight teams of five distinct participants: 40
  participants overall. Users and bots are eligible; bots make state/personality
  decisions rather than pure random decisions, and cannot occupy two teams.
- The championship contains four quarterfinal BO3 series, two semifinal BO3
  series, and one final BO5 series. Matches retain existing 5v5 TDM rules.
- Final placements are unique 1–8. Eliminated teams in the same round compare
  tournament series/game differential, kill differential, damage differential,
  then initial seed. No additional placement matches are required.
- Official payouts are per participant: 1st 50,000; 2nd 35,000; 3rd 20,000;
  4th 12,500; 5th 7,500; 6th 5,000; 7th 2,500; 8th 1,000. Every member of the
  first-place team receives 50,000. All eight complete five-person teams receive
  667,500 in total. User and bot fictional earnings persist separately.
- Custom tournaments use the same bracket engine, award zero earnings, and can
  keep their own results/history.
- Tournament performance never changes standard player/bot careers, standard
  player or bot season combat totals, normal weapon telemetry, Weapon Meta, or
  Gun Score. Tournament statistics/history/placements remain separate.
- Event scheduling, registration, bracket progression, results, and earnings
  survive restart. Replayed schedule/finalization operations cannot create
  duplicate events, placements, or payments.
- Calendar dates display in the player's local timezone while stored timestamps
  remain authoritative. Messages reference only actual invitations, decisions,
  bracket changes, eliminations, finalists, and placements.

## Focused test matrix

1. Use isolated temporary SQLite storage and a fixed season clock. Assert 72h
   spacing, exact boundary exclusion, deterministic schedule identifiers, repeat
   calls, close/reopen behavior, and no dependency on a continuously open client.
2. Register eight five-person teams including a user. Reject malformed sizes,
   repeated participants, and double booking without partially committed teams.
   Exercise eligible bot acceptance and decline from supplied personality/state.
3. Advance actual recorded game outcomes through 4/2/1 series. Assert BO3/BO5
   clinch thresholds, winner advancement, and no games accepted after a clinch.
4. Use controlled authoritative result fixtures to distinguish each tiebreaker;
   assert stable unique placements 1–8 without extra matches.
5. Verify all 40 individual official credits against the exact placement table,
   user/bot separation, the 667,500 aggregate, and replay/restart idempotency.
6. Run the same complete bracket as custom: all credits remain zero and its
   history still persists.
7. Snapshot standard SQL and game-engine career/profile/meta/season records.
   Exercise tournament combat and finalization; assert byte-equivalent standard
   records and unchanged Gun Score/balance constants. Standard eligible match
   commits remain covered by the main agent's profile tests.
8. Check tournament invitation/result events are deduplicated and refer only to
   results committed by the shared tournament engine.

## Verified production API

The main agent implemented `server/tournaments.cjs` and additive schema 4. The
suite exercises its agreed `scheduleOfficial`, `createCustom`, `getTournament`,
`registerTeam`, `inviteBot`, `startTournament`, `recordGame`, and
`rankPlacements` exports. Human participant IDs use the existing raw user ID;
bot IDs retain their existing stable IDs.

`node dev/live-circuit-tournament-check.cjs` passes all six focused groups. Its
result artifact records the tested module hash. It verifies normalized SQLite
credits, separate user/bot kinds, repeat-result/event deduplication, original and
next-season scheduling, draft/duplicate registration, persistent invitation
decisions, complete official/custom brackets, all four placement tie layers,
and restart persistence. Tournament fixtures resolve 46 games through the
production finalization API and replay acknowledgments without recounting.

The suite compares complete standard world/profile/career/meta/season SQL rows
before and after tournament writes, along with unchanged weapon definitions and
Gun Score. Actual game-engine combat routing and calendar/Phone UI integration
remain part of the main agent's integration verification; these isolated server
fixtures do not claim to validate those client paths.
