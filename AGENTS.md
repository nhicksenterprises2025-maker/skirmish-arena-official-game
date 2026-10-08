# Project rules

**UNIVERSAL RULE: NO AI GENERATED LOOKING UI.** Use the established game visual language and restrained, readable controls.

1. Nothing is removed unless the user explicitly requests removal. Modify this project in place and preserve accounts, saves, careers, seasons, familiarity and historical telemetry.
2. Operator/weapon game art is 2.5D-only. Text, tables, buttons, charts and phone screen content remain ordinary UI.
3. Do not reintroduce player-facing 2D operator/weapon presentation, selection modes or flat-art fallback.
4. Headshots remain physical projectile/pellet head-hitbox collisions. Never add headshot-chance RNG.
5. Cursor distance never controls spread, accuracy, bloom or reticle geometry; it determines aim only.
6. Weapon spread comes from the four configured movement/ADS constants. Player and bots share the authoritative cone, and the reticle reflects it on a fixed screen-space scale.
7. Every user-visible release has a version, short update name, date and concise categorized Patch Notes. Launcher, game, installer, update manifest and cache versions must agree.
8. Every new user-visible feature, balance change, significant improvement and bug fix is included in that release's Patch Notes. Show only categories containing real changes; latest release expanded, older releases expandable.
9. Public UI, README, onboarding, standard settings and Patch Notes do not expose internal model/backend branding. Maintenance identifiers and dedicated owner debug tools may retain necessary technical terms.
10. ARENA REFINED Audit 1 retires GPT-OSS and Messages by explicit user request. Do not reintroduce dialogue providers, queues or message UI. Preserve gameplay bot personalities, identities, relationships, tactical AI and tournament invitation behavior.

## Routing and workflow

Read [docs/LIVE-CIRCUIT.md](docs/LIVE-CIRCUIT.md) once for system routes, preservation rules and release verification. Inspect only relevant files and direct dependencies; do not repeatedly scan the repository. Reuse existing systems, make minimal changes and run targeted checks before relevant integration checks. Keep logs and user reports concise. Continue ARENA REFINED work from [docs/arena-refined-audit.md](docs/arena-refined-audit.md); do not publish before Audit 10 passes. [docs/LOCAL_AI.md](docs/LOCAL_AI.md) is historical only. Blender maintenance is in [docs/BLENDER_PIPELINE.md](docs/BLENDER_PIPELINE.md). Public player documentation is [README.md](README.md).
