-- Extend the established tournament event records; never replace world/career data.
ALTER TABLE tournaments ADD COLUMN kind TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE tournaments ADD COLUMN season_id TEXT;
CREATE UNIQUE INDEX official_tournament_schedule ON tournaments(user_id,season_id,starts_at) WHERE kind='official';
CREATE TABLE tournament_teams (
 id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL REFERENCES tournaments(id),
 name TEXT NOT NULL, seed INTEGER NOT NULL, UNIQUE(tournament_id,seed)
);
CREATE TABLE tournament_registrations (
 tournament_id TEXT NOT NULL REFERENCES tournaments(id), team_id TEXT NOT NULL REFERENCES tournament_teams(id),
 participant_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('user','bot')),
 PRIMARY KEY(tournament_id,participant_id)
);
CREATE TABLE tournament_series (
 id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL REFERENCES tournaments(id),
 round TEXT NOT NULL, best_of INTEGER NOT NULL, state_json TEXT NOT NULL
);
CREATE TABLE tournament_matches (
 id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL REFERENCES tournaments(id), series_id TEXT NOT NULL REFERENCES tournament_series(id),
 result_json TEXT NOT NULL, completed_at INTEGER NOT NULL
);
CREATE TABLE tournament_stats (
 tournament_id TEXT NOT NULL REFERENCES tournaments(id), participant_id TEXT NOT NULL, stats_json TEXT NOT NULL,
 PRIMARY KEY(tournament_id,participant_id)
);
CREATE TABLE tournament_placements (
 tournament_id TEXT NOT NULL REFERENCES tournaments(id), team_id TEXT NOT NULL REFERENCES tournament_teams(id), placement INTEGER NOT NULL,
 PRIMARY KEY(tournament_id,team_id), UNIQUE(tournament_id,placement)
);
CREATE TABLE tournament_earnings (
 tournament_id TEXT NOT NULL REFERENCES tournaments(id), participant_id TEXT NOT NULL, kind TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount>=0), credited_at INTEGER NOT NULL,
 PRIMARY KEY(tournament_id,participant_id)
);
CREATE TABLE tournament_invites (
 tournament_id TEXT NOT NULL REFERENCES tournaments(id), team_id TEXT NOT NULL REFERENCES tournament_teams(id), bot_id TEXT NOT NULL,
 state TEXT NOT NULL, reason TEXT NOT NULL, decided_at INTEGER NOT NULL,
 PRIMARY KEY(tournament_id,team_id,bot_id)
);
