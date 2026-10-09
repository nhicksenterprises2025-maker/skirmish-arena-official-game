# Skirmish Arena

**1.14.0 — ARENA REFINED · Weapon Balance 9.0**

Application updates and weapon balance have separate version numbers. Arena Refined brings together all ten audits while retaining existing accounts and progress.

Skirmish Arena has 5v5 Team Deathmatch, ten-player Deathmatch and custom sessions, with a persistent league of 50 bots. Play a match, follow the four active bot matches, choose an operator and loadout, and track careers, seasons and the current weapon meta. Operators and weapons use 2.5D models throughout the game.

Account progression adds persistent XP and Levels 1–50, a compact lobby/profile display and an expandable match breakdown. Standard TDM and Deathmatch earn XP; official tournaments multiply the final match award by 1.3. Custom and practice games do not earn XP or consume first-use rewards. Level 50 is the current cap; lifetime XP continues accumulating.

## Install and update

Run the Windows installer, then open your existing **Skirmish Arena** desktop shortcut and press **Play**. The desktop app starts or reuses its required local service automatically. Desktop play does not require PowerShell, Node or npm commands.

Create an account on first use and keep the recovery code. Previously authenticated accounts can continue with their cached world under **CLOUD OFFLINE — LOCAL MODE** when the account service cannot be reached. Progress saves locally and synchronizes after reconnection. First-time login and account creation require a connection.

Use **Settings → About → Check for Updates** to install a published release. Allow the game to finish saving and restart when the updater requests it. Updates retain accounts, XP, levels, careers, seasons, earnings, settings and save data.

The application startup screen stays visible for at least three seconds and until essential initialization completes. Longer preparation keeps an honest loading status. If a required stage fails, read the error and use **Retry**; a failed load does not create a replacement blank world.

## Play and controls

Choose **Play** for Ranked TDM, Team Deathmatch, Deathmatch or Custom, or **Phone → Spectate** to watch. Team Deathmatch is 5v5, ending at 60 team kills or five minutes under its existing tie rules. Deathmatch has ten individual competitors and ends at 30 kills or four minutes. Custom matches support solo practice, selected roster bots and four difficulties; they award no official progress. Results show the actual team score or Deathmatch standings. **Play Again**, **Lobby** and **Spectate** are available afterward.

Selecting a mode opens a separate match-preparation screen for at least three seconds while the arena and roster prepare. Three seconds is a minimum, not a failure deadline; preparation must also finish before entry. **Return to Modes** or Escape cancels, and **Retry** starts a clean attempt after a reported error. Your player enters only when preparation is ready and the game has focus. The existing pre-match countdown is separate and appears before combat begins.

Move with the keyboard and aim with the mouse. Gameplay captures the mouse; opening menus releases it. Use the game's **Game → Controls** settings for the current bindings, mouse sensitivity and ADS sensitivity. F11 toggles fullscreen, Tab shows the scoreboard during combat, and Windows Alt+Tab remains available.

Weapon spread follows stationary, walking, sprinting and ADS states. Moving the cursor changes aim position and direction. Headshots require a projectile or pellet to hit the head. Damage numbers show the HP actually removed and can be toggled in Gameplay settings.

Ranked TDM uses the same combat rules, a 60-kill target and a five-minute clock. Each participant has a separate ELO rating and full rank title, from Beginner I to Ascendant. Ranked streaks count only eligible Ranked wins. Account level and bot Power are separate from rank. Results explain both XP and ELO, including the actual applied change at the zero-rating floor.

## Operators and loadouts

Operators are cosmetic choices with the same gameplay statistics. Drag any card’s 2.5D model to rotate it, use its keyboard or zoom controls, and Reset to restore the starting view. Choose a primary weapon and sidearm in Loadout. The lobby operator has a subtle breathing motion; the separately displayed weapon slowly makes a full turn.

Weapon cards show role, damage, body/headshot TTK, ammunition, reload time, preferred range and current meta measurements. Stat bars retain exact numbers: stronger performance is greener, with yellow, orange and red for lower performance. Shorter reloads receive the stronger bar. Advanced statistics provide deeper mechanical values. The armory contains 15 weapons, including the semi-automatic FAL, ranged-SMG P90, three-round-burst SR-Aug and SPAS-12. The FAL fires individual rounds at a 0.26-second interval and has a preferred engagement range of 48.61 m. Audio settings control Master, Weapons, SFX, UI and Ambience volumes.

