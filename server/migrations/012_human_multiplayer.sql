-- Human networking has its own records. Existing accounts, careers, dialogue
-- archives and world saves are deliberately left intact.
CREATE TABLE mp_friend_requests (
 id TEXT PRIMARY KEY, sender_id TEXT NOT NULL REFERENCES users(id),
 recipient_id TEXT NOT NULL REFERENCES users(id), state TEXT NOT NULL,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 CHECK(sender_id<>recipient_id)
);
CREATE UNIQUE INDEX mp_pending_friend_pair ON mp_friend_requests(sender_id,recipient_id) WHERE state='pending';
CREATE TABLE mp_friends (
 user_id TEXT NOT NULL REFERENCES users(id), friend_id TEXT NOT NULL REFERENCES users(id),
 created_at INTEGER NOT NULL, PRIMARY KEY(user_id,friend_id), CHECK(user_id<>friend_id)
);
CREATE TABLE mp_blocks (
 user_id TEXT NOT NULL REFERENCES users(id), blocked_id TEXT NOT NULL REFERENCES users(id),
 created_at INTEGER NOT NULL, PRIMARY KEY(user_id,blocked_id), CHECK(user_id<>blocked_id)
);
CREATE TABLE mp_privacy (
 user_id TEXT PRIMARY KEY REFERENCES users(id), show_online INTEGER NOT NULL DEFAULT 1,
 show_activity INTEGER NOT NULL DEFAULT 1, allow_friend_requests INTEGER NOT NULL DEFAULT 1,
 party_join TEXT NOT NULL DEFAULT 'invite', updated_at INTEGER NOT NULL
);
CREATE TABLE mp_presence (
 user_id TEXT PRIMARY KEY REFERENCES users(id), connection_id TEXT NOT NULL,
 activity TEXT NOT NULL DEFAULT 'Lobby', connected INTEGER NOT NULL DEFAULT 1,
 last_seen_at INTEGER NOT NULL
);
CREATE TABLE mp_parties (
 id TEXT PRIMARY KEY, leader_id TEXT NOT NULL REFERENCES users(id),
 mode TEXT NOT NULL DEFAULT 'casual-tdm', queue_status TEXT NOT NULL DEFAULT 'idle',
 match_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE mp_party_members (
 party_id TEXT NOT NULL REFERENCES mp_parties(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL UNIQUE REFERENCES users(id), ready INTEGER NOT NULL DEFAULT 0,
 joined_at INTEGER NOT NULL, PRIMARY KEY(party_id,user_id)
);
CREATE TABLE mp_party_invites (
 id TEXT PRIMARY KEY, party_id TEXT NOT NULL REFERENCES mp_parties(id) ON DELETE CASCADE,
 sender_id TEXT NOT NULL REFERENCES users(id), recipient_id TEXT NOT NULL REFERENCES users(id),
 state TEXT NOT NULL DEFAULT 'pending', expires_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX mp_pending_party_invite ON mp_party_invites(party_id,recipient_id) WHERE state='pending';
CREATE TABLE mp_matches (
 id TEXT PRIMARY KEY, mode TEXT NOT NULL, status TEXT NOT NULL,
 state_json TEXT NOT NULL, result_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE mp_participations (
 match_id TEXT NOT NULL REFERENCES mp_matches(id), user_id TEXT NOT NULL REFERENCES users(id),
 team INTEGER, state_json TEXT NOT NULL, PRIMARY KEY(match_id,user_id)
);
CREATE INDEX mp_participations_user ON mp_participations(user_id,match_id);
CREATE TABLE mp_results (
 match_id TEXT NOT NULL REFERENCES mp_matches(id), user_id TEXT NOT NULL REFERENCES users(id),
 result_json TEXT NOT NULL, applied_at INTEGER NOT NULL, PRIMARY KEY(match_id,user_id)
);
CREATE TABLE mp_progression_baselines (
 user_id TEXT PRIMARY KEY REFERENCES users(id), baseline_json TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE mp_queue_entries (
 id TEXT PRIMARY KEY, state_json TEXT NOT NULL,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE mp_chat (
 id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL,
 scope_id TEXT NOT NULL, team INTEGER, sender_id TEXT NOT NULL REFERENCES users(id),
 body TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX mp_chat_room ON mp_chat(scope_id,id);
CREATE INDEX mp_chat_sender_time ON mp_chat(sender_id,created_at);
CREATE TABLE mp_chat_mutes (
 user_id TEXT NOT NULL REFERENCES users(id), muted_id TEXT NOT NULL REFERENCES users(id),
 scope TEXT NOT NULL DEFAULT 'all', muted INTEGER NOT NULL DEFAULT 1,
 volume REAL NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,muted_id,scope)
);
CREATE TABLE mp_reports (
 id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL REFERENCES users(id),
 reported_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL,
 chat_id INTEGER REFERENCES mp_chat(id), created_at INTEGER NOT NULL
);
CREATE TABLE cloud_bootstrap_receipts (
 id TEXT PRIMARY KEY, sha256 TEXT NOT NULL UNIQUE,
 source_schema INTEGER NOT NULL, row_counts_json TEXT NOT NULL,
 omissions_json TEXT NOT NULL, imported_at INTEGER NOT NULL
);
