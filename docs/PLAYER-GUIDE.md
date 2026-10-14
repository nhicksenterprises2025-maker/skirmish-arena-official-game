# Skirmish Arena

**1.15.0 — ARENA REFINED · Human multiplayer and map ecosystem · Weapon Balance 9.0**

Application updates and weapon balance have separate version numbers. Arena Refined brings together all ten audits while retaining existing accounts and progress.

Skirmish Arena has Team Deathmatch, Deathmatch, Gun Game, Domination, Hardpoint and custom sessions, with a persistent league of 50 bots. Play a match, follow the four active bot matches, choose an operator and loadout, and track careers, seasons and the current weapon meta. Operators and weapons use 2.5D models throughout the game.

## Arenas and rotation

**Brightfield Blocks** remains the permanent neighborhood arena. **Foundry Crossing** has compact workshops, short yard crossings and multiple flank routes. **Relay Fields** has longer relay lanes, offset utility sheds and sheltered crossings.

Casual and Ranked use their configured map pools. Casual queues show a short map vote before preparation; voting closes automatically. Rotation avoids the previous arena when another eligible choice exists. Official tournament maps are fixed for each scheduled game without changing its start time. Custom setup lets you choose an eligible arena. Maps outside seasonal rotation remain available to existing match records and recovery checkpoints.

Every arena has a minimap and full-map view showing roads, buildings, cover, landmarks and playable limits. Hidden enemies are not shown. Spectator cameras follow the selected match's arena. Weapon distances use the same meter scale across all maps; selecting a map does not change weapon balance.

Account progression adds persistent XP and Levels 1–50, a compact lobby/profile display and an expandable match breakdown. Click **Account Level** in the main menu to see current XP, XP required, lifetime XP and all 50 completed/current/upcoming levels. Eligible standard modes earn XP; official tournaments multiply the final match award by 1.3. Custom and practice games do not earn XP or consume first-use rewards. Configured limited-time modes state their own eligibility. Level 50 is the current cap; lifetime XP continues accumulating.

**Weapon mastery** is a separate Levels 1–10 track for every weapon. Click its mastery progress in **Loadout** to see lifetime mastery XP, weapon statistics, challenges and earned badges at Levels 1, 3, 5, 7 and 10. Resolved damage, kills, headshot kills, active use and meaningful weapon wins earn progress. Equipped time is capped by combat progress, so holding a weapon while idle earns no XP. Challenges cover kills, headshots, damage, three kills with that weapon in one life and meaningful wins. Rewards are cosmetic and cannot strengthen a weapon.

Casual TDM, Deathmatch, Gun Game, Domination, Hardpoint, Ranked and eligible official tournaments count toward mastery. Custom, practice, custom tournaments, replay and debug sessions do not. Progress and claims are verified by the account service once per result. Reconnect preserves them; offline inspection shows the last verified record. Account XP, competitive rating and bot familiarity remain separate.

## Install and update

Run the Windows installer, then open your existing **Skirmish Arena** desktop shortcut and press **Play**. The desktop app starts or reuses its required local service automatically. Desktop play does not require PowerShell, Node or npm commands.

Create an account on first use and keep the recovery code. Previously authenticated accounts can continue with their cached world under **CLOUD OFFLINE — LOCAL MODE** when the account service cannot be reached. Progress saves locally and synchronizes after reconnection. First-time login and account creation require a connection.

Public hosting is currently staged, not live. Once it is activated and the trusted existing-account migration completes, sign in once at the shared address with your current username and password. Your progression and records are retained; the new address builds its own local cache after authentication. The previous local cache and original data are retained. Do not create another account to replace a migrated account.

Use **Settings → About → Check for Updates** to install a published release. Allow the game to finish saving and restart when the updater requests it. Updates retain accounts, XP, levels, careers, seasons, earnings, settings and save data.

The application startup screen stays visible for at least three seconds and until essential initialization completes. Longer preparation keeps an honest loading status. If a required stage fails, read the error and use **Retry**; a failed load does not create a replacement blank world.

## Play and controls

