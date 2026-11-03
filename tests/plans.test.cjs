const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const C=require('../plans-core.js'),now=Date.parse('2026-11-03T15:00:00Z');
const complete={farm_id:7,plan:'complete',status:'trial',expires_at:'2026-11-17T23:59:59Z',features:{core:true,expenses:true,planning:true,performance:true,reports:true}};
test('free trials, paid active, legacy, pending and suspended have distinct access',()=>{
 for(const status of ['trial','active','legacy'])assert.equal(C.writable({...complete,status},now),true);
 for(const status of ['pending','suspended','invalid'])assert.equal(C.writable({...complete,status},now),false);
 assert.equal(C.writable(null,now),false);assert.equal(C.label(complete,now),'Teste gratuito');
});
test('expiry blocks precisely at the deadline, null is explicit indefinite, invalid dates fail closed',()=>{
 assert.equal(C.writable(complete,Date.parse(complete.expires_at)),false);
 assert.equal(C.writable({...complete,expires_at:null},now),true);
 assert.equal(C.writable({...complete,expires_at:'invalid'},now),false);
 assert.equal(C.label(complete,Date.parse(complete.expires_at)),'Validade encerrada');
});
test('Essential accepts animal 150, rejects 151; Complete can also be chosen below 150',()=>{
 const essential={...complete,plan:'essential'};
 assert.equal(C.admission(essential,149,now),'');assert.match(C.admission(essential,150,now),/150/);
 assert.equal(C.admission(complete,151,now),'');assert.equal(C.admission(complete,5,now),'');
 assert.match(C.admission({...complete,status:'suspended'},1,now),/preservados/);
});
test('commercial prices match proposal and all paid views are mapped',()=>{
 assert.deepEqual([C.plans.essential.monthly,C.plans.essential.annual,C.plans.complete.monthly,C.plans.complete.annual],[90,900,130,1440]);
 for(const name of ['gastos','planejamento','desempenho','relatorios','saleSimulator'])assert.ok(C.views[name]);
 assert.equal(C.feature(null,'planning'),false);
});
test('admin dates mean end of the chosen local day and invalid calendar dates are rejected',()=>{
 const end=new Date(C.localEndOfDay('2026-11-17'));
 assert.equal(end.getDate(),17);assert.equal(end.getHours(),23);assert.equal(end.getMinutes(),59);
 assert.equal(C.localEndOfDay(''),null);assert.throws(()=>C.localEndOfDay('2026-02-30'));assert.throws(()=>C.localEndOfDay('17/11/2026'));
});
function appContext(online=true){
 const store=new Map(),events={},c=vm.createContext({MGPlansCore:C,console,Date,Number,JSON,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},navigator:{onLine:online},window:{addEventListener:(k,v)=>events[k]=v},document:{body:null,addEventListener(){}},mgUser:{id:'user-a'},mgFarm:{id:7},mgReadCachedResponse:async()=>[],mgGetFarm:async()=>({id:7}),mgSb:{rpc:async()=>({data:{...complete,server_now:new Date().toISOString()},error:null})}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../plans-app.js'),'utf8')+'\nthis.mgHasPlanFeature=mgHasPlanFeature;',c);return {c,store,events};
}
test('online snapshot and cache are scoped to the authenticated identity and farm',async()=>{
 const {c,store}=appContext();await c.mgRefreshPlan({id:7});
 assert.ok(store.has('mg-plan-v1:user-a:7'));assert.equal(c.mgHasPlanFeature('planning'),true);
 c.navigator.onLine=false;vm.runInContext('mgPlanState=null;mgPlanFetched=0;',c);
 await c.mgRefreshPlan({id:7});assert.equal(c.mgHasPlanFeature('planning'),true);
 c.mgUser={id:'user-b'};vm.runInContext('mgPlanState=null;mgPlanFetched=0;',c);
 await assert.rejects(()=>c.mgRefreshPlan({id:7}),/validar/);
});
test('failed plan validation clears stale online access and never falls back to an old grant',async()=>{
 const {c}=appContext();await c.mgRefreshPlan({id:7});c.mgSb.rpc=async()=>({error:{message:'Unavailable'}});
 await assert.rejects(()=>c.mgRefreshPlan({id:7},true),/validar/);assert.equal(c.mgHasPlanFeature('planning'),false);
});
test('expired offline trial rejects mutations while cached reading remains available',async()=>{
 const {c,store}=appContext(false);store.set('mg-plan-v1:user-a:7',JSON.stringify({state:{...complete,expires_at:'2000-01-01T00:00:00Z'},offset:0}));
 await c.mgRefreshPlan({id:7});await c.mgPlanCheckRequest('/api/animals');
 await assert.rejects(()=>c.mgPlanCheckRequest('/api/weighings/batch',{method:'POST'}),/preservados/);
});
test('all inline admin/application scripts and added files parse',()=>{
 for(const file of ['admin.html','app.html'])for(const m of fs.readFileSync(path.join(__dirname,'..',file),'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){if(!/src=|application\//.test(m[1]))new vm.Script(m[2]);}
 for(const file of ['plans-admin.js','plans-app.js','plans-core.js','feeding-planner.js','sw-meu-gado.js'])new vm.Script(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
});
test('offline replay keeps rejected entries and records the plan error for review',async()=>{
 const html=fs.readFileSync(path.join(__dirname,'../app.html'),'utf8'),a=html.indexOf('async function mgSyncOfflineQueue(){'),b=html.indexOf("const MG_NEWS_VERSION=",a),pending=[{id:'test-queued',path:'/api/expenses/123',method:'DELETE',attempts:0}],stored=[],deleted=[],logs=[];
 const c=vm.createContext({mgOfflineSyncing:false,navigator:{onLine:true},mgPendingForUser:async()=>pending,mgUpdateConnectionUi:async()=>{},mgQueuedWeightPayloads:()=>[],apiOnline:async()=>{throw Error('Este recurso faz parte do plano Completo.');},mgOfflineDelete:async(...x)=>deleted.push(x),mgOfflinePut:async(...x)=>stored.push(x),mgSyncLog:async(...x)=>logs.push(x),mgIsNetworkError:()=>false,mgOfflineToast:()=>{},MG_OFFLINE_QUEUE:'queue'});
 vm.runInContext(html.slice(a,b),c);await c.mgSyncOfflineQueue();assert.equal(deleted.length,0);assert.equal(stored.length,1);assert.match(stored[0][1].lastError,/Completo/);assert.equal(logs[0][1],'error');
});
