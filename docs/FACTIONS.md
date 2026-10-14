# Factions

`server/factions.cjs` owns membership, invitations, applications, roles,
confirmation tokens, privacy, reports and verified activity. `faction-identity.js`
owns curated logo components and validation. `factions-ui.js` uses the existing
Phone, Friends, profile, party and account-cache interfaces.

Players belong to one faction at a time, with a maximum roster of 100. Owners
manage identity, admission policy and roles. Officers invite friends, review
applications and remove Members; they cannot manage Officers or Owners. Members
have normal membership. Owners transfer ownership or disband before leaving.

Names use 3–32 ASCII characters, start with a letter/number and contain at least
three letters/numbers; spaces, underscores and hyphens are permitted. Tags use
2–5 letters/numbers. Names normalize case and separators for uniqueness; tags
normalize to uppercase. Invisible, control and confusing Unicode characters are
rejected. Disbanding retains the final name/tag and historical identity rather
than reusing them for a new faction.

Admission is open, application-based or invitation-only. Invitations reuse
authenticated Friends and blocking. Blocking any faction member or the faction
itself prevents invitation bypass; players can disable faction invitations.
Declined invitations have a faction-wide cooldown. Reports preserve the actual
name/logo snapshot and enter a persisted review queue, without claiming automatic
moderation or sanctions.

Ownership transfer and disbanding require a short-lived confirmation bound to
the current Owner, faction version, action and transfer target. The UI asks for
the exact faction name; cancelling performs no transfer/disband. Stable request
IDs preserve one mutation after retry while replay responses show current
membership and permissions. A stale confirmation cannot transfer a different
faction or member.

Logos are eight-field JSON configurations, not uploaded images. Curated shapes,
symbols, accents, borders, patterns and color IDs produce 887,040 validated
combinations with at least 3:1 contrast. Rendering uses safe local SVG geometry,
without external URLs, user text, raw paths or image data. Profile, party and
leaderboard sizes share the same configuration.

Faction activity captures actual eligible authoritative player-match
contributions at completion, once per match/account. The player must already
belong to that faction at the completion timestamp. Custom, practice, replay,
debug, abandonment and unsupported temporary sessions do not contribute.
Official scheduled games use accepted server simulation results; client reports
cannot fabricate activity. Historical matches are not backfilled.

Leaderboard order is completed player-match contributions, then wins, kills and
damage. Five members completing one game contribute five player matches. SQL
aggregates retain departed members' contributions without moving them to a new
faction. Public rows are bounded; a faction's real position remains available
outside the displayed top 100. These totals award no XP, rating, credits,
mastery or gameplay advantage.

Schema 16 adds twelve social tables through the verified backup/migration path.
Accounts, saves, progression, careers, ownership and existing statistics remain
unchanged. Trusted older exports may omit only tables introduced after their
declared schema; current exports include Factions. Offline cache is scoped to the
authenticated account and remains read-only.
