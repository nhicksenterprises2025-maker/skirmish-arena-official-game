(() => {
  'use strict';
  if (window.SARMultiplayerUI) return;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const permanentModes = () => window.SARMatchModes?.list?.().filter(mode=>!mode.ranked&&!mode.ltm) || [{mode:'tdm',label:'Team Deathmatch'},{mode:'deathmatch',label:'Deathmatch'}];
  const modes = () => [...permanentModes().map(mode=>['casual-'+mode.mode,'Casual '+mode.label]),['ranked-tdm','Ranked TDM'],['ranked-deathmatch','Ranked Deathmatch'],...permanentModes().map(mode=>['custom-'+mode.mode,'Custom '+mode.label]),...(snapshot.ltms || []).map(mode=>['ltm:'+mode.id,mode.name])];
  const ltm = mode => (snapshot.ltms || []).find(definition=>'ltm:'+definition.id === mode);
  const baseMode = mode => ltm(mode)?.rules?.baseMode || String(mode).replace(/^(casual|ranked|custom)-/,'');
  const freeForAll = mode => window.SARMatchModes?.isFFA?.(baseMode(mode)) ?? ['deathmatch','dm','gun-game'].includes(baseMode(mode));
  let snapshot = {}, owner = null, subscribed = false, search = [], searchText = '', searchSequence = 0, searchError = '', notice = '', noticeError = false, pending = false;
  let soloMode = 'casual-tdm', customMapId = 'brightfield-blocks';
  let chatScope = 'party', chatOpen = false, voiceOptionsOpen = false, preview;
  const chatMuted = new Set();
  const social = () => snapshot.social || {};
  const self = () => {
    const user = social().self || snapshot.account || window.SARCloud?.state?.account || {}, summary = snapshot.progression?.summary || (!snapshot.account ? window.SAR?.getProgressionSummary?.() : null);
    const identity={...user,faction:snapshot.factions?snapshot.factions.self:user.faction};return summary ? {...identity,level:summary.xp?.currentLevel || user.level,rank:summary.ranked || user.rank} : identity;
  };
  const party = () => social().party || snapshot.party;
  const members = () => party()?.members || [];
  const blocked = () => new Set((social().blocked || []).map(value => value.userId || value.id || value.user?.id));
  const profile = item => item?.user || item?.profile || item || {};
  const identity = item => profile(item).id || item?.userId;
  const leader = () => party()?.leaderId === self().id;
  const connected = () => !!(snapshot.connected ?? snapshot.online);
  const teamMode = () => !!snapshot.match && !freeForAll(snapshot.match.mode);
  const isTyping = () => document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
  const network = () => window.SARMultiplayer;
  const chosenMode = () => party()?.mode || soloMode;
  const mapInfo = id => window.SARMaps?.get?.(id);
  const mapName = id => mapInfo(id)?.name || String(id || '').replace(/-/g,' ');
  const mapPool = mode => ltm(mode)?.mapPool || snapshot.mapPools?.pools?.[mode.startsWith('custom') ? 'custom' : mode.startsWith('ranked') ? 'ranked' : 'casual'] || [];
  window.SARModeHUD = {update(match,focus,now,presentation){
    let markup = '';
    const zones = match?.objectives || [], state = match?.modeState;
    const teamStyle = team => [0,1].includes(team) ? presentation?.team?.(team) || {label:team === 0 ? 'BLUE' : 'RED',color:team === 0 ? '#81b7e7' : '#eb9b92'} : {label:'NEUTRAL',color:'var(--arena-hud-text)'};
    const side = team => teamStyle(team).label;
    if(match?.mode === 'gun-game' && state?.weaponOrder?.length){
      const tier = Math.min(state.weaponOrder.length-1,Math.max(0,focus?.gunTier || 0));
      const remaining = Math.max(1,(state.rules?.killsPerTier || 1)-(focus?.gunTierKills || 0));
      markup = `<strong>TIER ${tier+1} / ${state.weaponOrder.length}</strong><span>${escape(state.weaponOrder[tier])}</span><small>${tier === state.weaponOrder.length-1 ? 'FINAL TIER · '+remaining+' '+(remaining === 1 ? 'KILL' : 'KILLS')+' TO WIN' : 'NEXT: '+escape(state.weaponOrder[tier+1])}</small>`;
    }else if(match?.mode === 'domination'){
      markup = zones.map(zone=>`<div class="mode-zone" data-owner="${zone.owner ?? 'neutral'}"><strong style="color:${escape(teamStyle(zone.owner).color)}">${escape(zone.id)}</strong><span>${zone.contested ? 'CONTESTED' : zone.capturingTeam != null ? side(zone.capturingTeam)+' '+Math.round(zone.progress*100)+'%' : side(zone.owner)}</span></div>`).join('');
    }else if(match?.mode === 'hardpoint'){
      const point = zones.find(zone=>zone.active), index = zones.indexOf(point), next = zones[(index+1)%zones.length];
      if(point)markup = `<strong>${escape(point.label)}</strong><span>${point.contested ? 'CONTESTED' : side(point.owner)}</span><small>NEXT ${escape(next?.label)} · ${Math.max(0,Math.ceil(((point.nextAt ?? now)-now)/1000))}s</small>`;
    }
    for(const id of ['modeObjectiveHud','spectatorObjectiveHud']){
      const panel = document.getElementById(id);if(!panel)continue;panel.classList.toggle('hidden',!markup);panel.dataset.mode = match?.mode || '';
      if(panel.dataset.markup !== markup){panel.innerHTML = markup;panel.dataset.markup = markup;}
    }
  }};
  function mapChoiceHtml(mode, queued) {
    const vote = snapshot.queue?.mapVote, currentMap = snapshot.match?.mapId;
    if(vote){
      const clock = snapshot.serverClock, now = clock ? clock.now+performance.now()-clock.receivedAt : Date.now();
      const remaining = Math.max(0,Math.ceil((vote.deadline-now)/1000)), closed = !connected() || remaining === 0;
      return `<section class="mp-map-vote" aria-label="Choose the next map"><div class="mp-map-vote-title"><strong>NEXT MAP</strong><span>${remaining ? 'Voting closes in '+remaining+'s' : 'Selecting map…'}</span></div><div class="mp-map-options">${vote.options.map(option=>`<button type="button" data-mp-action="map-vote" data-map-id="${escape(option.id)}" data-vote-id="${escape(vote.id)}" aria-pressed="${vote.currentVote === option.id}" ${closed ? 'disabled' : ''}><span>${escape(option.name || mapName(option.id))}</span><small>${Math.max(0,Number(vote.counts?.[option.id] || 0))} ${Number(vote.counts?.[option.id]) === 1 ? 'vote' : 'votes'}${vote.currentVote === option.id ? ' · YOUR PICK' : ''}</small></button>`).join('')}</div><p class="mp-map-note">One vote per player. Your choice may change until voting closes.</p></section>`;
    }
    if(currentMap)return `<p class="mp-map-summary"><strong>MAP</strong> ${escape(mapName(currentMap))}</p>`;
    const pool = mapPool(mode);
    if(!pool.length)return '<p class="mp-map-note">Map pool is loading.</p>';
    if(mode.startsWith('custom')){
      if(party() && !leader())return `<p class="mp-map-summary"><strong>CUSTOM MAPS</strong> ${pool.map(id=>escape(mapName(id))).join(' · ')}<small>Your party leader selects the map.</small></p>`;
      const selected = pool.includes(customMapId) ? customMapId : pool[0];customMapId = selected;
      return `<div class="mp-custom-map"><label class="mp-mode-label">MAP<select data-mp-custom-map aria-label="Custom multiplayer map" ${queued || party() && !leader() ? 'disabled' : ''}>${pool.map(id=>`<option value="${escape(id)}" ${selected === id ? 'selected' : ''}>${escape(mapName(id))}</option>`).join('')}</select></label><p class="mp-map-note">Shared custom matches do not award XP, rating, credits or career statistics.</p></div>`;
    }
    return `<p class="mp-map-summary"><strong>MAP POOL</strong> ${pool.map(id=>escape(mapName(id))).join(' · ')}${mode.startsWith('casual') && pool.length > 1 ? '<small>Vote for the next map while finding a match.</small>' : ''}</p>`;
  }
  function status(text, error = false) {
    notice = text;noticeError = error;
    document.querySelectorAll('[data-mp-status]').forEach(element => {element.textContent = text;element.dataset.error = String(error);});
  }
  async function action(type, payload = {}) {
    if (!network()?.action) throw new Error('Online play is still connecting.');
    try {const result = await network().action(type, payload);status('');return result;}
    catch (error) {status(error.message || 'This action could not be completed.', true);throw error;}
  }
  function rankData(user) {
    const rank = user.rank || user.ranked;
    if (!rank) return null;
    const rankIndex = Number.isInteger(rank.rankIndex) ? rank.rankIndex : window.SARProgression?.ranks?.findIndex(row => row.name === (rank.rankName || rank.name));
    return rankIndex >= 0 ? {...rank,rankIndex,name:rank.rankName || rank.name || window.SARProgression?.ranks?.[rankIndex]?.name} : null;
  }
  function iconHtml(user, size = 38) {
    if(typeof user.profileIcon==='string'&&/^\/assets\/[a-zA-Z0-9/_-]+\.(png|svg)$/.test(user.profileIcon))return `<img class="mp-profile-icon" style="--mp-icon-size:${size}px" src="${escape(user.profileIcon)}" alt="${escape(user.username)} profile icon" />`;
    const operator = window.SAR?.getOperators?.().find(value => value.id === user.operator || value.index === user.operator || value.id === user.profileIcon);
    return operator ? `<canvas width="100" height="100" class="mp-profile-icon" style="--mp-icon-size:${size}px" data-mp-operator="${escape(operator.id)}" aria-label="${escape(operator.name)}"></canvas>` : `<span class="mp-profile-icon mp-initials" style="--mp-icon-size:${size}px" aria-hidden="true">${escape(String(user.username || '?').slice(0,2).toUpperCase())}</span>`;
  }
  function rankHtml(user) {
    const rank = rankData(user);
    return rank ? `<canvas class="mp-rank" width="80" height="80" data-mp-rank="${rank.rankIndex}" role="img" aria-label="${escape(rank.name)}"></canvas>` : '';
  }
  function paintIcons(root) {
    if (!root || document.hidden) return;
    root.querySelectorAll('[data-mp-operator]').forEach(canvas => {if (!canvas.isConnected || canvas.dataset.mpPainted || !window.SAR?.paintCosmeticPreview) return;canvas.dataset.mpPainted = 'true';void Promise.resolve(window.SAR.paintCosmeticPreview(canvas,{operatorId:canvas.dataset.mpOperator})).catch(() => {delete canvas.dataset.mpPainted;});});
    const badges = [...root.querySelectorAll('[data-mp-rank]:not([data-mp-painted])')];badges.forEach(canvas=>canvas.dataset.mpPainted = 'true');
    if (badges.length) {preview ??= import('./inspect-25d.mjs');void preview.then(module => Promise.all(badges.filter(canvas => canvas.isConnected).map(canvas => module.paintInspection(canvas,{kind:'rank',rankIndex:Number(canvas.dataset.mpRank)})))).catch(() => {});}
  }
  function partyHtml() {
    if (!self().id) return '<div class="mp-party-title"><strong>ONLINE PARTY</strong><span>Sign in to play with friends</span></div>';
    const group = party(), queued = snapshot.queue || group?.queueStatus === 'queued', roster = group?.members || [self()];
    const capacity = freeForAll(chosenMode()) ? 10 : ltm(chosenMode())?.teamSize || 5;
    const slots = Array.from({length:Math.max(capacity,roster.length)}, (_, index) => {
      const member = roster[index], user = member?.id === self().id ? {...member,...self(),ready:member.ready} : member;
      return user ? `<li class="mp-party-member" title="${escape(user.username)}${user.id === group?.leaderId ? ' · Party leader' : ''}">${iconHtml(user)}<span class="mp-member-copy"><strong>${escape(user.username)}${user.id === self().id ? ' · YOU' : ''}</strong><small>LEVEL ${Math.max(1,Number(user.level || user.currentLevel || 1))} · ${user.ready ? 'READY' : user.id === group?.leaderId ? 'LEADER' : 'NOT READY'}</small></span>${window.SARFactionsUI?.compact?.(user.faction,14)||''}${rankHtml(user)}${leader() && user.id !== self().id ? `<button data-mp-action="party-remove" data-user-id="${escape(user.id)}" aria-label="Remove ${escape(user.username)} from party">×</button>` : ''}</li>` : `<li class="mp-party-empty"><button data-mp-action="friends" aria-label="Invite a friend to party slot ${index+1}">+ <span>INVITE</span></button></li>`;
    }).join('');
    const mine = roster.find(user => user.id === self().id), chosen = chosenMode(), custom = chosen.startsWith('custom');
    return `<header class="mp-party-title"><strong>${group ? 'YOUR PARTY' : 'ONLINE PLAY'}</strong><span>${connected() ? `${group ? roster.length : 1} / ${capacity}${snapshot.latencyMs ? ' · '+Math.round(snapshot.latencyMs)+' MS' : ''}` : 'OFFLINE'}</span></header><ol class="mp-party-slots">${slots}</ol><div class="mp-party-controls"><label class="mp-mode-label">MODE<select data-mp-mode aria-label="Online game mode" ${group && !leader() || queued ? 'disabled' : ''}>${modes().map(([id,label])=>`<option value="${escape(id)}" ${chosen === id ? 'selected' : ''}>${escape(label)}</option>`).join('')}</select></label>${!group ? '<button data-mp-action="party-create">CREATE PARTY</button>' : `<button data-mp-action="party-ready" data-ready="${!mine?.ready}" ${queued ? 'disabled' : ''}>${mine?.ready ? 'UNREADY' : 'READY'}</button>`}${!group || leader() ? `<button class="primary" data-mp-action="${queued ? 'cancel-queue' : custom ? 'custom' : 'queue'}" ${!connected() || custom && !mapPool(chosen).length || !queued && chosen.startsWith('ltm:') && !ltm(chosen) ? 'disabled' : ''}>${queued ? 'CANCEL QUEUE' : custom ? 'START CUSTOM' : 'FIND MATCH'}</button>` : '<span class="mp-wait-leader">Leader chooses the queue</span>'}<button data-mp-action="comms" aria-label="Open party chat and voice">CHAT / VOICE</button>${group ? '<button data-mp-action="party-leave">LEAVE PARTY</button>' : ''}</div>${ltm(chosen) ? `<p class="mp-map-note">${escape(ltm(chosen).description)} · Ends ${escape(new Date(ltm(chosen).activeUntil).toLocaleString())}</p>` : ''}${mapChoiceHtml(chosen,queued)}${queued ? `<p class="mp-queue-state" role="status">${escape(snapshot.queue?.label || 'Finding '+(modes().find(([id])=>id === chosen)?.[1] || 'match'))} · You remain in this queue until matched or cancelled.</p>` : ''}<p data-mp-status data-error="${noticeError}" class="mp-status" role="status">${escape(notice)}</p>`;
  }
  function requestHtml(item, incoming) {
    const user = profile(item), id = item.requestId || item.id;
    return `<div class="mp-friend-row"><div><strong>${escape(user.username)}</strong><small>${incoming ? 'Wants to be your friend' : 'Request sent'}</small></div>${incoming ? `<button data-mp-action="friend-accept" data-request-id="${escape(id)}">Accept</button><button data-mp-action="friend-decline" data-request-id="${escape(id)}">Decline</button>` : ''}</div>`;
  }
  function friendHtml(item, searching = false) {
    const user = profile(item), id = identity(item), isFriend = (social().friends || []).some(value => identity(value) === id), isBlocked = blocked().has(id), requested = (social().outgoing || []).some(value => identity(value) === id);
    const activity = user.online ? (user.activity || 'Online') : 'Offline';
    return `<article class="mp-friend-row" data-friend-user="${escape(id)}">${iconHtml(user,32)}<div><strong>${escape(user.username)}</strong>${window.SARFactionsUI?.compact?.(user.faction,16)||''}<small><i class="mp-presence ${user.online ? 'online' : ''}" aria-hidden="true"></i>${escape(activity)} · Level ${Math.max(1,Number(user.level || 1))}</small></div><details class="mp-friend-actions"><summary aria-label="Actions for ${escape(user.username)}">•••</summary><div>${isBlocked ? `<button data-mp-action="unblock" data-user-id="${escape(id)}">Unblock</button>` : `${!isFriend && searching ? `<button data-mp-action="friend-request" data-user-id="${escape(id)}" ${requested ? 'disabled' : ''}>${requested ? 'Request sent' : 'Add friend'}</button>` : ''}${isFriend ? `<button data-mp-action="party-invite" data-user-id="${escape(id)}" ${!user.online || party() && !leader() ? 'disabled' : ''}>Invite to party</button>${user.partyId ? `<button data-mp-action="party-join" data-party-id="${escape(user.partyId)}">Join party</button>` : ''}${snapshot.factions?.faction?.permissions?.invite ? `<button data-mp-action="faction-invite" data-user-id="${escape(id)}">Invite to faction</button>` : ''}<button data-mp-action="friend-remove" data-user-id="${escape(id)}">Remove friend</button>` : ''}<button data-mp-action="block" data-user-id="${escape(id)}">Block</button><button data-mp-action="report-open" data-user-id="${escape(id)}">Report</button>`}</div></details></article>`;
  }
  function friendsHtml() {
    if (!self().id || !connected()) return '<div class="phone-empty"><h3>Friends is offline</h3><p>Connect to your account to manage friends and parties.</p><button data-mp-action="reconnect">Reconnect</button></div>';
    const data = social(), invites = data.partyInvites || [], friends = (data.friends || []).filter(item => !blocked().has(identity(item)));
    return `<section class="mp-friends"><form data-mp-search><label for="mpFriendSearch">FIND A PLAYER</label><div><input id="mpFriendSearch" name="query" type="search" value="${escape(searchText)}" placeholder="Username" minlength="2" maxlength="64" autocomplete="off" required><button type="submit">Search</button></div></form>${searchError ? '<p class="mp-status" data-error="true">'+escape(searchError)+'</p>' : ''}${searchText ? `<h3>SEARCH RESULTS</h3>${search.length ? search.map(item=>friendHtml(item,true)).join('') : '<p class="mp-empty">No matching players.</p>'}` : ''}${invites.length ? '<h3>PARTY INVITES</h3>'+invites.map(item=>`<div class="mp-friend-row"><div><strong>${escape(item.from?.username || item.sender?.username || item.leader?.username || 'Party invitation')}</strong><small>${escape(item.mode || 'Join this party')}</small></div><button data-mp-action="party-respond" data-invite-id="${escape(item.inviteId || item.id)}" data-accept="true">Join</button><button data-mp-action="party-respond" data-invite-id="${escape(item.inviteId || item.id)}" data-accept="false">Decline</button></div>`).join('') : ''}${data.incoming?.length ? '<h3>INCOMING REQUESTS</h3>'+data.incoming.map(item=>requestHtml(item,true)).join('') : ''}<h3>FRIENDS <span>${friends.length}</span></h3>${friends.length ? friends.slice().sort((a,b)=>Number(profile(b).online)-Number(profile(a).online)||String(profile(a).username).localeCompare(String(profile(b).username))).map(item=>friendHtml(item)).join('') : '<p class="mp-empty">Search for a player to add your first friend.</p>'}${data.outgoing?.length ? '<h3>SENT REQUESTS</h3>'+data.outgoing.map(item=>requestHtml(item,false)).join('') : ''}${data.blocked?.length ? '<details class="mp-blocked"><summary>Blocked players ('+data.blocked.length+')</summary>'+data.blocked.map(item=>friendHtml(item)).join('')+'</details>' : ''}${window.SARFactionsUI?.socialHtml?.()||''}<details class="mp-privacy"><summary>Privacy</summary><label><input type="checkbox" data-mp-privacy="showActivity" ${data.privacy?.showActivity !== false ? 'checked' : ''}> Show current activity to friends</label><label><input type="checkbox" data-mp-privacy="allowFriendRequests" ${data.privacy?.allowFriendRequests !== false ? 'checked' : ''}> Accept friend requests</label><label>Party joining<select data-mp-privacy="partyJoin"><option value="friends" ${data.privacy?.partyJoin === 'friends' ? 'selected' : ''}>Friends may join</option><option value="invite" ${data.privacy?.partyJoin !== 'friends' ? 'selected' : ''}>Invite only</option></select></label></details><p data-mp-status data-error="${noticeError}" class="mp-status" role="status">${escape(notice)}</p></section>`;
  }
  function chatMessages() {
    const source = snapshot.messages || snapshot.chat || [];
    const rows = Array.isArray(source) ? source : source[chatScope] || [];
    const roomId = chatScope === 'party' ? party()?.id : snapshot.match?.id;
    return rows.filter(message => (!message.scope || message.scope === chatScope) && (!message.scopeId || message.scopeId === roomId) && !blocked().has(message.userId || message.from?.id) && !chatMuted.has(message.userId || message.from?.id)).slice(-100);
  }
  function onlineProfileHtml() {
    const projection = snapshot.progression, summary = projection?.summary, records = (projection?.records || []).filter(row=>row.eligible);
    if(!projection)return '<div class="eyebrow">ONLINE RECORD</div><h2>'+escape(self().username || 'YOUR PROFILE')+'</h2><p class="meta-note">Your authenticated match record is still loading. Historical careers remain available in your Player Profile.</p>';
    const ratio = (a,b,percent = false)=>b ? (percent ? (100*a/b).toFixed(1)+'%' : (a/b).toFixed(2)) : a && !percent ? '∞' : '—';
    const totals = rows=>rows.reduce((value,row)=>{value.games++;if(row.won === true)value.wins++;if(row.won === false)value.losses++;for(const key of ['kills','deaths','assists','damage','shots','hits','headshots'])value[key] += Number(row.stats?.[key] || 0);return value;},{games:0,wins:0,losses:0,kills:0,deaths:0,assists:0,damage:0,shots:0,hits:0,headshots:0});
    const stats = value=>`<dl class="mp-record-stats">${[['GAMES',value.games],['WINS / LOSSES',value.wins+' / '+value.losses],['K / D / A',value.kills+' / '+value.deaths+' / '+value.assists],['K/D',ratio(value.kills,value.deaths)],['DAMAGE',Math.round(value.damage).toLocaleString()],['ACCURACY',ratio(value.hits,value.shots,true)],['HEADSHOTS',value.headshots],['WIN RATE',ratio(value.wins,value.games,true)]].map(([name,number])=>`<div><dt>${name}</dt><dd>${number}</dd></div>`).join('')}</dl>`;
    const sections = [...permanentModes().map(mode=>['CASUAL '+mode.label.toUpperCase(),row=>row.mode === mode.mode && row.kind === 'standard' && row.sessionType !== 'ltm']),['RANKED TDM',row=>row.mode === 'tdm' && row.kind === 'ranked'],['RANKED DEATHMATCH',row=>row.mode === 'deathmatch' && row.kind === 'ranked'],['LIMITED-TIME MODES',row=>row.sessionType === 'ltm'],['OFFICIAL TOURNAMENTS',row=>row.kind === 'official']];
    return `<div class="eyebrow">SERVER-VERIFIED ONLINE RECORD</div><h2>${escape(self().username)}</h2><div class="faction-profile-chip">${window.SARFactionsUI?.compact?.(self().faction||snapshot.factions?.self,24)||''}</div><p class="page-intro">${summary ? `LEVEL ${summary.xp.currentLevel} · ${escape(summary.ranked.rankName)} · ${summary.ranked.rating.toLocaleString()} ELO` : 'Current progression is loading.'}</p><p class="meta-note">Human multiplayer results shown here are resolved once by the match server. Historical careers are preserved in Player Profile. Custom and practice matches are excluded.</p><h3>COMBINED ONLINE</h3>${stats(totals(records))}<div class="mp-record-modes">${sections.map(([name,filter])=>`<section><h3>${name}</h3>${stats(totals(records.filter(filter)))}</section>`).join('')}</div><h3>RECENT ONLINE MATCHES</h3>${records.length ? `<div class="mp-record-history">${records.slice(-15).reverse().map(row=>`<div><strong>${row.won === true ? 'WIN' : row.won === false ? 'LOSS' : 'DRAW'}</strong><span>${escape(row.kind === 'ranked' ? 'Ranked ' : row.sessionType === 'ltm' ? 'Limited-time ' : row.kind === 'official' ? 'Official tournament · ' : 'Casual ')}${escape(window.SARModeRules?.get?.(row.mode)?.label || permanentModes().find(mode=>mode.mode===row.mode)?.label || row.mode)} · ${row.stats.kills} / ${row.stats.deaths} / ${row.stats.assists}</span><small>${escape(new Date(row.at).toLocaleString())}</small></div>`).join('')}</div>` : '<p class="meta-note">Complete an eligible online match to start this record.</p>'}`;
  }
  function showOnlineProfile() {window.SAR?.preparePanel?.();window.SAR?.showPanel?.(onlineProfileHtml(),'online-profile');}
  function chatHtml() {
    const scopes = party() ? ['party'] : [];if(snapshot.match)scopes.push('match',...(teamMode() ? ['team'] : []));
    if(!scopes.includes(chatScope))chatScope=scopes[0] || 'party';
    return `<header class="mp-comms-head"><strong>CHAT &amp; VOICE</strong><button data-mp-action="close-comms" aria-label="Close chat and voice">×</button></header><div class="mp-chat-tabs" role="tablist" aria-label="Chat channel">${scopes.map(scope=>`<button data-mp-action="chat-scope" data-scope="${scope}" role="tab" aria-selected="${chatScope === scope}">${scope.toUpperCase()}</button>`).join('')}</div><ol class="mp-chat-log" aria-label="${chatScope} chat" aria-live="polite">${chatMessages().map(message=>`<li><span><strong>${escape(message.username || message.from?.username || 'Player')}</strong><small>${message.createdAt ? escape(new Date(message.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})) : ''}</small></span><p>${escape(message.text)}</p>${(message.userId || message.from?.id) !== self().id ? `<details><summary aria-label="Player chat controls">•••</summary><div><button data-mp-action="chat-mute" data-user-id="${escape(message.userId || message.from?.id)}">Mute player</button><button data-mp-action="block" data-user-id="${escape(message.userId || message.from?.id)}">Block player</button><button data-mp-action="report-open" data-user-id="${escape(message.userId || message.from?.id)}" data-chat-id="${escape(message.id)}">Report</button></div></details>` : ''}</li>`).join('') || '<li class="mp-empty">'+(scopes.length ? 'No chat in this channel yet.' : 'Create a party or enter an online match to chat.')+'</li>'}</ol><form data-mp-chat><label class="mp-visually-hidden" for="mpChatText">Send ${chatScope} chat</label><input id="mpChatText" name="text" type="text" maxlength="500" autocomplete="off" placeholder="${chatScope === 'team' ? 'Your team' : chatScope === 'match' ? 'Match' : 'Party'} chat" ${!scopes.length || !connected() ? 'disabled' : ''}><button type="submit" ${!scopes.length || !connected() ? 'disabled' : ''}>SEND</button></form>${voiceHtml()}<p data-mp-status data-error="${noticeError}" class="mp-status" role="status">${escape(notice)}</p>`;
  }
  function renderComms() {
    const host = document.getElementById('multiplayerComms');if (!host) return;
    host.hidden = !chatOpen;if (!chatOpen) return;
    const people = [...members(),...(social().friends || []),...(snapshot.match?.roster || [])];
    const mutedHtml = chatMuted.size ? '<details class="mp-text-mutes"><summary>Muted text players ('+chatMuted.size+')</summary>'+[...chatMuted].map(id=>{const user = people.find(row=>row.id === id || row.userId === id);return '<div><span>'+escape(user?.username || user?.name || 'Player')+'</span><button data-mp-action="chat-unmute" data-user-id="'+escape(id)+'">UNMUTE TEXT</button></div>';}).join('')+'</details>' : '';
    const oldScope = host.dataset.scope, html = chatHtml()+mutedHtml;if(host.dataset.markup === html){updateVoiceLabel();return;}host.dataset.markup = html;host.dataset.scope = chatScope;
    const active = host.contains(document.activeElement) ? document.activeElement : null;
    const focusSelector = active?.id ? '#'+CSS.escape(active.id) : active?.dataset.mpVoice ? '[data-mp-voice="'+CSS.escape(active.dataset.mpVoice)+'"]' : active?.dataset.mpVoiceUser ? '[data-mp-voice-user="'+CSS.escape(active.dataset.mpVoiceUser)+'"]' : active?.dataset.mpAction ? '[data-mp-action="'+CSS.escape(active.dataset.mpAction)+'"]' : null;
    const value = host.querySelector('#mpChatText')?.value || '';
    host.innerHTML = html;
    if(oldScope === chatScope)host.querySelector('#mpChatText').value = value;
    if(focusSelector)host.querySelector(focusSelector)?.focus({preventScroll:true});
    const log = host.querySelector('.mp-chat-log');if(log)log.scrollTop = log.scrollHeight;
    updateVoiceLabel();
  }
  function render() {
    const host = document.getElementById('multiplayerParty');if(!host)return;
    // Presence changes do not replace a control while it is being operated.
    if(!host.contains(document.activeElement) || !document.activeElement?.matches('input,select,textarea')){const html = partyHtml();if(host.dataset.markup !== html){const active=host.contains(document.activeElement)?document.activeElement:null,focusSelector=active?.dataset.mpAction?'[data-mp-action="'+CSS.escape(active.dataset.mpAction)+'"]'+(active.dataset.mapId?'[data-map-id="'+CSS.escape(active.dataset.mapId)+'"]':''):null;host.dataset.markup = html;host.innerHTML = html;if(self().id){const button = document.createElement('button');button.className = 'mp-record-button';button.dataset.mpAction = 'online-profile';button.textContent = 'ONLINE RECORD';host.querySelector('.mp-party-title')?.append(button);}if(focusSelector)host.querySelector(focusSelector)?.focus({preventScroll:true});}if(document.getElementById('menu')?.classList.contains('visible'))paintIcons(host);}
    if(chatOpen && !document.getElementById('multiplayerComms')?.contains(document.activeElement))renderComms();
  }
  function acceptState(next) {
    const nextOwner = next?.social?.self?.id || next?.account?.id || window.SARCloud?.state?.account?.id || null;
    if(nextOwner !== owner){owner = nextOwner;search = [];searchText = '';searchError = '';searchSequence++;notice = '';noticeError = false;soloMode = 'casual-tdm';customMapId = 'brightfield-blocks';chatMuted.clear();stopVoice();voiceSettings = readVoiceSettings();chatOpen = false;const panel = document.getElementById('multiplayerComms');if(panel){panel.replaceChildren();delete panel.dataset.markup;delete panel.dataset.scope;panel.hidden = true;}}
    snapshot = next || {};
    for(const mute of social().mutes || []){if(mute.scope === 'text'){if(mute.muted)chatMuted.add(mute.userId);else chatMuted.delete(mute.userId);}if(mute.scope === 'voice')voiceSettings.volumes[mute.userId] = mute.muted ? 0 : Math.max(0,Math.min(1,Number(mute.volume ?? 1)));}
    for(const[id,peer]of peers)peer.audio.volume = voiceSettings.volumes[id] ?? 1;
    reconcileVoice();render();
    const profileHost = document.querySelector('#modal.visible #modalContent[data-view="online-profile"]');if(profileHost)profileHost.innerHTML = onlineProfileHtml();
  }
  function openComms(options = {}) {chatOpen = true;voiceOptionsOpen = !!options.voice;window.SAR?.preparePanel?.();renderComms();if(connected() && (party() || snapshot.match))void action('chat-history',{scope:chatScope}).catch(()=>{});}
  async function perform(element) {
    const type = element.dataset.mpAction, id = element.dataset.userId;
    if(type === 'friends'){window.SARPhone?.open?.('friends');return;}
    if(type === 'online-profile'){showOnlineProfile();return;}
    if(type === 'faction-invite'){try{await window.SARFactionsUI.invite(id);status('Faction invitation sent.');}catch(error){status(error.message,true);throw error;}return;}
    if(type === 'comms'){openComms();return;}
    if(type === 'close-comms'){chatOpen = false;document.getElementById('multiplayerComms').hidden = true;return;}
    if(type === 'chat-scope'){chatScope = element.dataset.scope;renderComms();void action('chat-history',{scope:chatScope}).catch(()=>{});return;}
    if(type === 'voice-settings'){voiceOptionsOpen = !voiceOptionsOpen;renderComms();return;}
    if(type === 'voice-enable'){await startVoice();renderComms();return;}
    if(type === 'voice-disable'){stopVoice();voiceSettings.disabled = true;saveVoiceSettings();renderComms();return;}
    if(type === 'voice-mute'){voiceSettings.muted = !voiceSettings.muted;saveVoiceSettings();applyPTT();renderComms();return;}
    if(type === 'reconnect'){await network()?.reconnect?.();return;}
    if(type === 'queue'){await action('queue',{mode:chosenMode()});return;}
    if(type === 'custom'){await action('custom',{config:{mode:baseMode(chosenMode()),mapId:customMapId}});return;}
    if(type === 'map-vote'){await action('map-vote',{voteId:element.dataset.voteId,mapId:element.dataset.mapId});return;}
    if(type === 'cancel-queue'){await action('cancel-queue');return;}
    if(type === 'party-create'){await action('party-create');if(soloMode !== 'casual-tdm')await action('party-mode',{mode:soloMode});return;}
    if(type === 'report-open'){showReport(id,element.dataset.chatId);return;}
    if(type === 'chat-mute'){chatMuted.add(id);await action('mute',{userId:id,scope:'text',muted:true});renderComms();return;}
    if(type === 'chat-unmute'){chatMuted.delete(id);await action('mute',{userId:id,scope:'text',muted:false});renderComms();return;}
    const payload = id ? {userId:id} : {};
    if(element.dataset.requestId)payload.requestId = element.dataset.requestId;
    if(element.dataset.partyId)payload.partyId = element.dataset.partyId;
    if(element.dataset.inviteId)payload.inviteId = element.dataset.inviteId;
    if(element.dataset.accept)payload.accept = element.dataset.accept === 'true';
    if(element.dataset.ready)payload.ready = element.dataset.ready === 'true';
    await action(type,payload);window.SARPhone?.refresh?.();
  }
  function showReport(userId,chatId) {
    openComms();
    const host = document.getElementById('multiplayerComms');
    const report = document.createElement('form');report.className = 'mp-report';report.dataset.mpReport = userId;if(chatId)report.dataset.chatId = chatId;
    report.innerHTML = '<label>REPORT PLAYER<select name="reason"><option value="harassment">Harassment</option><option value="cheating">Suspected cheating</option><option value="hate">Hate speech</option><option value="spam">Spam</option><option value="other">Other</option></select></label><button type="submit">SEND REPORT</button><button type="button" data-mp-action="report-cancel">CANCEL</button>';
    host.append(report);report.querySelector('select').focus();
  }
  document.addEventListener('click',event => {
    const element = event.target.closest('[data-mp-action]');if(!element)return;
    event.preventDefault();
    if(element.dataset.mpAction === 'report-cancel'){element.closest('.mp-report')?.remove();return;}
    if(pending)return;
    pending = true;void perform(element).catch(()=>{}).finally(()=>{pending = false;render();});
  });
  document.addEventListener('submit',event => {
    const form = event.target;
    if(!form.matches('[data-mp-search],[data-mp-chat],[data-mp-report]'))return;
    event.preventDefault();
    if(form.hasAttribute('data-mp-search')) {
      const query = String(new FormData(form).get('query') || '').trim(), serial = ++searchSequence;if(query.length < 2)return;
      searchText = query;searchError = '';
      void action('friend-search',{q:query}).then(result=>{if(serial !== searchSequence)return;search = Array.isArray(result) ? result : result.players || result.users || result.results || [];window.SARPhone?.refresh?.();paintIcons(document.querySelector('.phone-app'));}).catch(error=>{if(serial === searchSequence){searchError = error.message;window.SARPhone?.refresh?.();}});
    } else if(form.hasAttribute('data-mp-chat')) {
      const input = form.querySelector('input'), text = input.value.trim();if(!text)return;
      input.disabled = true;void action('chat',{scope:chatScope,text}).then(()=>{input.value = '';}).finally(()=>{input.disabled = false;input.focus();renderComms();}).catch(()=>{});
    } else {
      void action('report',{userId:form.dataset.mpReport,reason:String(new FormData(form).get('reason')),chatId:form.dataset.chatId}).then(()=>{form.remove();status('Report received.');}).catch(()=>{});
    }
  });
  document.addEventListener('change',event => {
    const element = event.target;
    if(element.matches('[data-mp-mode]')){soloMode = element.value;if(party())void action('party-mode',{mode:element.value}).catch(()=>{element.value = chosenMode();});else{element.blur();render();}}
    if(element.matches('[data-mp-custom-map]'))customMapId = element.value;
    if(element.dataset.mpPrivacy){const key = element.dataset.mpPrivacy;void action('privacy',{...social().privacy,[key]:element.type === 'checkbox' ? element.checked : element.value}).catch(()=>{});}
    if(element.dataset.mpVoice){const key = element.dataset.mpVoice;voiceSettings[key] = element.type === 'checkbox' ? element.checked : element.value;saveVoiceSettings();if(key === 'disabled' && element.checked)stopVoice();if(key === 'scope'){closePeers();reconcileVoice();}if(key === 'inputDevice' && stream)void restartMic();if(key === 'outputDevice')void applyOutput();renderComms();}
    if(element.dataset.mpVoiceUser){const id = element.dataset.mpVoiceUser,value = Math.max(0,Math.min(1,Number(element.value)/100));voiceSettings.volumes[id] = value;saveVoiceSettings();const peer = peers.get(id);if(peer?.audio)peer.audio.volume = value;void action('mute',{userId:id,scope:'voice',muted:value === 0,volume:value}).catch(()=>{});}
  });

  // Voice is separate from gameplay/chat. Microphone capture starts only after
  // the player explicitly opts in; every track starts disabled for push-to-talk.
  let stream = null, voiceGeneration = 0, voiceSession = '', voiceEnabled = false, heldPTT = false, voiceFailure = '', devices = [], iceServers = [], voiceSettings = defaultVoiceSettings();
  const peers = new Map();
  function defaultVoiceSettings(){return {disabled:true,muted:false,ptt:'KeyV',scope:'party',inputDevice:'',outputDevice:'',volumes:{}};}
  function storageKey(){return owner ? 'sar-human-voice-v1:'+owner : null;}
  function readVoiceSettings(){try{const value = storageKey() && JSON.parse(localStorage.getItem(storageKey()) || 'null');return {...defaultVoiceSettings(),...(value || {}),volumes:value?.volumes && typeof value.volumes === 'object' ? value.volumes : {}};}catch{return defaultVoiceSettings();}}
  function saveVoiceSettings(){if(storageKey())try{localStorage.setItem(storageKey(),JSON.stringify(voiceSettings));}catch{status('Voice preference could not be saved on this device.',true);}}
  function voiceUsers(){
    if(voiceSettings.scope !== 'team')return members();if(!teamMode())return [];
    const roster = snapshot.match?.roster || [], people = snapshot.match?.voicePeers || roster.filter(user => user.team === snapshot.match.team && (user.userId || user.networkHuman));
    return people.map(user=>{if(typeof user !== 'string')return {...user,username:user.username || user.name};const row = roster.find(item=>item.userId === user || item.id === user);return {...row,id:user,userId:user,username:row?.username || row?.name || (social().friends || []).find(item=>item.id === user)?.username || 'Player'};});
  }
  function authorizedVoice(id){return !!id && id !== self().id && !blocked().has(id) && voiceUsers().some(user => (typeof user === 'string' ? user : user.userId || user.id) === id);}
  function permittedIds(){return voiceUsers().map(user => typeof user === 'string' ? user : user.userId || user.id).filter(authorizedVoice);}
  function voiceHtml(){
    const available = !!window.RTCPeerConnection && !!navigator.mediaDevices?.getUserMedia;
    return `<section class="mp-voice"><div class="mp-voice-toolbar"><strong>VOICE</strong><span id="mpVoiceState">${escape(voiceFailure || (voiceEnabled ? 'Push to talk · '+voiceSettings.ptt.replace('Key','') : 'OFF'))}</span><button data-mp-action="${voiceEnabled ? 'voice-disable' : 'voice-enable'}" ${!available || !connected() ? 'disabled' : ''}>${voiceEnabled ? 'DISCONNECT' : 'ENABLE'}</button>${voiceEnabled ? `<button data-mp-action="voice-mute" aria-pressed="${voiceSettings.muted}">${voiceSettings.muted ? 'UNMUTE MIC' : 'MUTE MIC'}</button><button data-mp-ptt aria-label="Hold to talk" ${voiceSettings.muted ? 'disabled' : ''}>HOLD TO TALK</button>` : ''}<button data-mp-action="voice-settings" aria-expanded="${voiceOptionsOpen}">SETTINGS</button></div>${!available ? '<p class="mp-empty">Voice capture is not available in this browser.</p>' : ''}${voiceOptionsOpen ? `<div class="mp-voice-settings"><label><input type="checkbox" data-mp-voice="disabled" ${voiceSettings.disabled ? 'checked' : ''}> Voice disabled</label><label>CHANNEL<select data-mp-voice="scope"><option value="party" ${voiceSettings.scope === 'party' ? 'selected' : ''}>Party voice</option>${teamMode() ? `<option value="team" ${voiceSettings.scope === 'team' ? 'selected' : ''}>Team voice</option>` : ''}</select></label><label>PUSH TO TALK<select data-mp-voice="ptt">${[['KeyV','V'],['KeyB','B'],['KeyN','N'],['F9','F9']].map(([id,name])=>`<option value="${id}" ${voiceSettings.ptt === id ? 'selected' : ''}>${name}</option>`).join('')}</select></label><label>MICROPHONE<select data-mp-voice="inputDevice"><option value="">System default</option>${devices.filter(item=>item.kind === 'audioinput').map((item,index)=>`<option value="${escape(item.deviceId)}" ${voiceSettings.inputDevice === item.deviceId ? 'selected' : ''}>${escape(item.label || 'Microphone '+(index+1))}</option>`).join('')}</select></label><label>OUTPUT<select data-mp-voice="outputDevice" ${!HTMLMediaElement.prototype.setSinkId ? 'disabled' : ''}><option value="">System default</option>${devices.filter(item=>item.kind === 'audiooutput').map((item,index)=>`<option value="${escape(item.deviceId)}" ${voiceSettings.outputDevice === item.deviceId ? 'selected' : ''}>${escape(item.label || 'Output '+(index+1))}</option>`).join('')}</select></label><p class="mp-empty">Microphone access is requested only when you enable voice. Release push-to-talk to stop transmitting.${HTMLMediaElement.prototype.setSinkId ? '' : ' Output follows your system device.'}</p>${voiceUsers().filter(user=>typeof user !== 'string' && (user.userId || user.id) !== self().id && !blocked().has(user.userId || user.id)).map(user=>`<label>${escape(user.username || 'Player')}<input type="range" min="0" max="100" value="${Math.round((voiceSettings.volumes[user.userId || user.id] ?? 1)*100)}" data-mp-voice-user="${escape(user.userId || user.id)}" aria-label="${escape(user.username || 'Player')} voice volume; zero mutes"></label>`).join('')}</div>` : ''}</section>`;
  }
  async function startVoice(){
    if(!self().id || !connected())throw new Error('Connect before enabling voice.');
    if(!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection)throw new Error('Voice is unavailable in this browser.');
    stopVoice();const generation = ++voiceGeneration,currentOwner = owner;voiceFailure = '';
    try{
      const config = await window.SARCloud.api('/multiplayer/voice-config');
      if(config.enabled === false)throw new Error(config.message || 'Voice is unavailable on this server.');
      iceServers = Array.isArray(config.iceServers) ? config.iceServers : [];
      const acquired = await navigator.mediaDevices.getUserMedia({audio:voiceSettings.inputDevice ? {deviceId:{exact:voiceSettings.inputDevice},echoCancellation:true,noiseSuppression:true,autoGainControl:true} : {echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      if(generation !== voiceGeneration || currentOwner !== owner || !connected()){acquired.getTracks().forEach(track=>track.stop());return;}
      stream = acquired;stream.getAudioTracks().forEach(track=>track.enabled = false);voiceSession = crypto.randomUUID();voiceEnabled = true;voiceSettings.disabled = false;saveVoiceSettings();devices = await navigator.mediaDevices.enumerateDevices();reconcileVoice();status('Voice enabled. Hold '+voiceSettings.ptt.replace('Key','')+' to talk.');
    }catch(error){if(generation === voiceGeneration){stopVoice();voiceFailure = error.name === 'NotAllowedError' ? 'Microphone permission was denied.' : error.message;status(voiceFailure,true);}throw error;}
  }
  function closePeer(id){const peer = peers.get(id);if(!peer)return;peers.delete(id);peer.pc.ontrack = peer.pc.onicecandidate = peer.pc.onnegotiationneeded = null;peer.pc.close();peer.audio.pause();peer.audio.srcObject = null;peer.audio.remove();}
  function closePeers(){for(const id of [...peers.keys()])closePeer(id);}
  function stopVoice(){voiceGeneration++;heldPTT = false;voiceEnabled = false;voiceSession = '';stream?.getTracks().forEach(track=>track.stop());stream = null;closePeers();updateVoiceLabel();}
  function applyPTT(){const transmitting = voiceEnabled && heldPTT && !voiceSettings.muted && !voiceSettings.disabled && connected() && !document.hidden && permittedIds().length > 0;stream?.getAudioTracks().forEach(track=>track.enabled = transmitting);updateVoiceLabel();}
  function updateVoiceLabel(){const label = document.getElementById('mpVoiceState');if(label)label.textContent = voiceFailure || (voiceEnabled ? voiceSettings.muted ? 'MIC MUTED' : stream?.getAudioTracks().some(track=>track.enabled) ? 'TRANSMITTING' : 'Push to talk · '+voiceSettings.ptt.replace('Key','') : 'OFF');}
  function reconcileVoice(){if(!voiceEnabled)return;if(!connected() || !self().id){stopVoice();return;}if(voiceSettings.scope === 'team' && !teamMode()){voiceSettings.scope = 'party';closePeers();}const ids = new Set(permittedIds());for(const id of peers.keys())if(!ids.has(id))closePeer(id);for(const id of ids)if(!peers.has(id))makePeer(id);applyPTT();}
  async function applyOutput(){for(const peer of peers.values())if(peer.audio.setSinkId)try{await peer.audio.setSinkId(voiceSettings.outputDevice || '');}catch(error){status('The selected output device is unavailable: '+error.message,true);}}
  async function restartMic(){try{await startVoice();renderComms();}catch{renderComms();}}
  function makePeer(id){
    if(!voiceEnabled || !authorizedVoice(id) || peers.has(id))return peers.get(id);
    const audio = document.createElement('audio');audio.autoplay = true;audio.volume = Number(voiceSettings.volumes[id] ?? 1);audio.dataset.mpVoicePeer = id;document.body.append(audio);
    const peer = {pc:new RTCPeerConnection({iceServers}),audio,candidates:[],remoteSession:null,descriptions:{},signals:Promise.resolve(),makingOffer:false,ignoreOffer:false,settingAnswer:false,polite:String(self().id).localeCompare(String(id)) > 0,generation:voiceGeneration};peers.set(id,peer);
    for(const track of stream.getTracks())peer.pc.addTrack(track,stream);
    const signal = payload => authorizedVoice(id) && peer.generation === voiceGeneration && peers.get(id) === peer && action('voice',{to:id,scope:voiceSettings.scope,sessionId:voiceSession,...payload});
    peer.pc.onicecandidate = event=>{if(event.candidate)void Promise.resolve(signal({candidate:event.candidate.toJSON()})).catch(()=>{});};
    peer.pc.ontrack = event=>{if(!authorizedVoice(id)){closePeer(id);return;}audio.srcObject = event.streams[0];void audio.play().catch(()=>{status('Click Voice to allow incoming audio playback.');});void applyOutput();};
    peer.negotiate = async()=>{if(peer.polite || !peer.remoteSession || peer.makingOffer || peer.pc.signalingState !== 'stable' || peers.get(id) !== peer)return;try{peer.makingOffer = true;await peer.pc.setLocalDescription();await signal({description:peer.pc.localDescription});}catch(error){if(peers.get(id) === peer)status('Voice connection could not be negotiated.',true);}finally{peer.makingOffer = false;}};
    peer.pc.onnegotiationneeded = peer.negotiate;
    peer.pc.onconnectionstatechange = ()=>{if(peer.pc.connectionState === 'failed'){closePeer(id);status('A voice connection failed. Re-enable voice to reconnect.',true);}};
    peer.announce = ()=>{void Promise.resolve(signal({ready:voiceSession})).catch(()=>{});};peer.announce();return peer;
  }
  async function receiveVoice(message){
    const id = message?.from;if(!voiceEnabled || message.scope !== voiceSettings.scope || !authorizedVoice(id))return;
    let peer = peers.get(id);
    if(message.ready){if(peer?.remoteSession && peer.remoteSession !== message.ready){closePeer(id);peer = null;}peer ??= makePeer(id);if(peer){const changed = peer.remoteSession !== message.ready;peer.remoteSession = message.ready;if(changed)peer.announce();void peer.negotiate();}return;}
    if(!peer || !message.sessionId || message.sessionId !== peer.remoteSession)return;
    // Glare recovery can resend an offer while its answer is in flight. Applying
    // that same SDP twice rolls back ICE gathering; each peer processes it once.
    peer.signals = peer.signals.then(async()=>{if(peer.generation !== voiceGeneration || peers.get(id) !== peer || !authorizedVoice(id))return;try{
      if(message.description){const description = message.description;if(peer.descriptions[description.type] === description.sdp)return;peer.descriptions[description.type] = description.sdp;const ready = !peer.makingOffer && (peer.pc.signalingState === 'stable' || peer.settingAnswer),collision = description.type === 'offer' && !ready;peer.ignoreOffer = !peer.polite && collision;if(peer.ignoreOffer)return;peer.settingAnswer = description.type === 'answer';await peer.pc.setRemoteDescription(description);peer.settingAnswer = false;for(const candidate of peer.candidates.splice(0))await peer.pc.addIceCandidate(candidate);if(description.type === 'offer'){await peer.pc.setLocalDescription();await action('voice',{to:id,scope:voiceSettings.scope,sessionId:voiceSession,description:peer.pc.localDescription});}}
      else if(message.candidate){if(peer.pc.remoteDescription)await peer.pc.addIceCandidate(message.candidate);else peer.candidates.push(message.candidate);}
    }catch(error){peer.settingAnswer = false;if(!peer.ignoreOffer && authorizedVoice(id))status('Voice connection could not be completed.',true);}});
    await peer.signals;
  }
  const releasePTT = ()=>{heldPTT = false;applyPTT();};
  window.addEventListener('keydown',event=>{if(!voiceEnabled || event.code !== voiceSettings.ptt || isTyping())return;event.preventDefault();event.stopImmediatePropagation();if(!event.repeat){heldPTT = true;applyPTT();}},true);
  window.addEventListener('keyup',event=>{if(event.code !== voiceSettings.ptt)return;if(voiceEnabled){event.preventDefault();event.stopImmediatePropagation();}releasePTT();},true);
  document.addEventListener('pointerdown',event=>{if(event.target.closest('[data-mp-ptt]')){event.preventDefault();heldPTT = true;applyPTT();}});
  window.addEventListener('pointerup',releasePTT);window.addEventListener('pointercancel',releasePTT);window.addEventListener('blur',releasePTT);
  document.addEventListener('visibilitychange',()=>{releasePTT();if(!document.hidden)render();});window.addEventListener('pagehide',stopVoice);
  window.addEventListener('sar:multiplayer-voice',event=>{void receiveVoice(event.detail);});
  window.addEventListener('sar:multiplayer-state',event=>{if(!subscribed)acceptState(event.detail || network()?.state?.() || {});});
  window.addEventListener('sar:multiplayer-chat',()=>{if(chatOpen)renderComms();});
  navigator.mediaDevices?.addEventListener?.('devicechange',()=>{if(!voiceEnabled)return;void navigator.mediaDevices.enumerateDevices().then(value=>{devices = value;renderComms();}).catch(()=>{});});
  const comms = document.createElement('aside');comms.id = 'multiplayerComms';comms.className = 'mp-comms';comms.hidden = true;comms.setAttribute('aria-label','Online chat and voice');document.body.append(comms);
  const poll = setInterval(()=>{if(network() && !subscribed){subscribed = true;network().subscribe(acceptState);acceptState(network().state());}if(!document.hidden && document.getElementById('menu')?.classList.contains('visible'))render();},500);
  window.SARMultiplayerUI = {friendsHtml,paintFriends:()=>paintIcons(document.querySelector('.phone-app')),openVoiceSettings:()=>openComms({voice:true}),openChat:openComms,voiceState:()=>({enabled:voiceEnabled,disabled:voiceSettings.disabled,muted:voiceSettings.muted,transmitting:!!stream?.getAudioTracks().some(track=>track.enabled),scope:voiceSettings.scope,peers:[...peers.keys()],connections:[...peers].map(([id,peer])=>({id,state:peer.pc.connectionState}))}),async voiceDiagnostics(){return Promise.all([...peers].map(async([id,peer])=>{const stats=await peer.pc.getStats();let sent=0,received=0;stats.forEach(value=>{if(value.type==='outbound-rtp'&&value.kind==='audio')sent+=value.bytesSent||0;if(value.type==='inbound-rtp'&&value.kind==='audio')received+=value.bytesReceived||0;});return {id,state:peer.pc.connectionState,sent,received};}));},isPTTEvent:event=>voiceEnabled && event.code === voiceSettings.ptt,stopVoice,destroy(){clearInterval(poll);stopVoice();comms.remove();}};
  render();
})();
