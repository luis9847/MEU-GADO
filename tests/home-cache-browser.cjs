const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');

const worker=fs.readFileSync(path.join(__dirname,'../sw-meu-gado.js'),'utf8');
const currentCache=worker.match(/const MG_CACHE='([^']+)'/)[1];
const legacy=`
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
 if(e.request.mode!=='navigate'||new URL(e.request.url).pathname!=='/')return;
 e.respondWith(caches.open('meu-gado-oficial-modo-campo-legacy-test').then(async cache=>{
  const hit=await cache.match(e.request);if(hit)return hit;
  const response=await fetch(e.request);await cache.put(e.request,response.clone());return response;
 }));
});`;

(async()=>{
 let script=legacy,photo='Foto antiga',appTitle='Painel do Modo Campo',homeRequests=0;
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname;
  res.setHeader('Cache-Control','no-cache');
  if(pathname==='/sw-meu-gado.js'){res.setHeader('Content-Type','application/javascript');return res.end(script);}
  if(pathname==='/'){homeRequests++;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(`<h1>${photo}</h1>`);}
  if(['/app','/app.html','/app/'].includes(pathname)){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(`<h1>${appTitle}</h1>`);}
  res.end('Recurso do painel');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader'],env:{...process.env,LD_LIBRARY_PATH:'/tmp/mg-chrome-runtime/al2023/lib'}});
  const ctx=await browser.newContext(),base=`http://127.0.0.1:${server.address().port}`;
  let page=await ctx.newPage();
  await page.goto(base+'/app');
  await page.evaluate(()=>navigator.serviceWorker.register('/sw-meu-gado.js',{scope:'/'}));
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.goto(base+'/');assert.equal(await page.locator('h1').innerText(),'Foto antiga');
  await page.close();photo='Foto corrigida';
  page=await ctx.newPage();await page.goto(base+'/');
  assert.equal(await page.locator('h1').innerText(),'Foto antiga','the legacy cache reproduces the stale first visit');
  assert.equal(homeRequests,1);
  script=worker;
  await page.evaluate(async()=>{
   const reg=await navigator.serviceWorker.ready,previous=navigator.serviceWorker.controller;
   await reg.update();
   if(navigator.serviceWorker.controller!==previous)return;
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('New service worker did not take control')),5000);
    navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timer);resolve();},{once:true});
   });
  });
  await page.waitForFunction(async expected=>{
   const keys=await caches.keys();return keys.includes(expected)&&!keys.includes('meu-gado-oficial-modo-campo-legacy-test');
  },currentCache);
  for(const label of ['Foto corrigida','Foto de uma publicação futura']){
   photo=label;await page.close();page=await ctx.newPage();
   const response=await page.goto(base+'/');
   assert.equal(response.fromServiceWorker(),false,'the home page always navigates to the network');
   assert.equal(await page.locator('h1').innerText(),label);
  }
  assert.equal(homeRequests,3);
  assert.equal(await page.evaluate(()=>caches.match('/').then(Boolean)),false);
  appTitle='Painel atualizado';
  await page.goto(base+'/app?source=instalado');
  assert.equal(await page.locator('h1').innerText(),appTitle);
  await page.waitForFunction(async()=> (await (await caches.match('/app.html')).text()).includes('Painel atualizado'));
  await ctx.setOffline(true);
  const offline=await page.goto(base+'/app.html');
  assert.equal(offline.fromServiceWorker(),true);
  assert.equal(await page.locator('h1').innerText(),appTitle);
  assert.equal(await page.evaluate(()=>fetch('/animal-reports-ui.js?v=2').then(r=>r.text())),'Recurso do painel');
  console.log('PASS: stale homepage reproduced; revised worker serves new homepage on each reopened tab and preserves the offline app and report assets.');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
