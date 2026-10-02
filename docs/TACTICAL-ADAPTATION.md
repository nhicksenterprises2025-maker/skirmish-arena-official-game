# Tactical Adaptation — 1.9.1

Bot-only maintenance release on the 1.9.0 Core Tuning baseline. Balance 8.0 / `b-b9bdf00b`, match rules, permanent profiles, player progression, graphics, audio and account architecture are unchanged.

`tactical-instinct.js` retains the existing utility module and custom execution presets. The new `tactical-adaptation-1` revision adds bounded route/doorway outcomes, personal confirmed-damage estimates, decaying observations, short-lived team intentions, actual active team Power, contextual finishes, successful-hold preference and action hysteresis. Observed teammate deaths can encourage a trade against an already visible opponent; they never supply the killer's hidden location. Existing pathfinding and obstacle steering remain byte-identical.

`game.js` connects those decisions to the existing navigation, reload, regen, dash and firing paths. Perception receives copies of uncertain team reports, never live hidden actor references. The old Power-dependent ±3% bot movement multiplier is removed; every Power uses configured `BOT_SPEED`. Custom execution changes timing and judgment, not weapons, speed, health, spread or permanent Power. Internal Rusher, Marksman, Flanker, Anchor and Flex identities are unchanged.

Meta weights use current balance/revision evidence and confidence, with discovery/developing/stable gravity, style/range fit, personality, familiarity, current-revision personal results and exploration. Usage affects coverage sampling only. A shared one-second meta cache and 450ms team assessment cache avoid repeated work. Existing staggered perception/decision timing is retained. The existing AI sample separation preserves earlier tactical samples and aggregate Balance 8 data; this is not a balance telemetry reset.

Owner debug retains the exact `noahhicks719` authorization and account-specific preference. It adds state, target, utility scores, intention, chase/last-known confidence, meta candidates and navigation goal. No account secrets are displayed.

Relevant verification: `dev/tactical-adaptation-check.cjs` (optional baseline directory includes migration and interleaved CPU comparison), `dev/tactical-lineup-check.cjs` (three Power bands, two weapons, swapped sides), `dev/tactical-instinct-check.cjs`, existing Core Tuning, navigation, P90, spread, meta, profile and tournament checks. P90's low-health fixture now explicitly represents personally confirmed damage. Runtime results, release hashes and screenshots are recorded in the task's `skirmish-tactical-adaptation` workspace.