Choose **Play** for casual TDM, Deathmatch, Gun Game, Domination, Hardpoint, Ranked TDM, Ranked Deathmatch or Custom, or **Phone → Spectate** to watch. Team Deathmatch is 5v5, ending at 60 team kills or five minutes under its existing tie rules. Deathmatch has ten individual competitors and ends at 30 kills or four minutes. Custom matches support solo practice, selected roster bots and four difficulties; they award no XP, rating, mastery, Weapon Meta or career progress. Results show the actual team score or Deathmatch standings. **Play Again**, **Lobby** and **Spectate** are available afterward.

**Gun Game** is ten-player FFA. Everyone starts at tier one, and a kill with the current tier weapon advances to the next. Complete the final weapon to win. The progression uses the current weapon registry, with primaries ordered by preferred range followed by sidearms. Deaths and suicides keep your tier; older projectiles cannot skip the next tier. The eight-minute timer uses highest tier and progress within that tier; equal leaders draw. Reconnect restores the same participant and tier, while abandoned players cannot win the timeout. New participants cannot enter a running Gun Game.

**Domination** is 5v5 with A, B and C. Living roster participants inside a zone capture it in eight seconds; a second teammate speeds capture, with further stacking capped. A contested zone pauses capture. Owned zones score one point per second. First to 200 wins; the ten-minute limit compares objective scores and an equal score draws.

**Hardpoint** is 5v5. One authored point scores for its uncontested occupying team at one point per second, rotating every 60 seconds in a fixed order. The HUD shows the current location, next location and rotation time. First to 250 wins; the ten-minute limit compares objective scores and an equal score draws.

All five permanent modes work in Custom across every arena. Ranked remains available only for TDM and Deathmatch. Limited-time entries appear only when a configured event is active; each defines its maps, team size, loadouts, score/time rules and XP/stat eligibility. No seasonal event is enabled by default.

Human matches require a connection to the same shared game service. The match server resolves combat and match rewards; reconnecting restores your existing participant instead of creating another player. While disconnected, your cached world remains available for practice, with no XP or Ranked rating. A public internet service must be deployed before players on different networks can meet.

Selecting a mode opens a separate match-preparation screen for at least three seconds while the arena and roster prepare. Three seconds is a minimum, not a failure deadline; preparation must also finish before entry. **Return to Modes** or Escape cancels, and **Retry** starts a clean attempt after a reported error. Your player enters only when preparation is ready and the game has focus. The existing pre-match countdown is separate and appears before combat begins.

Move with the keyboard and aim with the mouse. Gameplay captures the mouse; opening menus releases it. Use the game's **Game → Controls** settings for the current bindings, mouse sensitivity and ADS sensitivity. F11 toggles fullscreen, Tab shows the scoreboard during combat, and Windows Alt+Tab remains available.

Weapon spread follows stationary, walking, sprinting and ADS states. Moving the cursor changes aim position and direction. Headshots require a projectile or pellet to hit the head. Damage numbers show the HP actually removed and can be toggled in Gameplay settings.

Ranked TDM uses the same combat rules, a 60-kill target and a five-minute clock. Ranked Deathmatch uses the Deathmatch rules. Their queues are separate from casual queues; entering Ranked does not silently move you into casual. Each participant has a separate ELO rating and full rank title, from Beginner I to Ascendant. Ranked streaks count only eligible Ranked wins. Account level and bot Power are separate from rank. Results explain both XP and ELO, including the actual applied change at the zero-rating floor.

## Operators and loadouts

Operators are cosmetic choices with the same gameplay statistics. Drag any card’s 2.5D model to rotate it, use its keyboard or zoom controls, and Reset to restore the starting view. Choose a primary weapon and sidearm in Loadout. The lobby operator has a subtle breathing motion; the separately displayed weapon slowly makes a full turn.

Weapon cards show role, damage, body/headshot TTK, ammunition, reload time, preferred range and current meta measurements. Stat bars retain exact numbers: stronger performance is greener, with yellow, orange and red for lower performance. Shorter reloads receive the stronger bar. Advanced statistics provide deeper mechanical values. The armory contains 15 weapons, including the semi-automatic FAL, ranged-SMG P90, three-round-burst SR-Aug and SPAS-12. The FAL fires individual rounds at a 0.26-second interval and has a preferred engagement range of 48.61 m. Audio settings control Master, Weapons, SFX, UI and Ambience volumes.

