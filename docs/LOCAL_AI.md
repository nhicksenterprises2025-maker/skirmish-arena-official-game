# Local GPT-OSS messages — release 1.5.2

The existing Messages tab uses your already-installed Ollama model `gpt-oss:20b`. The server probes `http://127.0.0.1:11434/api/tags` and submits structured, non-streaming `/api/chat` requests. There is no model download, remote account credential or placeholder dialogue. Run the included `Start-Game.cmd`, sign into your game account and open Settings → AI. The game and account database remain in their original locations.

## Queue and authority

SQL schema 3 adds durable jobs, generations, preferences, permanent social profiles, bot relationships and training feedback. It extends messages with subject, mood, category, certainty and generation references. Game saves remain schema 17. An existing database is backed up before migration. Fifty existing IDs, combat personalities, Power, Form, familiarity, careers, balance values, patch archives and seasons are preserved.

One server worker serializes model requests. Player replies have highest priority, followed by important season/tournament/career events, balance changes, rivalry and routine reactions. A saved reply receives a queue acknowledgment immediately. A five-second server scheduler processes pending work; the client has one eight-second social refresh timer. Neither touches the combat frame loop or adds a Meta refresh timer. Jobs left running by an interrupted server return to the queue on restart. Transport failures receive one retry; invalid JSON or detected mechanical contradictions receive one repair attempt. Failed outputs are never published as messages.

Statuses distinguish CONNECTED, OLLAMA OFFLINE, MODEL NOT INSTALLED and MODEL ERROR. Saved toggles independently control all bot messages, bot-initiated messages and player replies. Disabling a channel also prevents an in-flight response from publishing in that channel.

The game produces facts and relationship changes. Model outputs contain only six message fields and cannot execute actions or write game state. Context includes one bot's permanent identity, social traits, playstyle, actual Form, relevant current-patch weapons, exact body/head hit counts and TTK, familiarity, current category Gun Score/confidence, career/season context, bounded memories, relationships, summary and the latest eight messages. Natural weapon aliases such as “Pump”, “Tundra” and “LMG” select the correct weapon. Patch comparisons carry explicit computed before/after arithmetic. Projectile speed, cadence and RPM are labeled separately.

Current Meta values come from the shipped engine's actual Gun Score function, with separate primary and sidearm categories. Archived telemetry never enters the current comparison. Missing results remain unknown. Conversation text and generated opinions cannot establish game facts; known unsupported winner/breakpoint/rate claims are rejected. Mechanical checks are targeted safeguards, not a general proof that every possible natural-language claim is accurate.

## Personalities, events and memory

The supplied fifty identities and 450 assigned numeric traits are permanent social profiles, independent of existing combat personalities. Gratitude, competitiveness and rivalry tendency use explicit derived defaults because the supplied sheet did not assign their numeric values. Form affects conversation tone and eligibility; Power represents gameplay ability, not intelligence.

Structured events cover balance reactions, category Meta/top-three changes, new/favorite weapons, personal performance, hot/slump Form, season positions/deadlines/results, career milestones and observed best recent games, actual rival crossings, maps, tournament announcements/invites/recorded results and player messages. “Best game” explicitly identifies the retained recent observation window when no lifetime maximum exists. Tournament result messages require actual registered-bot result metadata; the existing bracket does not fabricate tournament combat.

Per-bot personality cooldowns and deterministic eligibility gates limit unsolicited chatter. At most four routine initiations, or six with major events, enter an account's queue per hour. Direct player replies bypass that limit. Friendship changes slowly from newly completed, mutually recorded teammate results. Rivalry changes from nearby qualified season competition. Scores remain bounded from 0 to 100 and are controlled by the game, never by GPT-OSS.

Conversation history remains in SQLite and can be paged in full. Context sends only the latest eight messages, a bounded extract of older conversation, twelve important event/conversation memories and six attributed opinions. Generated opinions are labeled as opinions. Deleting a message removes its references from active memory/summary and cancels its pending reply; it does not regenerate the event. Inbox drafts are saved separately per bot and account. Account changes reject stale asynchronous responses.

## Developer feedback and export

Enable Settings → AI → Developer Mode. Messages and Personality Lab results provide GOOD, BAD and EDIT controls. EDIT preserves the original response and stores your preferred corrected JSON. Live refresh preserves unsaved corrections, lab text, open panels and temperature drafts.

Training Data → Export JSONL includes evaluated examples with complete personality, event, context, bounded memory/history, actual prompt, raw response, validated response, rating/correction, model digest, game version and balance patch ID. GOOD/EDIT rows include chat-format `messages` using the accepted/preferred response. BAD rows carry a rejected response without putting it into an accepted chat example. No user/password/session/recovery/administrator credential is queried for the prompt or dataset.

This release implements immediate personality conditioning and dataset collection. It does **not** change or fine-tune the installed model weights. Later fine-tuning must select accepted/corrected rows and use a separate training workflow; rejected rows are available for preference training or review.

## Verification and configuration

`npm test` runs game, server, update/checkpoint and social frontend checks with isolated fixtures. `node dev/ollama-acceptance.cjs --run-live` explicitly opts into the real installed model and records actual eight-bot and mechanical-reasoning results in `dev/ollama-acceptance-results.json`. Its temporary account does not change the installed account universe. Earlier rejected real-model samples are retained separately as regression evidence.

The default Ollama URL is local loopback. `SAR_OLLAMA_URL` may select another loopback port for testing; nonlocal endpoints are rejected. `SAR_OLLAMA_TIMEOUT_MS` overrides the 120,000 ms request timeout. Existing explicitly configured `SAR_GPT_OSS_URL` remains a legacy compatibility option; leave it unset to use the direct local Ollama integration. Settings → AI status describes the local model.

Browser Play/Watch enter fullscreen from a user click, focus the game canvas and keep Tab from leaving the combat surface. Settings → View remembers automatic fullscreen and optional Escape locking. The native 1.5.2 game window is fullscreen on entry and supports F11 and the fullscreen toggle. Windows task switching remains available.
