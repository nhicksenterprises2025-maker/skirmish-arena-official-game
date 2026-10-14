# Free hosting for Skirmish Arena

The deployment template runs the existing game server once, with durable SQLite storage and a Caddy HTTPS/WebSocket proxy. It has not been deployed. The launcher keeps its working local default until a real hosted installation passes verification.

## Host requirements and hostname

No free provider has yet been verified for this installation. A compatible host needs an always-running Node 24 process, WebSockets, durable writable SQLite storage and one authoritative simulation instance. An expiring trial, sleeping service, ephemeral filesystem or static-site host does not satisfy those requirements. Choose only a confirmed permanent free allowance; do not activate paid resources.

Oracle signup and paid or expiring trial hosting have been ruled out for this pass. The current server's measured peak is 406 MiB; this is a peak, not a measurement of its daily average.

This Compose template is for a self-managed VM or existing always-on server; it does not claim compatibility with a managed free platform. No VM, card verification, domain or paid service is created by these files. Use a real public DNS hostname that points to the server. The existing image has **not been built or load-tested on Arm**; verify it on the actual host before promising compatibility or capacity.

## Preferred candidate: Botkeep

[Botkeep's Free plan](https://botkeep.cloud/terms) is the preferred candidate for a disposable preflight, not a verified Skirmish deployment. Its current terms provide a shared account budget of 1 GB RAM, one vCore and 1 GB storage. Eligible Founder Free registrations have a larger ongoing allocation; the registration deadline does not expire an existing free entitlement. No card, recurring payment or scheduled expiry is required under the stated offer.

The [FAQ](https://botkeep.cloud/faq) describes authenticated deployment, no periodic renewal, no scheduled idle sleep and HTTPS Domains. The service is beta without an uptime SLA. **Node 24, WebSocket forwarding, the durable SQLite mount, actual restart survival and game load remain unverified.** Test those with disposable accounts and fixture data before any private account export, launcher switch or claim of compatibility. Keep the existing local installation intact.

## Storage preflight

Local isolated checks on October 13, 2026 restored the retained trusted export into schema 12 without transferring old redundant recovery snapshots. The original local database and private export were not modified. These measurements describe the current account, not an unlimited free-storage guarantee:

| Measurement | Bytes |
| --- | ---: |
| Freshly restored SQLite database, WAL checkpointed | 9,318,400 |
| Current account's world JSON | 4,580,952 |
| Sixty validated unchanged-world writes: database growth | 9,175,040 |
| One completed casual TDM match before terminal-cache retirement: VM checkpoint | 2,029,467 |
| That match's authoritative result JSON | 84,492 |

The sixty writes created two periodic full-world recovery snapshots; save data remained identical through closing and reopening the database. Existing bootstrap, authenticated login and server-restart checks passed 5/5. Source files tracked in Git total approximately 33.65 MiB, before Git history, installed dependencies, runtime, logs and provider filesystem overhead.

Current saves retain full recovery snapshots at every thirtieth base revision, completed TDM patch match, balance/season change and ranked migration. There is no automatic recovery-snapshot retention cap. Settled multiplayer VM payloads now retire after the existing ten-minute reconnect window, while full authoritative results, receipts, match configuration, participant kits and engine fingerprints remain. Live, cancelled and unpaid/incomplete-receipt checkpoints stay recoverable. Recovery snapshots and permanent match history still grow; a small initial import alone does not establish long-running suitability for a 1 or 2 GB disk. WAL and verified pre-schema backups also require temporary free space.

Before moving real accounts, measure the provider's actual free writable space, monitor usage and establish a recoverable storage policy. Preserve all account worlds, results, receipt identities, careers, balances and historical telemetry. Any recovery-snapshot archival must verify and retain an exact recoverable copy outside the constrained volume before reclaiming space; this guide does not authorize pruning. Terminal VM retirement is tested locally for its ten-minute boundary, restart/idempotence, settled reward replay, waiting-pool priority, bot projection and retained unpaid/cancelled state. Neither a recovery-snapshot archival policy nor remote disk persistence has been verified by these local measurements.

## Permanent free options checked

Official documentation checked on October 11, 2026. None has passed this game's deployment, save-preservation and real-time load checks.

| Provider | Free offer and current limitation |
| --- | --- |
| [Botkeep](https://botkeep.cloud/faq) | Preferred beta candidate. Public terms describe ongoing free resources and HTTPS routing without renewal or idle sleep. Runtime version, WSS and SQLite persistence still require an authenticated fixture deployment; no Skirmish server is claimed live. |
| [HelioHost Johnny](https://wiki.helionet.org/Johnny) | A genuinely free shared plan with [Node 24](https://wiki.helionet.org/Node.js), [SQLite files](https://wiki.helionet.org/SQLite) and SSL. Standard Passenger sleeps after five idle minutes; a [staff-supported game-daemon/Nginx route](https://helionet.org/index/topic/64864-solved-websockets-ports/) exists but has not been tested with Skirmish. [Daily sampled resource limits](https://wiki.helionet.org/Suspension_Policy) equate to roughly 142 MiB average RAM and 6.94% of one CPU core. Requires account login every 30 days. Conditional candidate only; runtime load, HTTPS/WSS and restart preservation remain unverified. |
| [KataBump](https://katabump.com/) | Advertises permanent free Node hosting. Its [FAQ](https://docs.katabump.com/faq) confirms no card requirement and SQLite support: 308 MB RAM, 716 MB storage and 25% CPU. Its memory cap is below this build's measured peak. Requires renewal every four days; files are permanently deleted one day after expiry. Not selected. |
| [Northflank](https://northflank.com/docs/v1/application/billing/pricing-on-northflank) | Free Sandbox compute remains awake, but requires a payment method. Its documentation advises against production use. [Persistent disks cost $0.15 per GB per month](https://northflank.com/pricing); a free SQLite-volume allowance has not been confirmed. The managed free addon does not replace this project's SQLite file. |
| [Google Cloud](https://docs.cloud.google.com/free/docs/free-cloud-features) | Ongoing eligible e2-micro compute and standard disk allowances are separate from the expiring trial. Requires active billing; [ordinary public IPv4 costs $0.005 per hour](https://cloud.google.com/vpc/network-pricing#ipaddress). Conditional free IPv6 access does not directly serve IPv4-only players. Game capacity on [0.25 sustained vCPU](https://docs.cloud.google.com/compute/docs/general-purpose-machines#e2_shared-core) remains unverified. |
| [Koyeb](https://www.koyeb.com/docs/reference/instances) / [Render](https://render.com/docs/free) | Free services sleep and do not support persistent service disks. Their free compute does not provide the durable storage required for this SQLite backend. |

Do not move real account data or switch the launcher to a candidate until its runtime, durable storage, public access and recurring cost are confirmed. No paid plan or provider signup is activated by this guide.

## VM preparation

Install Docker Engine and its Compose plugin using the [official instructions](https://docs.docker.com/engine/install/). Enable Docker to start on VM reboot. Permit inbound TCP ports 80 and 443 in the VM firewall and cloud network rules; restrict SSH to the administrator. Do not expose port 8803 or put an unconfigured CDN/proxy in front of Caddy.

Clone this repository on the VM. From its root:

```sh
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

Populate the four required values privately: `SAR_PUBLIC_HOST`, the existing roster owner's **account ID**, a random `SAR_CLOUD_BOOTSTRAP_TOKEN` of 32 or more characters, and `SAR_UPDATE_FEED_BASE` pointing to the existing public signed release directory. The host has no scheme, port or path. The server origin is derived as `https://` plus that hostname. Missing values fail Compose interpolation. Additional existing payment/admin configuration can be added to the VM's private `.env`; the fixed production, origin and authority settings in Compose take precedence. [Compose variable rules](https://docs.docker.com/reference/compose-file/interpolation/).

Validate without printing secrets, then start:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yaml build game
docker compose --env-file deploy/.env -f deploy/compose.yaml run --rm --no-deps proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d
docker compose --env-file deploy/.env -f deploy/compose.yaml ps
```

Caddy obtains public certificates when DNS and ports are correct; its certificate state has its own persistent volumes. It forwards the public Host and trusted HTTPS/IP headers and supports the existing WebSocket path. [Automatic HTTPS prerequisites](https://caddyserver.com/docs/automatic-https), [proxy behavior](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

## Bring the existing account safely

Before first public signup, use the existing [trusted export/import workflow](../server/DEPLOYMENT.md#database-operations-and-future-releases). Export the retained local database read-only with `tools/export-cloud-account.cjs`, writing the gzip package **outside this repository**. Its credential hashes and player data are private; keep the original local installation/database intact.

Send that package to HTTPS `POST /api/admin/cloud-bootstrap` as `application/gzip`, with the private token in the `Authorization: Bearer` header. Read the token from a protected local file/environment; never put it in shell history, a URL, Git, screenshots or an installer. The server requires an empty destination and stores a receipt; do not delete existing cloud accounts to force import. Pending bootstrap blocks signup. Strict trusted-history validation remains enabled for subsequent browser uploads.

Verify original credentials, account/world/XP, credits, ownership and tournament history at the new origin. Then set `SAR_CLOUD_BOOTSTRAP_TOKEN=disabled` and recreate the game service with the same `up -d` command. This short non-secret value deliberately fails the server's minimum token length of 32 characters; the stored receipt preserves completed bootstrap status.

## Before changing the launcher

Verify public `/api/status` and `/api/version`, secure login, two devices joining one match, reconnect/results/rewards exactly once, and correct original account data after a VM/container restart. Verify the existing signed update manifest and signature load unchanged. Configure/test STUN/TURN separately for opt-in voice; signaling alone does not prove WAN audio connectivity. Change the launcher origin only after these checks pass.

Keep **one** game container: active simulations and SQLite share one authoritative process. Named `skirmish-arena-data` survives container replacement. Back up privately using the existing SQLite backup procedure before upgrades; never use `down -v`, delete the volume, or copy a live WAL database's main file alone. Caddy restarts and free-provider reclamation can interrupt availability; this is not a paid uptime guarantee.

Local verification for this template covers YAML structure, required variables, persistent volumes, private port 8803 exposure and supported server environment names. **Docker/Caddy execution, certificates, Arm builds, remote load, WAN voice and real VM restart remain unverified.** No application, balance, ruleset, save-key or launcher-default change is included.
