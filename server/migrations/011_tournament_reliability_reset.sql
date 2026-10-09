-- Persist the schedule lineage independently of disposable tournament instances.
CREATE TABLE tournament_schedule_anchors (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 anchor_json TEXT NOT NULL,
 policy_json TEXT NOT NULL,
 configured_at INTEGER NOT NULL
);
CREATE TABLE tournament_state_resets (
 reset_id TEXT PRIMARY KEY,
 performed_at INTEGER NOT NULL,
 recovery_file TEXT,
 summary_json TEXT NOT NULL
);
-- Legitimate accepted results from an unfinished official event remain readable
-- history. This archive never allocates participants, advances games or rewards.
CREATE TABLE tournament_reset_archives (
 reset_id TEXT NOT NULL REFERENCES tournament_state_resets(reset_id),
 tournament_id TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 snapshot_json TEXT NOT NULL,
 archived_at INTEGER NOT NULL,
 PRIMARY KEY(reset_id,tournament_id)
);
