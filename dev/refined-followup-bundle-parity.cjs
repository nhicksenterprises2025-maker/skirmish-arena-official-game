'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),bundle=path.join(root,'launcher/backend-bundle');
const files=['game.js','cloud.js','tournaments-ui.js','profile-stats.js','theme.css','refined-ui.css','phone-apps.css','skyline-tournaments.css','skyline.css','index.html','manifest.webmanifest','build-meta.js','version.json','sw.js','desktop-launch.js','server/index.cjs','server/db.cjs','server/tournaments.cjs','server/tournament-lifecycle.cjs','server/tournament-runtime.cjs','server/tournament-schedule.cjs','server/tournament-presentation.cjs','server/tournament-reset.cjs','server/profile-participations.cjs','server/startup-status.cjs','server/migrations/011_tournament_reliability_reset.sql'];
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const file of files)assert.equal(hash(path.join(root,file)),hash(path.join(bundle,file)),'Compiled backend must contain the final source: '+file);
console.log('PASS exact final-source parity for'+files.length+' installed shell/backend assets');