Preferred range, falloff start, engagement range and kill range use meters. Projectile speed uses meters per second; a displayed falloff rate is per meter. These units preserve the arena's physical size and weapon behavior at fixed positions. Camera zoom does not change distance or spread. Historical measurements without a known scale remain unavailable rather than receiving an invented conversion.

## Careers, seasons and Weapon Meta

Main-menu Weapon Meta reports human participants, including eligible play against bots. Phone houses Bot Leaderboard and Bot Weapon Meta. Compact rows expose details; Expand opens a larger Phone workspace. Accurate human/bot cohort statistics begin with Skyline. Older mixed records remain available as legacy history, and sparse samples remain empty or LOW SAMPLE.

Open your username menu for **Profile**, **Settings**, **Account** and **Logout**. Standard match results contribute to your career, weapon records and season progress. Bot profiles retain their careers, Power, Form, playstyle and weapon familiarity across sessions.

Click your 3D ranked emblem in the lobby, profile or ranked result to inspect actual ranked statistics, current ELO, season best, career best, rank changes and the complete ranked ladder. **Back** returns to the screen you opened it from. Ranked results show promotions and demotions with the previous and new rank. Profiles retain separate mode records, **Ranked Stats** and **Combined Stats**. Choose lifetime records or a saved season; current competitive rating remains separate from account XP and Level.

Ranked starts at Beginner I and uses completed Ranked TDM and Ranked Deathmatch results. No additional placement quota is imposed. Ranked season history preserves final rank and season best. Ratings carry forward by default; any configured reset is applied once at the season transition. The Ranked leaderboard uses server-verified records.

Open **Ranked Rewards** from ranked inspection to view configured profile icons, banners, victory poses, operator appearances, weapon badges or Arena Credits. **Locked** requires further rank progress; **Earned** awaits its configured claim date; **Claimable** can be collected; **Claimed** is already owned. Claims require an online authenticated account. Reconnect and repeated claims preserve one grant. Apply owned presentation rewards through their existing controls. If no rewards are configured, the track displays that empty state.

Ranked Stats contains eligible Ranked records. Combined Stats includes eligible casual modes, Ranked, stat-eligible limited-time modes and accepted official tournament games, counting each completed match once. Custom matches, custom tournaments, practice and test sessions are excluded. K/D, accuracy and win rate use raw totals. Older missing match details or shot measurements are marked unavailable; source careers and tournament records remain separate. Each permanent mode has its own profile record; configured limited-time records retain their event identity. **Online Record** in the lobby shows the server-verified multiplayer totals and individual match history; accepted records remain cached for offline inspection. Reopening or reconnecting does not duplicate rewards.

Season pages show the current competition and previous results. **Weapon Meta** separates primary weapons and sidearms and supports sorting. Select a weapon to inspect its model, detailed measurements and leading bot users.

Current meta measurements belong to one balance patch. Historical patch measurements and lifetime records remain available. Small samples display **LOW SAMPLE** or **—** until enough observations exist. Solo-kill and finisher measurements use actual damage contributions.

## Spectate

Open **Phone → Spectate**, select a live match and choose **Watch Match**. Escape returns to the same Phone app. **Live Scores** shows live timers, scores, waiting state and between-match cooldowns.

The background league has **two Team Deathmatch slots and two Deathmatch slots**. A full allocation uses 40 of the 50 persistent bots, with ten waiting. Slots restart after a 15-second cooldown and rotate the waiting pool fairly. Official tournament reservations take priority; affected background slots wait for available bots.

Select any of the four matches directly and cycle individual bots. Team cycling is available in TDM; Deathmatch uses individual places and has no teammates. Use the follow and tactical camera controls, inspect the selected bot's loadout or statistics, and follow its score, timer and K/D/A. Spectating uses the same live match state as normal play. Neutral combat panels keep team and status colors readable.

## Cosmetics

Operators, profile icons, banners, mastery badges and victory poses change appearance only. Every operator uses the same gameplay hitboxes and combat rules. The original eight operators remain available; ten additional identities can be inspected in Operator or Store. Basic operators cost 500 AC, Detailed 1,000 AC, Cool Detailed 1,500 AC. Obsidian, Aegis Prime and Specter cost exactly 2,500 AC each.

