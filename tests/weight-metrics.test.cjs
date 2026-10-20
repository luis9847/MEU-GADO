const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','app.html'),'utf8');
function between(start,end){const a=html.indexOf(start);assert.ok(a>=0,start);const b=html.indexOf(end,a+start.length);assert.ok(b>a,end);return html.slice(a,b)}
const core=between('// BEGIN MG_WEIGHT_METRICS','// END MG_WEIGHT_METRICS');
function context(extra={}){const c=vm.createContext({console,...extra});vm.runInContext(core,c);return c}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const w=(id,date,weight,extra={})=>({id,animal_id:1,weighing_date:date,weight,...extra});
const animal={id:1,number:'060',status:'active',lot:'Engorda',category:'Boi',entry_date:'2026-09-27',entry_weight:450,target_weight:600};
const sample=[w(20,'2026-10-09',500),w(10,'2026-07-23',465)];
test('all inline application scripts parse',()=>{let count=0;for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){if(/src=|application\//.test(m[1]))continue;new vm.Script(m[2]);count++}assert.ok(count>=19)});
test('first-to-last period differs from the last interval and is stable in any input order',()=>{
 const c=context(),rows=[w(1,'2026-07-01',300),w(2,'2026-10-01',400),w(3,'2026-10-02',420)];
 const a=c.mgWeightMetrics({},rows),b=c.mgWeightMetrics({},rows.slice().reverse());near(a.gmd,120/93);near(b.gmd,a.gmd);assert.equal(a.delta,20);assert.equal(a.currentWeight,420);
});
test('entry after first weighing cannot be prepended or replace actual weight',()=>{const c=context(),m=c.mgWeightMetrics(animal,sample);near(m.gmd,35/78);assert.deepEqual(Array.from(m.history,x=>x.weighing_date),['2026-07-23','2026-10-09']);assert.equal(m.delta,35);assert.equal(m.currentWeight,500)});
test('valid earlier entry supplies baseline; same-date actual weighing wins',()=>{
 const c=context();const a={entry_date:'2026-10-01',entry_weight:400};
 near(c.mgWeightMetrics(a,[w(1,'2026-10-11',410)]).gmd,1);
 const m=c.mgWeightMetrics(a,[w(1,'2026-10-01',405),w(2,'2026-10-11',415)]);near(m.gmd,1);assert.equal(m.first.weight,405);
});
test('multiple weighings on a day use latest edit, then creation and id, independently of response order',()=>{
 const c=context(),rows=[w(1,'2026-10-01',400),w(20,'2026-10-11',500),w(21,'2026-10-11',410)];
 near(c.mgWeightMetrics({},rows).gmd,1);near(c.mgWeightMetrics({},rows.slice().reverse()).gmd,1);
 rows.push(w(19,'2026-10-11',420,{updated_at:'2026-10-12T15:00:00Z'}));near(c.mgWeightMetrics({},rows).gmd,2);
});
test('zero gain, negative gain, and insufficient history are distinct',()=>{
 const c=context();assert.equal(c.mgWeightMetrics({},[]).gmd,null);assert.equal(c.mgWeightMetrics({},[w(1,'2026-10-01',400)]).gmd,null);
 assert.equal(c.mgWeightMetrics({},[w(1,'2026-10-01',400),w(2,'2026-10-11',400)]).gmd,0);
 assert.equal(c.mgWeightMetrics({},[w(1,'2026-10-01',400),w(2,'2026-10-11',390)]).gmd,-1);
});
test('invalid dates, empty/invalid weights and deleted records do not distort metrics',()=>{
 const c=context(),rows=[...sample,w(30,'2026-02-30',700),w(40,'not-a-date',900),w(50,'2026-10-15',''),w(60,'2026-10-16',null),w(70,'2026-10-17',-5),w(80,'2026-10-18',Infinity),w(90,'2026-10-19',999,{deleted_at:'2026-10-20'})];
 near(c.mgWeightMetrics(animal,rows).gmd,35/78);
 assert.equal(c.mgWeightDate('2024-02-29'), '2024-02-29');assert.equal(c.mgWeightDate('2026-02-29'),'');
});
test('day count crosses daylight saving and year boundaries in whole calendar days',()=>{
 const c=context();assert.equal(c.mgWeightMetrics({},[w(1,'2018-11-03',400),w(2,'2018-11-05',402)]).gmd,1);
 assert.equal(c.mgWeightMetrics({},[w(1,'2025-12-31',400),w(2,'2026-01-02',402)]).gmd,1);
});
test('profile and chart share GMD and chronological labels; chart handles no history',()=>{
 const c=context();vm.runInContext(between('function weightEvolutionHtml','\nasync function openAnimalProfile')+between('function ap8ProfileGmd','\nfunction ap8Event'),c);
 const a={...animal,weighings:sample,gmd:999};near(c.ap8ProfileGmd(a),35/78);
 const rendered=c.weightEvolutionHtml(a);assert.ok(rendered.indexOf('2026-07-23:')<rendered.indexOf('2026-10-09:'));assert.ok(!rendered.includes('2026-09-27:'));assert.match(rendered,/0\.449 kg\/dia/);
 assert.match(c.weightEvolutionHtml({}),/Registre uma pesagem/);
 const zero=c.weightEvolutionHtml({weighings:[w(1,'2026-10-01',400),w(2,'2026-10-11',400)]});assert.match(zero,/0\.000 kg\/dia/);
 const years=c.weightEvolutionHtml({weighings:[w(1,'2025-12-31',400),w(2,'2026-01-02',402)]});assert.match(years,/31\/12\/25/);assert.match(years,/02\/01\/26/);
});
function fixture(){
 const tables={animals:[structuredClone(animal),{id:2,number:'002',status:'active',lot:'Engorda',category:'Boi',entry_date:null,entry_weight:null},{id:3,number:'003',status:'sold',lot:'Engorda',category:'Boi',entry_weight:999}],weighings:structuredClone(sample),lots:[{id:1,name:'Engorda',active:true}],expenses:[],health_events:[],reproductive_events:[]};
 const c=context({mgGetFarm:async()=>({id:101}),mgErr:e=>{throw e},mgRows:async table=>structuredClone(tables[table]||[])});
 c.mgSb={from:table=>{const filters=[];let single=false;const q={select(){return q},eq(k,v){filters.push(r=>String(r[k])===String(v));return q},neq(k,v){filters.push(r=>String(r[k])!==String(v));return q},is(k,v){filters.push(r=>(r[k]??null)===v);return q},order(){return q},maybeSingle(){single=true;return q},then(resolve,reject){const selected=(tables[table]||[]).map(r=>({farm_id:101,...r})).filter(r=>filters.every(f=>f(r)));return Promise.resolve({data:single?selected[0]:selected,error:null}).then(resolve,reject)}};return q}};
 vm.runInContext(between('async function mgAnimals','\nasync function apiOnline'),c);return {c,tables};
}
test('online source, dashboard, lots, profile and offline-aware weighing route agree, including edits and deletions',async()=>{
 const {c,tables}=fixture();vm.runInContext(between('async function mgWeightStats','\nfunction setLotV2Filter'),c);
 c.api=async route=>{assert.equal(route,'/api/weighings/recent');return structuredClone(tables.weighings)};
 for(const phase of ['initial','edit','delete']){
  if(phase==='edit')tables.weighings[0].weight=510;
  if(phase==='delete')tables.weighings.splice(0,1);
  const animals=await c.mgAnimals(true);c.animalsData=animals;
  const [dash,lots,profile,lot,stats]=await Promise.all([c.mgDashboard(),c.mgLotList(),c.mgAnimalProfile(1),c.mgLotProfile(1),c.mgWeightStats()]);
  const want=phase==='initial'?35/78:phase==='edit'?45/78:null;
  for(const got of [animals[0].gmd,dash.avg_gmd,lots[0].avg_gmd,profile.gmd,lot.avg_gmd,stats[1].gmd])want==null?assert.equal(got,null):near(got,want);
  assert.equal(dash.total,2);assert.equal(stats[2],undefined);assert.equal(animals[0].current_weight,phase==='initial'?500:phase==='edit'?510:465);
 }
 // Simulate unavailable transport: no silent successful empty response.
 c.api=async()=>{throw Error('Offline cache unavailable')};await assert.rejects(()=>c.mgWeightStats(),/Offline/);
});
test('weight and lot KPI rendering excludes animals without GMD and preserves true zero',async()=>{
 const c=context(),els={};c.document={getElementById:id=>els[id]??=(id==='dashboardLots'?{rows:[]}:{textContent:''})};c.renderLotsV2=()=>{};
 c.animalsData=[{id:1,lot:'Engorda',target_weight:450},{id:2,lot:'Engorda',target_weight:450}];c.lotsData=[{id:1,name:'Engorda',active:true}];
 vm.runInContext(between('async function recalcWeightAndLotV2','\nconst mgOriginalLoadLots'),c);
 c.mgWeightStats=async()=>({1:{lastWeight:400,gmd:0},2:{lastWeight:500,gmd:null}});
 await c.recalcWeightAndLotV2();assert.equal(els.wKpiGmd.textContent,'0.000 kg/dia');assert.equal(c.lotsData[0].avg_gmd,0);assert.equal(els.wKpiReady.textContent,1);
 c.mgWeightStats=async()=>({1:{lastWeight:400,gmd:null}});await c.recalcWeightAndLotV2();assert.equal(els.wKpiGmd.textContent,'—');assert.equal(c.lotsData[0].avg_gmd,null);
});
test('actual read-only route returns chronological monthly history and latest consistent average',async()=>{
 const {c,tables}=fixture();c.mgBody=()=>({});vm.runInContext(between('async function apiOnline','\n/* Modo Campo Offline'),c);
 tables.weighings.push(w(30,'2026-10-09',510));
 let history=await c.apiOnline('/api/weighings/history');assert.deepEqual(Array.from(history,x=>x.month),['2026-07','2026-10']);assert.equal(history.at(-1).avg_weight,510);
 assert.equal(history.at(-1).avg_weight,(await c.mgDashboard()).avg_weight);
 tables.weighings=Array.from({length:13},(_,i)=>w(i+1,`${2025+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}-01`,300+i));
 history=await c.apiOnline('/api/weighings/history');assert.equal(history.length,12);assert.equal(history[0].month,'2025-02');assert.equal(history.at(-1).month,'2026-01');
});
test('offline cached weighing rows use the identical formula without making online calls',async()=>{
 const c=context({navigator:{onLine:false},animalsData:[animal],mgReadCachedResponse:async()=>structuredClone(sample),apiOnline:()=>{throw Error('must not connect')}});
 vm.runInContext(between('async function api(path,opt={})','\nasync function mgPendingForUser')+between('async function mgWeightStats','\nfunction setLotV2Filter'),c);
 near((await c.mgWeightStats())[1].gmd,35/78);
});
test('performance ranking renders the same GMD as dashboard with missing history excluded',async()=>{
 const {c}=fixture();const els={};c.document={getElementById:id=>els[id]??={textContent:'',innerHTML:''}};
 c.window={};c.setPerformanceLoading=()=>{};c.money=n=>String(n);c.mgEsc=String;c.alert=msg=>{throw Error(msg)};
 for(const id of ['perfBestGmd','perfBestGmdAnimal','perfReadyPct','perfReadyCount','perfCostHead','perfBestLot','perfBestLotGmd','perfAnimalRanking','perfLotRanking','perfAttention','perfTargets'])c[id]=c.document.getElementById(id);
 c.animalsData=await c.mgAnimals(true);c.lotsData=await c.mgLotList();c.api=async()=>c.mgDashboard();c.performanceWeighingsCache=null;c.performanceWeighingsCacheAt=0;
 vm.runInContext(between('async function loadPerformance','\nasync function deleteWeighing'),c);await c.loadPerformance(true);
 assert.equal(c.perfBestGmd.textContent,'0.449 kg/dia');assert.match(c.perfLotRanking.innerHTML,/0\.449 kg\/dia/);assert.match(c.perfAnimalRanking.innerHTML,/#060/);assert.doesNotMatch(c.perfAnimalRanking.innerHTML,/#002/);
});
