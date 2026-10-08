'use strict';
// An isolated, opt-in browser verification account; never uses the installed database.
const path=require('node:path'),os=require('node:os'),bcrypt=require('bcryptjs');
const {createDatabase}=require('../server/db.cjs'),{writeWorld}=require('../server/world.cjs'),{createServer}=require('../server/index.cjs'),{engine}=require('./simulate.cjs');
const file=path.join(os.tmpdir(),'sar-ui-1.5.2.sqlite'),db=createDatabase(file),id='ui-verify-152';
if(!db.prepare('SELECT 1 FROM users WHERE id=?').get(id)){const now=Date.now();db.prepare('INSERT INTO users(id,username,username_key,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,'UI_verify_152','ui_verify_152',bcrypt.hashSync('Verification-game-152',10),now,now);writeWorld(db,id,engine().context.SAR.getUniverse(),0);}
const {server}=createServer({db});server.listen(8804,'127.0.0.1',()=>console.log('Isolated UI check ready on 127.0.0.1:8804.'));
process.on('SIGINT',()=>server.close(()=>{db.close();process.exit(0);}));