The Store has separate collections for operators, twelve profile icons, eight banners and victory poses. Inspection does not grant ownership. Review and confirm a purchase, then Equip; owned selections survive restart. Existing owned appearances remain usable. Weapon mastery badges continue to come from eligible mastery progress and can be inspected through the Store's mastery section.

Quiet Confidence is the default owned victory pose. Arms Folded, Weapon Rest, Champion Stance, Tactical Ready and Over-the-Shoulder are additional cosmetic poses. Preview them in the Store and equip an owned pose. Completed Deathmatch shows the real winning operator; team results present the winning team and its MVP. These poses run in presentation screens, outside gameplay.

## Replays

Open **Profile → Replays** to inspect saved eligible match recordings. Watch, pause, restart, scrub, change playback speed or follow another participant using the spectator camera. Recorded maps, loadouts, balance and outcomes belong to the original match. Playback adds no XP, Ranked rating, mastery, statistics, bot learning, tournament progress or Arena Credits.

Storage reports recording size and usage. Keep favorites, delete recordings you no longer need, and adjust retention limits. Cleanup removes oldest eligible non-favorites only. A full budget or low disk space skips recording and shows a warning; other saved data remains intact. Unsupported recordings show a clear unavailable state. Older matches without a recording remain historical statistics.

## Phone

Open **Phone** for **Live Scores**, **Spectate**, **Bot Leaderboard**, **Bot Weapon Meta**, **Friends** and **Factions**. **Back** and **Home** navigate within the phone. Open a bot's profile from its current records to inspect career and performance information.

In **Friends**, search for a username, send a request, accept or decline incoming requests, remove a friend, or block/report a player. Online state and activity follow that player's privacy preferences. You can invite friends to your party or join a party whose leader permits it.

In **Factions**, create a faction or find one to join. Open factions accept members directly; others use applications or invitations. Owners and Officers can invite friends through the social interface. Your faction page shows its curated logo, name/tag, creation date, owner, roster, roles, permitted online state and recent activity. Compact tags and logos also appear in profiles and parties.

Owners manage faction identity, admission and roles. Officers invite, review applications and remove Members; Members can leave. An Owner must transfer ownership or disband before leaving. Transfer and disband require an explicit confirmation with the exact faction name. Disbanding keeps historical activity and reserves the final name/tag.

The logo builder uses curated shapes, symbols, accents, borders, patterns and contrasting colors; it accepts no image uploads or arbitrary logo text. Disable or block faction invitations, or report faction conduct/name/logo from the faction page. Reports are saved for review. Offline faction records remain readable; membership changes require a connection.

Faction leaderboards count verified eligible player-match contributions while members belong to the faction, then sort by wins, kills and damage. Five faction members completing one match count as five player-match contributions. Custom, practice, replay and debug sessions do not contribute. Departed members' accepted activity remains with its original faction. Factions grant no combat buffs or progression/currency bonuses.

The lobby party strip shows each member's operator/profile icon, Level, ranked emblem and ready state. The leader selects a mode, invites/removes members, queues and cancels the queue. Everyone must be ready; a changed mode clears ready states. Team queues allow up to five party members; Deathmatch allows ten. Disconnecting does not create a second identity or reset the party.

Open **Chat / Voice** for party chat, match chat or team chat in team modes. Deathmatch has no team chat. Player controls offer mute, block and report, with text and voice mutes kept separate. Voice requires explicit opt-in and defaults to push-to-talk on **V**. Voice Settings can change that key, mute the microphone, disable voice, set each player's volume, or select input/output devices where supported. Team voice is limited to your team; party voice stays within your party. There is no default global voice channel. Releasing push-to-talk, switching away from the game or disconnecting stops microphone transmission.

## Tournaments and Calendar

The tournament Calendar lists real official and custom events with local start times, registration state and results. Official events use the **SKIRMISH CHALLENGE TOURNAMENT** name; custom events keep their creator's name. Open an event for **Overview / Schedule**, **Bracket**, **Team Leaderboard** and **Player Stats Leaderboard**. The bracket connects quarterfinals to semifinals and the final using saved results. Both leaderboards can be sorted and show tournament records separately from normal careers.

