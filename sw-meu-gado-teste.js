const MG_CACHE='meu-gado-modo-campo-v1';
const MG_SHELL=[
  '/app-teste.html',
  '/manifest-meu-gado-teste.webmanifest',
  '/meu-gado-logo.png'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(MG_CACHE).then(cache=>cache.addAll(MG_SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith('meu-gado-modo-campo-')&&key!==MG_CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);

  if(request.mode==='navigate' && (url.pathname==='/app-teste.html'||url.pathname==='/app-teste'||url.pathname==='/app-teste/')){
    event.respondWith(
      fetch(request)
        .then(response=>{const copy=response.clone();caches.open(MG_CACHE).then(cache=>cache.put('/app-teste.html',copy));return response})
        .catch(()=>caches.match('/app-teste.html'))
    );
    return;
  }

  if(url.origin===self.location.origin || url.hostname==='cdn.jsdelivr.net'){
    event.respondWith(
      caches.match(request).then(cached=>cached||fetch(request).then(response=>{
        if(response&&response.ok){const copy=response.clone();caches.open(MG_CACHE).then(cache=>cache.put(request,copy))}
        return response;
      }))
    );
  }
});
