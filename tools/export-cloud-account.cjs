'use strict';
// node tools/export-cloud-account.cjs <retained-source.sqlite> <private-output.json.gz>
// The export contains credential HASHES and must stay outside the repository.
const fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const {exportSnapshot}=require('../server/cloud-bootstrap.cjs');
const root=path.resolve(__dirname,'..');
function exportFile(sourceArg,outputArg){
 if(!sourceArg||!outputArg)throw Error('Specify the retained source database and a private output file outside the project');
 const source=fs.realpathSync(path.resolve(sourceArg)),output=path.resolve(outputArg),parent=path.dirname(output);
 fs.mkdirSync(parent,{recursive:true});const physicalParent=fs.realpathSync(parent),physicalOutput=path.join(physicalParent,path.basename(output));
 if(physicalOutput===source||physicalOutput===root||physicalOutput.startsWith(root+path.sep)||physicalOutput.toLowerCase().startsWith(root.toLowerCase()+path.sep))throw Error('The private export must be outside the project and cannot replace the source database');
 const db=new DatabaseSync(source,{readOnly:true});let snapshot;try{snapshot=exportSnapshot(db,{sourcePath:source});}finally{db.close();}
 const fd=fs.openSync(physicalOutput,'wx',0o600);try{fs.writeFileSync(fd,snapshot.compressed);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 if(!fs.readFileSync(physicalOutput).equals(snapshot.compressed))throw Error('The private export did not pass read-back verification');
 return {file:physicalOutput,bytes:snapshot.compressed.length,expandedBytes:snapshot.raw.length,sha256:snapshot.sha256,compressedSha256:snapshot.compressedSha256,accounts:snapshot.packageData.tables.users.length,worlds:snapshot.packageData.tables.worlds.length,tables:Object.keys(snapshot.packageData.tables).length,omissions:snapshot.packageData.manifest.omissions.map(row=>({table:row.table,rows:row.rows}))};
}
if(require.main===module){try{const result=exportFile(process.argv[2],process.argv[3]);console.log(JSON.stringify({ok:true,...result}));}catch(error){console.error('Private cloud export failed: '+error.message);process.exitCode=1;}}
module.exports={exportFile};