Official events recur every **three calendar days at 7:30 PM Eastern (America/New_York)**, following daylight saving. Calendar dates follow the existing event sequence. The connected game service owns one shared official calendar, bracket and history. A locally managed service cannot run while its host PC is off; a hosted service runs independently of players' computers. Events whose playable windows were missed are cancelled without invented scores or rewards. Custom tournaments retain their creator's date and time.

Each tournament has eight teams of five participants. Quarterfinals and semifinals use **3-game aggregate kills**; finals use **5-game aggregate kills**. Every game is played, and the higher total team kills advances. Individual game wins do not determine advancement. Games retain their 50-kill target, five-minute limit and existing in-game tie rule. Equal aggregate kills use total team damage; an exact damage tie holds advancement for an explicit ruling. Historical tournaments retain their recorded format. Register a team and invite eligible bots, who may accept or decline. Before check-in, vacant positions and teams fill automatically with eligible bots from the real persistent roster; automated filling does not require an invitation response.

The scheduler reserves tournament bots seven minutes before an official event so their current background matches can finish. A genuine shortage is shown as a roster conflict. Standard custom tournaments use the same check-in and no-show rules, with their own start time and subsequent games opening after the prior result. The update retires incomplete tournament state once with recoverable records; completed official history and shared account progress remain intact.

| Round | Preparation/check-in opens for each game (Eastern) | Latest round finish |
| --- | --- | --- |
| Quarterfinals | 7:30, 7:38, 7:46 PM | 7:53 PM |
| Semifinals | 7:55, 8:03, 8:11 PM | 8:18 PM |
| Final | 8:20, 8:28, 8:36, 8:44, 8:52 PM | 8:59 PM |

Check in during the first **90 seconds** of each **two-minute preparation block**. The remaining 30 seconds lock and prepare the roster, with the existing three-second countdown ending at combat start. For the first quarterfinal game: check-in opens at 7:30, closes at 7:31:30, and combat starts at 7:32. Event details show queue opening, check-in closing and combat start separately. The mode-entry loading screen fits preparation and never shifts the global clock. Teams finishing early wait for the next fixed game time.

At the check-in deadline, absent humans are replaced by eligible bots from the same persistent roster for the **remainder of that tournament**. The replacement receives that slot's eventual payout; a returning player cannot take it back mid-event or receive a duplicate payout. A checked-in player is not replaced merely because the interface is slow. Roster conflicts are shown rather than filled with cloned bots. Closing and reopening can restore a compatible saved game checkpoint; it does not extend deadlines or create results.

**Official Tournament History** lists completed official events and opens their saved details, placements and winning roster. Historical names and champions remain as recorded. Missing older records are marked unavailable. Offline calendars show their cached status; loading, empty schedules and connection errors have separate states.

Tournament performance has separate records. It does not contribute to standard player combat totals, normal bot careers, Weapon Meta or Gun Score. Official tournament earnings persist as fictional in-game amounts, awarded to **each participant**:

| Placement | Earnings per participant |
| --- | ---: |
| 1st | $50,000 |
| 2nd | $35,000 |
| 3rd | $20,000 |
| 4th | $12,500 |
| 5th | $7,500 |
| 6th | $5,000 |
| 7th | $2,500 |
| 8th | $1,000 |

Teams eliminated in the same round are ordered by tournament game differential, kill differential, damage differential and initial seed. Custom tournaments retain their own results and award no earnings.

## Save data

**Settings → Account → Data Management** exports an offline backup. Keep account recovery information and backups before moving between computers or installations. Importing into an established account cannot replace newer permanent records with older ones. Browser saves and logins belong to their address; changing the address does not transfer them automatically.

The installed game's persistent data lives outside its program files. Replacing the game or installing an update should not require removing that data.

## Patch notes

Open **Settings → About → Patch Notes** for the current version, update name, release date and categorized changes. The latest release opens first; older releases remain expandable.

## Settings and exit

Open your username menu for Profile, Settings, Account and sign-out. Settings has exactly Game, Audio, Account and About. Game groups controls, aim, gameplay and view without resetting saved preferences. Account includes Data Management; About includes updates, Patch Notes and this guide.

Exit Game on the lobby saves locally before closing the desktop app. Pending online synchronization remains on the device when offline. A browser that cannot close itself shows a saved-state message so you can close the window. Exiting does not sign you out.
