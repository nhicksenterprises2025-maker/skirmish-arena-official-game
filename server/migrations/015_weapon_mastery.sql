-- Independent mastery ledger; no account, career, ranked or wallet replacement.
CREATE TABLE weapon_mastery_definitions(revision TEXT PRIMARY KEY,definition_json TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE weapon_mastery_events(user_id TEXT NOT NULL REFERENCES users(id),event_id TEXT NOT NULL,revision TEXT NOT NULL REFERENCES weapon_mastery_definitions(revision),event_json TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,event_id));
CREATE TABLE weapon_mastery_progress(user_id TEXT NOT NULL REFERENCES users(id),weapon TEXT NOT NULL,state_json TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,weapon));
CREATE TABLE weapon_mastery_rewards(id TEXT PRIMARY KEY,definition_json TEXT NOT NULL);
CREATE TABLE weapon_mastery_claims(user_id TEXT NOT NULL REFERENCES users(id),environment TEXT NOT NULL CHECK(environment IN ('production','sandbox','test')),reward_id TEXT NOT NULL,weapon TEXT NOT NULL,request_id TEXT NOT NULL,claimed_at INTEGER NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(user_id,environment,reward_id),UNIQUE(user_id,environment,request_id));
CREATE TABLE weapon_mastery_equipment(user_id TEXT NOT NULL,environment TEXT NOT NULL,type TEXT NOT NULL,reward_id TEXT NOT NULL,selection_json TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,environment,type),FOREIGN KEY(user_id,environment,reward_id) REFERENCES weapon_mastery_claims(user_id,environment,reward_id));
CREATE TRIGGER weapon_mastery_events_no_update BEFORE UPDATE ON weapon_mastery_events BEGIN SELECT RAISE(ABORT,'Mastery event is immutable'); END;
CREATE TRIGGER weapon_mastery_events_no_delete BEFORE DELETE ON weapon_mastery_events BEGIN SELECT RAISE(ABORT,'Mastery event is immutable'); END;
