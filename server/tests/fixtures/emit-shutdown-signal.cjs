'use strict';
// Windows child.kill terminates the process without executing Node signal
// handlers. This test-only IPC preload invokes the production handler instead.
if(process.env.SAR_SHUTDOWN_TEST==='1')process.on('message',message=>{
 if(message?.type==='fixture-signal'&&['SIGTERM','SIGINT'].includes(message.signal))process.emit(message.signal);
});
