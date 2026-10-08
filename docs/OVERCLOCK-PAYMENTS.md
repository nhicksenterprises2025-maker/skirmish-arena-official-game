# OVERCLOCK payment integration

Application 1.12.1 / OVERCLOCK; Weapon Balance 8.0 and analytics schema 1 are unchanged. Payment code is Sandbox-only. Production checkout remains disabled even if a live key is supplied. This document does not authorize live activation.

## Verified access and catalog

On 7 October 2026 the official Stripe connection exposed **New business sandbox**, account `acct_1TGJWg1F1wnVf2XK`, `livemode: false`. Read-only API inventory returned zero Products and zero Prices, with no further pages. That inventory is historical. The owner subsequently approved the $0.50 Sandbox test offer; the six existing credit packs and the test cosmetic were provisioned and read back in the same connected Sandbox. No local Stripe CLI or runtime credentials are configured. The agent connection is a development tool; the game never calls MCP or Codex.

The existing Default payment configuration `pmc_1TGJXE1F1wnVf2XKwRoPplOK` enables multiple non-card methods. It has not been changed and is not an approved configuration for this integration. Sandbox checkout requires a verified card-only configuration; card wallets do not introduce a separate credit or deferred-payment product.

| Stable catalog key | Existing game ID | USD cents | AC | Product / Price |
| --- | --- | ---: | ---: | --- |
| ac_500 | ac-500 | 699 | 500 | `prod_VOgVOlMxOXg9UK` / `price_1UNt8m1F1wnVf2XKptCtoGVv` |
| ac_1000 | ac-1000 | 1099 | 1,000 | `prod_VOgVIk81fegbXO` / `price_1UNt8n1F1wnVf2XKB23WhYD0` |
| ac_1500 | ac-1500 | 1499 | 1,500 | `prod_VOgV15jkYZxs9w` / `price_1UNt8n1F1wnVf2XKpjcbKz8J` |
| ac_3000 | ac-3000 | 2499 | 3,000 | `prod_VOgVAYksioDagm` / `price_1UNt8o1F1wnVf2XKny0K999b` |
| ac_7500 | ac-7500 | 4999 | 7,500 | `prod_VOgVdZdZdWB1iY` / `price_1UNt8p1F1wnVf2XKKTiqxKsG` |
| ac_17500 | ac-17500 | 9999 | 17,500 | `prod_VOgVX6QJGbhWr0` / `price_1UNt8q1F1wnVf2XKQog0PHSq` |

Keep the Run 2 game IDs; underscore keys are aliases, not additional packs. One AC is 100 integer wallet units. Both Product and Price metadata must contain `game=skirmish-arena`, `environment=sandbox`, and the corresponding `catalog_key=ac_...`. Use one-time fixed USD Prices, quantity one. Catalog reconciliation must inspect existing Products/Prices before creating anything, refuse ambiguous or mismatched entries, and read back created objects. Never copy fixture IDs into deployment configuration. A stable lookup key such as `skirmish-arena:sandbox:ac_500:v1` supports repeatable reconciliation without changing an existing price.

The exact six proposed API payloads are in [overclock-sandbox-catalog-plan.json](overclock-sandbox-catalog-plan.json). They are a reviewable plan, not created Products/Prices. The plan was executed on 7 October 2026. Verified non-secret Product/Price bindings are in [overclock-sandbox-catalog-verified.json](overclock-sandbox-catalog-verified.json); reuse them on rerun. No payment or live-account write has been performed.

## Runtime and secret setup

Use the existing Node/account/SQLite service. The normal installed game starts a local PC service; no reliable public HTTPS payment host has been provisioned. Do not place a merchant secret in a distributed installer. A developer can supply Sandbox secrets to an isolated local test service using process environment or a server secret store. A deployed service must use its own secret storage.

Configuration names (values intentionally omitted):

An empty, disabled [server environment template](../server/.env.example) is provided for an isolated developer service. It is not auto-loaded or packaged; keep any completed copy outside the repository and release directory.

- `SAR_COMMERCE_ENV=sandbox`
- `SAR_STRIPE_SANDBOX_ENABLED=true`
- `SAR_STRIPE_ACCOUNT_ID`: confirmed Sandbox account ID.
- `SAR_STRIPE_SECRET_KEY`: restricted test runtime key; never paste it into chat. Grant only account/configuration/catalog reads, Checkout creation/read, and required payment/charge/refund/dispute reads. No product writes, payouts or refund creation are needed by the runtime.
- `SAR_STRIPE_WEBHOOK_SECRET`: the signing secret for this test endpoint, separate from the API key.
- `SAR_STRIPE_PRICE_MAP`: JSON mapping the six stable pack keys to verified Price IDs; use `creditPriceMap` from the verified catalog JSON.
- `SAR_STRIPE_TEST_SKIN_PRICE_ID`: optional approved $0.50 Polar Camo test price from `testSkinPriceId` in that JSON. This offer works independently of the six credit packs and grants the existing appearance directly with zero AC.
- `SAR_STRIPE_PAYMENT_METHOD_CONFIGURATION`: verified approved test configuration.
- `SAR_STRIPE_RETURN_ORIGIN`: trusted HTTPS origin, or loopback for isolated local tests.

The configuration must be complete and the actual Stripe account/catalog/configuration must pass validation before checkout becomes available. Do not log environment dumps, full SDK errors, request headers, card data or API response bodies. Public errors use bounded codes and generic recovery text. The public Shop must keep an honest unavailable state when validation or access is missing.

