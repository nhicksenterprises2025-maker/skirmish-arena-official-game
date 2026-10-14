'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),result=spawnSync(process.execPath,['dev/cosmetic-content-poses-check.mjs'],{cwd:root,stdio:'inherit'});if(result.status!==0)throw Error('Victory rig validation failed');
const file='assets/25d/cosmetics/victory-poses.json',bytes=fs.readFileSync(path.join(root,file)),poses=JSON.parse(bytes).poses,manifestFile=path.join(root,'assets/25d/cosmetics/content-manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestFile));
for(const pose of ['quiet-confidence','arms-folded','weapon-rest','champion-stance','tactical-ready','over-the-shoulder']){if(!poses[pose])throw Error('Missing '+pose);manifest.content['victory-pose.'+pose]={kind:'victory-pose',pose,verified:true,file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};}
manifest.version='cosmetic-content-'+crypto.createHash('sha256').update(JSON.stringify(manifest.content)).digest('hex').slice(0,12);manifest.presentationPoseSource=file;
fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');console.log('Registered six validated victory poses.');