Preferred range, falloff start, engagement range and kill range use meters. Projectile speed uses meters per second; a displayed falloff rate is per meter. These units preserve the arena's physical size and weapon behavior at fixed positions. Camera zoom does not change distance or spread. Historical measurements without a known scale remain unavailable rather than receiving an invented conversion.

## Careers, seasons and Weapon Meta

Main-menu Weapon Meta reports human participants, including eligible play against bots. Phone houses Bot Leaderboard and Bot Weapon Meta. Compact rows expose details; Expand opens a larger Phone workspace. Accurate human/bot cohort statistics begin with Skyline. Older mixed records remain available as legacy history, and sparse samples remain empty or LOW SAMPLE.

Open your username menu for **Profile**, **Settings**, **Account** and **Logout**. Standard match results contribute to your career, weapon records and season progress. Bot profiles retain their careers, Power, Form, playstyle and weapon familiarity across sessions.

Click your 3D ranked emblem in the lobby, profile or ranked result to inspect your actual ranked statistics, current ELO progress and complete ranked ladder. **Back** returns to the screen you opened it from. Profiles retain Team Deathmatch and Deathmatch and add **Ranked Stats** and **Combined Stats**. Choose lifetime records or a saved season; the displayed current ELO remains your lifetime competitive rating.

Ranked Stats includes eligible Ranked TDM only. Combined Stats includes casual TDM, casual Deathmatch, Ranked and accepted official tournament games, counting each completed match once. Custom matches, custom tournaments, practice and test sessions are excluded. K/D, accuracy and win rate use raw totals. Older missing match details or shot measurements are marked unavailable; source careers and tournament records remain separate. Eligible results refresh the relevant tabs immediately and persist through offline play and reconnection.

Season pages show the current competition and previous results. **Weapon Meta** separates primary weapons and sidearms and supports sorting. Select a weapon to inspect its model, detailed measurements and leading bot users.

Current meta measurements belong to one balance patch. Historical patch measurements and lifetime records remain available. Small samples display **LOW SAMPLE** or **—** until enough observations exist. Solo-kill and finisher measurements use actual damage contributions.

## Spectate

Open **Phone → Spectate**, select a live match and choose **Watch Match**. Escape returns to the same Phone app. **Live Scores** shows live timers, scores, waiting state and between-match cooldowns.

The background league has **two Team Deathmatch slots and two Deathmatch slots**. A full allocation uses 40 of the 50 persistent bots, with ten waiting. Slots restart after a 15-second cooldown and rotate the waiting pool fairly. Official tournament reservations take priority; affected background slots wait for available bots.

Select any of the four matches directly and cycle individual bots. Team cycling is available in TDM; Deathmatch uses individual places and has no teammates. Use the follow and tactical camera controls, inspect the selected bot's loadout or statistics, and follow its score, timer and K/D/A. Spectating uses the same live match state as normal play. Neutral combat panels keep team and status colors readable.

## Phone

Open **Phone** for **Live Scores**, **Spectate**, **Bot Leaderboard** and **Bot Weapon Meta**. **Back** and **Home** navigate within the phone. Open a bot's profile from its current records to inspect career and performance information.

## Tournaments and Calendar

The tournament Calendar lists real official and custom events with local start times, registration state and results. Official events use the **SKIRMISH CHALLENGE TOURNAMENT** name; custom events keep their creator's name. Open an event for **Overview / Schedule**, **Bracket**, **Team Leaderboard** and **Player Stats Leaderboard**. The bracket connects quarterfinals to semifinals and the final using saved results. Both leaderboards can be sorted and show tournament records separately from normal careers.

Official events recur every **three calendar days at 7:30 PM Eastern (America/New_York)**, following daylight saving. Calendar dates follow the existing event sequence. The local account service owns the persistent schedule; it cannot run while Windows is off. Events whose playable windows were missed are cancelled without invented scores or rewards. Custom tournaments retain their creator's date and time.

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
