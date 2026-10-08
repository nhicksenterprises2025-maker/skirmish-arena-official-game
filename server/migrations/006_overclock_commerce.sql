-- Additive account-linked commerce. No historical scan or initial grants.
-- Integer hundredths of AC are distinct from money cents in the pack catalog.
CREATE TABLE ac_wallets (
  user_id TEXT NOT NULL REFERENCES users(id),
  environment TEXT NOT NULL CHECK(environment IN ('production','sandbox','test')),
  balance_units INTEGER NOT NULL DEFAULT 0 CHECK(typeof(balance_units)='integer' AND balance_units BETWEEN 0 AND 9007199254740991),
  created_at INTEGER NOT NULL,
  initial_world_revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,environment)
);
CREATE TABLE ac_ledger (
  id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  delta_units INTEGER NOT NULL CHECK(typeof(delta_units)='integer' AND delta_units != 0 AND abs(delta_units)<=9007199254740991),
  source TEXT NOT NULL CHECK(source IN ('match-completion','cosmetic-purchase','payment','test-fixture')),
  source_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK(source!='test-fixture' OR environment='test'),
  PRIMARY KEY(user_id,environment,idempotency_key),
  FOREIGN KEY(user_id,environment) REFERENCES ac_wallets(user_id,environment)
);
CREATE TRIGGER ac_ledger_valid_balance BEFORE INSERT ON ac_ledger BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM ac_wallets WHERE user_id=NEW.user_id AND environment=NEW.environment AND balance_units+NEW.delta_units BETWEEN 0 AND 9007199254740991 AND typeof(balance_units+NEW.delta_units)='integer') THEN RAISE(ABORT,'Invalid AC balance') END;
END;
CREATE TRIGGER ac_ledger_apply_balance AFTER INSERT ON ac_ledger BEGIN
  UPDATE ac_wallets SET balance_units=balance_units+NEW.delta_units,updated_at=NEW.created_at WHERE user_id=NEW.user_id AND environment=NEW.environment;
END;
CREATE TRIGGER ac_ledger_no_update BEFORE UPDATE ON ac_ledger BEGIN SELECT RAISE(ABORT,'AC ledger is immutable'); END;
CREATE TRIGGER ac_ledger_no_delete BEFORE DELETE ON ac_ledger BEGIN SELECT RAISE(ABORT,'AC ledger is immutable'); END;
CREATE TABLE cosmetic_orders (
  id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  request_id TEXT NOT NULL,
  cosmetic_id TEXT NOT NULL,
  price_units INTEGER NOT NULL CHECK(typeof(price_units)='integer' AND price_units>0),
  ledger_id TEXT NOT NULL UNIQUE REFERENCES ac_ledger(id),
  status TEXT NOT NULL CHECK(status='COMPLETED'),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,environment,request_id),
  UNIQUE(user_id,environment,cosmetic_id),
  FOREIGN KEY(user_id,environment) REFERENCES ac_wallets(user_id,environment)
);
CREATE TABLE cosmetic_entitlements (
  user_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  cosmetic_id TEXT NOT NULL,
  order_id TEXT NOT NULL UNIQUE REFERENCES cosmetic_orders(id),
  purchased_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,environment,cosmetic_id),
  FOREIGN KEY(user_id,environment) REFERENCES ac_wallets(user_id,environment)
);
CREATE TABLE cosmetic_equipment (
  user_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  cosmetic_id TEXT NOT NULL,
  style_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,environment,operator_id),
  FOREIGN KEY(user_id,environment,cosmetic_id) REFERENCES cosmetic_entitlements(user_id,environment,cosmetic_id)
);
CREATE TABLE ac_match_reports (
  user_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  match_id TEXT NOT NULL,
  reward_type TEXT NOT NULL CHECK(reward_type='match-completion'),
  units INTEGER NOT NULL CHECK(units IN (100,150)),
  status TEXT NOT NULL CHECK(status IN ('PENDING_VALIDATION','CREDITED')),
  receipt_json TEXT NOT NULL,
  world_revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,environment,match_id,reward_type),
  FOREIGN KEY(user_id,environment) REFERENCES ac_wallets(user_id,environment)
);
