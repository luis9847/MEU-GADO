// Altere a versão a cada publicação do painel. Assim, quem instalou o Meu
// Gado recebe a interface e os scripts novos em vez de permanecer em cache
// com uma versão anterior.
const MG_CACHE='meu-gado-oficial-modo-campo-v33-inicio-online';
const MG_SHELL=[
  '/app.html',
  '/animal-reports.js?v=1',
  '/animal-reports-ui.js?v=2',
  '/animal-reports.css?v=1',
  '/animal-breeding.js?v=2',
  '/animal-breeding-ui.js?v=2',
  '/animal-breeding.css?v=1',
  '/plans-core.js?v=1',
  '/plans-app.js?v=3',
  '/plans.css?v=1',
  '/billing-client.js?v=4',
  '/billing.css?v=2',
  '/feeding-planner.css?v=1',
  '/feeding-planner-core.js?v=1',
  '/feeding-planner.js?v=2',
  '/manifest-meu-gado.webmanifest',
  '/meu-gado-logo.png',
  '/supabase.js'
];
const MG_APP_PATHS=new Set(['/app.html','/app','/app/']);
const MG_ASSETS=new Set(MG_SHELL.filter(path=>!MG_APP_PATHS.has(path)));

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(MG_CACHE).then(cache=>cache.addAll(MG_SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>(key.startsWith('meu-gado-oficial-modo-campo-')||key.startsWith('meu-gado-modo-campo-'))&&key!==MG_CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  if(request.mode==='navigate'){
    // Only the authenticated app shell is available offline. The public
    // home page (including its inline photo) must use the current deployment.
    if(!MG_APP_PATHS.has(url.pathname))return;
    event.respondWith(
      fetch(request,{cache:'no-cache'})
        .then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(MG_CACHE).then(cache=>cache.put('/app.html',copy)).catch(()=>{}));}return response})
        .catch(()=>caches.match('/app.html'))
    );
    return;
  }

  if(MG_ASSETS.has(url.pathname+url.search)){
    event.respondWith(
      caches.open(MG_CACHE).then(cache=>cache.match(request).then(cached=>cached||fetch(request).then(response=>{
        if(response.ok){const copy=response.clone();event.waitUntil(cache.put(request,copy).catch(()=>{}));}
        return response;
      })))
    );
  }
});

