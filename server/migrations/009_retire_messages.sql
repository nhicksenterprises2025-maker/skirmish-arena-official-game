-- Audit 1 explicitly retires Messages and generation. The runner writes and
-- verifies a durable external archive before executing this migration.
CREATE TABLE retired_feature_archives (
 feature TEXT NOT NULL,
 schema_version INTEGER NOT NULL,
 archive_file TEXT NOT NULL,
 sha256 TEXT NOT NULL,
 bytes INTEGER NOT NULL,
 row_counts_json TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(feature,schema_version)
);
CREATE TABLE bot_competition_profiles (
 user_id TEXT NOT NULL,
 bot_id TEXT NOT NULL,
 competitiveness REAL NOT NULL,
 socialness REAL NOT NULL,
 ego REAL NOT NULL,
 player_respect REAL NOT NULL DEFAULT 50,
 player_trust REAL NOT NULL DEFAULT 50,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,bot_id),
 FOREIGN KEY(user_id,bot_id) REFERENCES bots(user_id,bot_id) ON DELETE CASCADE
);
INSERT INTO bot_competition_profiles(user_id,bot_id,competitiveness,socialness,ego,player_respect,player_trust,created_at)
 SELECT user_id,bot_id,
 CAST(COALESCE(json_extract(personality_json,'$.social.competitiveness'),json_extract(personality_json,'$.competitiveness'),0) AS REAL),
 CAST(COALESCE(json_extract(personality_json,'$.social.socialness'),json_extract(personality_json,'$.socialness'),0) AS REAL),
 CAST(COALESCE(json_extract(personality_json,'$.social.ego'),json_extract(personality_json,'$.ego'),0) AS REAL),
 player_respect,player_trust,created_at FROM bot_social_profiles;
DROP TABLE ai_training_feedback;
DROP TABLE ai_generations;
DROP TABLE ai_jobs;
DROP TABLE ai_preferences;
DROP TABLE conversation_summaries;
DROP TABLE messages;
DROP TABLE structured_events;
DROP TABLE bot_social_profiles;
