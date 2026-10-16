// Keep startup errors visible even when an imported module cannot initialize.
const startupError=error=>{
 const message=`Replay could not start: ${error.message}. Click Reload catalog to retry.`;
 const status=document.getElementById('catalog-status');
 status.textContent=message;
 document.getElementById('replay-select').replaceChildren(new Option('Loading failed',''));
 const banner=document.getElementById('error');banner.textContent=message;banner.hidden=false;
 document.getElementById('catalog-reload').onclick=()=>location.reload();
};
let startupTimer;
Promise.race([
 import('./app.mjs?v=754b0258aff5fda6'),
 new Promise((_,reject)=>{startupTimer=setTimeout(()=>reject(new Error('Startup timed out')),25000);})
]).catch(startupError).finally(()=>clearTimeout(startupTimer));
