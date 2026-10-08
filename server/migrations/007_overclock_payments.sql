-- Sandbox checkout is additive; worlds, progression and existing ledger remain untouched.
CREATE TABLE ac_payment_orders (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 environment TEXT NOT NULL CHECK(environment='sandbox'),
 stripe_account_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 pack_id TEXT NOT NULL,
 catalog_version TEXT NOT NULL,
 price_id TEXT NOT NULL,
 product_id TEXT NOT NULL,
 money_cents INTEGER NOT NULL CHECK(typeof(money_cents)='integer' AND money_cents>0),
 credit_units INTEGER NOT NULL CHECK(typeof(credit_units)='integer' AND credit_units>0),
 currency TEXT NOT NULL CHECK(currency='usd'),
 tax_behavior TEXT NOT NULL,
 idempotency_key TEXT NOT NULL UNIQUE,
 checkout_params_json TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','fulfilled','expired','failed','review_required')),
 session_id TEXT,
 checkout_url TEXT,
 payment_id TEXT,
 charge_id TEXT,
 ledger_id TEXT UNIQUE REFERENCES ac_ledger(id),
 error_code TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 fulfilled_at INTEGER,
 UNIQUE(user_id,environment,request_id),
 UNIQUE(environment,stripe_account_id,session_id),
 UNIQUE(environment,stripe_account_id,payment_id),
 FOREIGN KEY(user_id,environment) REFERENCES ac_wallets(user_id,environment)
);
CREATE INDEX ac_payment_orders_user ON ac_payment_orders(user_id,environment,created_at DESC);
CREATE TRIGGER ac_payment_order_snapshot BEFORE UPDATE ON ac_payment_orders WHEN
 NEW.id!=OLD.id OR NEW.user_id!=OLD.user_id OR NEW.environment!=OLD.environment OR
 NEW.stripe_account_id!=OLD.stripe_account_id OR NEW.request_id!=OLD.request_id OR
 NEW.pack_id!=OLD.pack_id OR NEW.catalog_version!=OLD.catalog_version OR NEW.price_id!=OLD.price_id OR
 NEW.product_id!=OLD.product_id OR NEW.money_cents!=OLD.money_cents OR NEW.credit_units!=OLD.credit_units OR
 NEW.currency!=OLD.currency OR NEW.tax_behavior!=OLD.tax_behavior OR NEW.idempotency_key!=OLD.idempotency_key OR NEW.checkout_params_json!=OLD.checkout_params_json OR NEW.created_at!=OLD.created_at
 BEGIN SELECT RAISE(ABORT,'Payment snapshot is immutable'); END;
CREATE TABLE ac_payment_events (
 environment TEXT NOT NULL CHECK(environment='sandbox'),
 stripe_account_id TEXT NOT NULL,
 event_id TEXT NOT NULL,
 event_type TEXT NOT NULL,
 object_id TEXT,
 order_id TEXT REFERENCES ac_payment_orders(id),
 outcome TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(environment,stripe_account_id,event_id)
);
CREATE TABLE ac_payment_reviews (
 environment TEXT NOT NULL CHECK(environment='sandbox'),
 stripe_account_id TEXT NOT NULL,
 event_id TEXT NOT NULL,
 order_id TEXT REFERENCES ac_payment_orders(id),
 payment_id TEXT,
 charge_id TEXT,
 object_id TEXT,
 reason TEXT NOT NULL,
 amount_cents INTEGER,
 currency TEXT,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(environment,stripe_account_id,event_id)
);
