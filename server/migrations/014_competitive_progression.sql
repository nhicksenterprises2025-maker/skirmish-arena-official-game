-- Additive competitive records; existing account/world ledgers remain intact.
CREATE TABLE ranked_season_definitions(id TEXT PRIMARY KEY,definition_json TEXT NOT NULL);
CREATE TABLE ranked_season_records(user_id TEXT NOT NULL REFERENCES users(id),season_id TEXT NOT NULL,record_json TEXT NOT NULL,finalized INTEGER NOT NULL DEFAULT 0 CHECK(finalized IN (0,1)),PRIMARY KEY(user_id,season_id));
CREATE TABLE ranked_reward_definitions(id TEXT PRIMARY KEY,definition_json TEXT NOT NULL);
CREATE TABLE ranked_reward_claims(user_id TEXT NOT NULL REFERENCES users(id),environment TEXT NOT NULL CHECK(environment IN ('production','sandbox','test')),reward_id TEXT NOT NULL REFERENCES ranked_reward_definitions(id),request_id TEXT NOT NULL,claimed_at INTEGER NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(user_id,environment,reward_id),UNIQUE(user_id,environment,request_id));
CREATE TABLE ranked_reward_equipment(user_id TEXT NOT NULL,environment TEXT NOT NULL,type TEXT NOT NULL,reward_id TEXT NOT NULL,selection_json TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,environment,type),FOREIGN KEY(user_id,environment,reward_id) REFERENCES ranked_reward_claims(user_id,environment,reward_id));
CREATE TABLE ac_ledger_new (
  id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  delta_units INTEGER NOT NULL CHECK(typeof(delta_units)='integer' AND delta_units != 0 AND abs(delta_units)<=9007199254740991),
  source TEXT NOT NULL CHECK(source IN ('match-completion','cosmetic-purchase','payment','test-fixture','ranked-reward')),
  source_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK(source!='test-fixture' OR environment='test'),
  PRIMARY KEY(user_id,environment,idempotency_key),
  FOREIGN KEY(user_id,environment) REFERENCES ac_wallets(user_id,environment)
);
INSERT INTO ac_ledger_new SELECT * FROM ac_ledger;
DROP TABLE ac_ledger;
ALTER TABLE ac_ledger_new RENAME TO ac_ledger;
CREATE TRIGGER ac_ledger_valid_balance BEFORE INSERT ON ac_ledger BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ac_wallets WHERE user_id=NEW.user_id AND environment=NEW.environment AND balance_units+NEW.delta_units BETWEEN 0 AND 9007199254740991 AND typeof(balance_units+NEW.delta_units)='integer') THEN RAISE(ABORT,'Invalid AC balance') END;
END;
CREATE TRIGGER ac_ledger_apply_balance AFTER INSERT ON ac_ledger BEGIN
  UPDATE ac_wallets SET balance_units=balance_units+NEW.delta_units,updated_at=NEW.created_at WHERE user_id=NEW.user_id AND environment=NEW.environment;
END;
CREATE TRIGGER ac_ledger_no_update BEFORE UPDATE ON ac_ledger BEGIN SELECT RAISE(ABORT,'AC ledger is immutable'); END;
CREATE TRIGGER ac_ledger_no_delete BEFORE DELETE ON ac_ledger BEGIN SELECT RAISE(ABORT,'AC ledger is immutable'); END;
