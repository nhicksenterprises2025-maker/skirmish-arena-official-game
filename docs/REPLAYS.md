# Match replays

Maintenance route: `server/replays.cjs`, authoritative multiplayer/tournament capture, `replay-playback.js`, `replays-ui.js` and `replays-ui.css`. Application, balance, ruleset and replay schema are separate identifiers.

## Capture and historical behavior

Only trusted completed eligible matches produce recordings. Capture samples authoritative presentation state at 10 Hz, adds exact major-event frames, stores compact deltas with periodic keyframes, and records combat, score and objective events. The browser lazily reconstructs short segments rather than expanding the complete match. Playback does not execute the current simulation or calculate damage again. Each record preserves match identity, participants, operator/loadout identity, result, timing, map geometry and original weapon/ruleset metadata. Historical matches without sufficient recorded data are unavailable rather than reconstructed from current balance.

## Isolation

Playback supplies an isolated recorded-state provider to the existing 2.5D spectator renderer. It cannot call match finalization, reward or career routines. It does not submit movement/fire input. Entering a live human match takes priority over replay viewing. Account changes close playback and discard its private library state.

## Storage and compatibility

Compressed replay files live in a game-owned replay directory separate from accounts and world saves. Active capture appends bounded gzip journal members containing new frames/events only; it does not recompress the whole match at each checkpoint. Each journal write is synchronized before committing the paired simulation checkpoint. Restart reads committed bytes, discards uncommitted tails, trims any future branch and rebases before further appends. Finalization renames the synchronized recording and commits its immutable metadata once. SQLite stores searchable metadata, authenticated access, retention settings and warnings. Cleanup targets replay files only, oldest non-favorites first. Favorite recordings are never automatically removed. Defaults: 50 recordings per account; configurable 5–50 count and 16–256 MiB library budget. Physical service storage is capped at 256 MiB, 1,000 completed recordings and 64 in-progress captures. Each compressed file is at most 16 MiB, expanded stored data at most 64 MiB, with 512 MiB free disk reserved. Temporary and in-progress files count toward physical limits. Kept recordings can prevent new recording when capacity fills. If sufficient space cannot be made available, capture is skipped and a clear warning is retained. Optional recording failure must not reject legitimate match results.

Replay schema validation rejects unsupported data before playback. Changing weapon balance does not invalidate stored resolved outcomes. Missing or corrupt recordings show unavailable states; deletion cannot remove another account's saves, profiles, settings or screenshots.

## Verification

See `docs/release-completion.md` for executed tests and remaining delivery limitations. Trusted account migration keeps replay files and metadata in the original local installation, explicitly documenting their omission from the cloud bootstrap; no account history is omitted. Browser and native fixtures use isolated accounts/storage. Owner installation and public deployment remain deferred.