Run `node dev/overclock-payment-preflight.cjs` from a securely configured service environment. It checks provider identity, all six Prices/Products and approved methods using an in-memory database, and prints only a readiness result. It does not create catalog objects, payments, users or a saved world. Without configuration it reports `SANDBOX_DISABLED` and exits unsuccessfully, as intended.

The public raw-body endpoint is `POST /api/payments/stripe/webhook`. Register snapshot events using API version `2026-09-30.endive`: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, the applicable `charge.dispute.*` events, and `refund.created`, `refund.updated`, `refund.failed`. Local CLI forwarding requires separate owner-authorized CLI setup/login and its own signing secret. Do not use a Dashboard signing secret for CLI-forwarded events or acknowledge an undurable event.

## Fulfillment contract

Checkout is authenticated by the existing stable game account ID. Client input contains only pack ID and durable request ID. The server persists the order's environment, account, catalog/version, price, USD amount and AC quantity before requesting a hosted session. A stable order-derived Stripe idempotency key prevents a retried request from creating a second payment. Deliberately starting another purchase uses a new request ID.

Only the trusted hosted URL opens externally. Success/cancel return pages never grant credits. Signed raw webhook events and authenticated reconciliation retrieve the current Checkout Session, line items and payment, then use the same fulfillment path. Completed but unpaid sessions grant nothing. Immutable order snapshots determine delivered AC, not webhook metadata. Currency, quantity, price, amount, environment and account binding must all agree.

Order fulfillment, ledger insertion and handled-event recording commit together. Payment and order uniqueness protect against different events for the same purchase, concurrent delivery and restart. Refunds and disputes are recorded for review with order/payment linkage; this release does not issue refunds or invent a credit-reversal/skin-revocation policy. Sandbox orders, balances and ownership stay separate from production.

Existing cosmetic purchases use the Run 2 atomic debit/order/entitlement transaction. Existing match reports stay pending outside isolated test settlement: a client-reported XP receipt is not proof of active human participation. Do not describe the tested 1 AC standard / 1.5 AC Ranked formulas as activated spendable rewards.

## Test evidence and limits

Implementation and isolated fixture tests are recorded in [overclock-handoff.md](overclock-handoff.md). Fixture webhooks signed with a test-only secret exercise validation, but are not a real hosted purchase. A real integrated Sandbox payment remains unverified until the approved payment configuration, private runtime key and webhook delivery are configured. The account catalog now exists and has been verified. Decline/expiry/async/refund fixture results must be labeled as fixtures.

Keep test databases and native profiles separate from the owner's account. Never clear browser storage or copy a fixture wallet into production. Secret-free evidence belongs outside installer assets and includes the test environment, order/session/payment IDs when real, exact pack totals and resulting ledger entries.

## Live-readiness checklist — all gates remain closed

- Owner-approved production account/environment and separate explicit live collection approval.
- Reliably available public HTTPS webhook and authenticated hosted account service; no merchant secrets on customer PCs.
- Least-privilege runtime credentials, correct webhook secret/version, rotation and monitoring.
- Server-authoritative wallet, match results and active-participation validation; no client-issued spendable rewards.
- Written refund, dispute, partial refund and already-spent-credit/entitlement policy, with repeat-safe reversals.
- Provider review of the closed-loop cosmetic currency design, commercial identity, tax treatment and required disclosures/support terms.
- Verified production catalog, approved payment methods, amounts, currency and return URLs.
- Real end-to-end tests, restart/replay evidence, reconciliation/support runbook and owner sign-off.

No cash-out, transfers, wagering, deposits or tournament-prize conversion are added. Stripe's restricted-business rules discuss stored value and in-game currency and prohibit relevant prize-based gambling use cases. Operating this game's virtual world does not itself establish approval; obtain any required provider review before activation.

## Official references checked

- [Stripe Node 23.0.0 release](https://github.com/stripe/stripe-node/releases/tag/v23.0.0); pinned SDK API `2026-09-30.endive`, verified from the installed SDK.
- [Hosted Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted).
- [Raw webhook verification and local forwarding](https://docs.stripe.com/webhooks).
- [Restricted keys and Sandbox boundaries](https://docs.stripe.com/keys).
- [Payment method configurations](https://docs.stripe.com/payments/payment-method-configurations).
- [Sandbox test data](https://docs.stripe.com/testing).
- [Stripe agent plugin](https://docs.stripe.com/agents/plugin) and [official MCP](https://docs.stripe.com/mcp).
- [Restricted businesses](https://stripe.com/legal/restricted-businesses), checked for the live-readiness review; no legal/provider approval is claimed.

## 1.12.1 face / Store / Sandbox follow-up

Store lists only Containment, Aegis and Monarch for new AC purchases. All 35 definitions and existing entitlements remain intact; the other 32 products are retired from normal sale. Owned retired appearances stay visible and equip normally online or offline.

`skin-urban-polar-camo-test` is a Sandbox-only, one-time USD50-cent cosmetic offer (`skin_urban_polar_camo_test`). It grants `urban-assault.polar-camo` through the same verified payment flow. The six credit packs and optional skin validate independently. Schema8 preserves existing records and adds payment-backed ownership; no AC is credited or debited for the direct skin purchase. Pending requests share one order, fulfilled retries share one entitlement, and a new owned-item charge is rejected.

Stripe requires a minimum USD card charge of $0.50; the owner explicitly approved this instead of $0.01. No real funds are collected in Sandbox. No live activation, successful provider payment, or webhook delivery is claimed. The installed local backend still requires secure runtime setup; a development-tool Stripe connection cannot replace it.
