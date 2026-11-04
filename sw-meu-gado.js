// Altere a versão a cada publicação do painel. Assim, quem instalou o Meu
// Gado recebe a interface e os scripts novos em vez de permanecer em cache
// com uma versão anterior.
const MG_CACHE='meu-gado-oficial-modo-campo-v29-atividade-animal';
const MG_SHELL=[
  '/app.html',
  '/animal-breeding.js?v=2',
  '/animal-breeding-ui.js?v=2',
  '/animal-breeding.css?v=1',
  '/plans-core.js?v=1',
  '/plans-app.js?v=3',
  '/plans.css?v=1',
  '/billing-client.js?v=3',
  '/billing.css?v=2',
  '/feeding-planner.css?v=1',
  '/feeding-planner-core.js?v=1',
  '/feeding-planner.js?v=2',
  '/manifest-meu-gado.webmanifest',
  '/meu-gado-logo.png',
  '/supabase.js'
];

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

  if(request.mode==='navigate' && (url.pathname==='/app.html'||url.pathname==='/app'||url.pathname==='/app/')){
    event.respondWith(
      fetch(request)
        .then(response=>{const copy=response.clone();caches.open(MG_CACHE).then(cache=>cache.put('/app.html',copy));return response})
        .catch(()=>caches.match('/app.html'))
    );
    return;
  }

  if(url.origin===self.location.origin){
    event.respondWith(
      caches.match(request).then(cached=>cached||fetch(request).then(response=>{
        if(response&&response.ok){const copy=response.clone();caches.open(MG_CACHE).then(cache=>cache.put(request,copy))}
        return response;
      }))
    );
  }
});

