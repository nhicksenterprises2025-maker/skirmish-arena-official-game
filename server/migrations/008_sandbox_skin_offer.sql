-- Rebuild only commerce records to add direct cosmetic delivery. The migration
-- runner performs this atomic swap with foreign keys disabled for this one
-- connection, then requires a clean foreign_key_check before committing.
-- Existing credits, orders, ownership and equipped styles are copied unchanged.
CREATE TABLE ac_payment_orders_v8 (
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
 credit_units INTEGER NOT NULL CHECK(typeof(credit_units)='integer' AND credit_units>=0),
 currency TEXT NOT NULL CHECK(currency='usd'),
 tax_behavior TEXT NOT NULL,
 idempotency_key TEXT NOT NULL UNIQUE,
 checkout_params_json TEXT NOT NULL,
 delivery_kind TEXT NOT NULL CHECK(delivery_kind IN ('credits','cosmetic')),
 cosmetic_id TEXT,
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
 CHECK((delivery_kind='credits' AND credit_units>0 AND cosmetic_id IS NULL) OR (delivery_kind='cosmetic' AND credit_units=0 AND cosmetic_id IS NOT NULL AND ledger_id IS NULL)),
 UNIQUE(user_id,environment,request_id),
 UNIQUE(environment,stripe_account_id,session_id),
 UNIQUE(environment,stripe_account_id,payment_id),
 FOREIGN KEY(user_id,environment) REFERENCES ac_wallets(user_id,environment)
);
INSERT INTO ac_payment_orders_v8 SELECT id,user_id,environment,stripe_account_id,request_id,pack_id,catalog_version,price_id,product_id,money_cents,credit_units,currency,tax_behavior,idempotency_key,checkout_params_json,'credits',NULL,status,session_id,checkout_url,payment_id,charge_id,ledger_id,error_code,created_at,updated_at,fulfilled_at FROM ac_payment_orders;
DROP TABLE ac_payment_orders;
ALTER TABLE ac_payment_orders_v8 RENAME TO ac_payment_orders;
CREATE INDEX ac_payment_orders_user ON ac_payment_orders(user_id,environment,created_at DESC);
CREATE INDEX ac_payment_cosmetic_pending ON ac_payment_orders(user_id,environment,cosmetic_id,status);
CREATE TRIGGER ac_payment_order_snapshot BEFORE UPDATE ON ac_payment_orders WHEN
 NEW.id!=OLD.id OR NEW.user_id!=OLD.user_id OR NEW.environment!=OLD.environment OR
 NEW.stripe_account_id!=OLD.stripe_account_id OR NEW.request_id!=OLD.request_id OR
 NEW.pack_id!=OLD.pack_id OR NEW.catalog_version!=OLD.catalog_version OR NEW.price_id!=OLD.price_id OR
 NEW.product_id!=OLD.product_id OR NEW.money_cents!=OLD.money_cents OR NEW.credit_units!=OLD.credit_units OR
 NEW.currency!=OLD.currency OR NEW.tax_behavior!=OLD.tax_behavior OR NEW.idempotency_key!=OLD.idempotency_key OR NEW.checkout_params_json!=OLD.checkout_params_json OR NEW.created_at!=OLD.created_at OR
 NEW.delivery_kind!=OLD.delivery_kind OR NEW.cosmetic_id IS NOT OLD.cosmetic_id
 BEGIN SELECT RAISE(ABORT,'Payment snapshot is immutable'); END;
CREATE TABLE cosmetic_entitlements_v8 (
 user_id TEXT NOT NULL,
 environment TEXT NOT NULL,
 cosmetic_id TEXT NOT NULL,
 order_id TEXT UNIQUE REFERENCES cosmetic_orders(id),
 purchased_at INTEGER NOT NULL,
 payment_order_id TEXT UNIQUE REFERENCES ac_payment_orders(id),
 CHECK((order_id IS NOT NULL AND payment_order_id IS NULL) OR (order_id IS NULL AND payment_order_id IS NOT NULL)),
 PRIMARY KEY(user_id,environment,cosmetic_id),
 FOREIGN KEY(user_id,environment) REFERENCES ac_wallets(user_id,environment)
);
INSERT INTO cosmetic_entitlements_v8(user_id,environment,cosmetic_id,order_id,purchased_at) SELECT user_id,environment,cosmetic_id,order_id,purchased_at FROM cosmetic_entitlements;
DROP TABLE cosmetic_entitlements;
ALTER TABLE cosmetic_entitlements_v8 RENAME TO cosmetic_entitlements;
