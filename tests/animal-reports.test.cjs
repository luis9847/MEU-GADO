const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),R=require('../animal-reports.js');
const animals=[
 {id:1,number:'001',name:'Touro Central',status:'inactive',category:'Touro',breed:'Nelore',production_purpose:'genetica',lot:'Matrizes',registry_series:'MG',registry_birth:'01'},
 {id:2,number:'002',name:'Matriz Alfa',status:'active',category:'Vaca',breed:'Nelore',production_purpose:'cria',lot:'Matrizes'},
 {id:3,number:'003',name:'Filha FIV',status:'active',category:'Bezerra',breed:'Nelore',production_purpose:'genetica',lot:'Elite',father_id:1,mother_id:2,birth_date:'2026-10-01',registry_association:'ABCZ',registry_birth:'03',registry_definitive:'33',reproductive_role:'doadora',entry_weight:35,current_weight:120,gmd:0,target_weight:100},
 {id:4,number:'004',name:'Novilho Beta',status:'active',category:'Novilho',breed:'Angus',lot:'Engorda',father_external_name:'Pai externo',father_external_registry:'CENT 9',entry_weight:0,current_weight:0},
 {id:5,number:'005',name:'Baixado',status:'inactive',category:'Boi',breed:'Angus',production_purpose:'engorda',exit_date:'2026-10-20',exit_value:0},
 {id:6,number:'006',name:'Lixeira',status:'active',category:'Boi',deleted_at:'2026-10-21'}
];
const build=(type,extra={})=>R.build(type,{animals,...extra});
test('inventory has name/activity/classification and resolves inactive parents without exporting trash',()=>{
 const {headers,rows}=build('rebanho');assert.equal(rows.length,3);const child=rows.find(r=>r[0]==='003');assert.equal(child[headers.indexOf('Nome')],'Filha FIV');assert.equal(child[headers.indexOf('Atividade')],'Genética');assert.match(child[headers.indexOf('Pai')],/001 · Touro Central/);assert.equal(rows.find(r=>r[0]==='004')[headers.indexOf('Peso atual (kg)')],0);
});
test('registry and parentage exports keep declared identities and external reference source',()=>{
 const registry=build('registrados');assert.equal(registry.rows.length,1);assert.equal(registry.rows[0][registry.headers.indexOf('RGN')],'03');
 const p=build('filiacao'),external=p.rows.find(r=>r[0]==='004');assert.match(external[p.headers.indexOf('Pai')],/Pai externo.*CENT 9/);assert.equal(external[p.headers.indexOf('Origem do pai')],'Externo');
});
test('activity, breed, lot and category combine; unclassified animals are explicit',()=>{
 assert.equal(build('rebanho',{filters:{activity:'genetica',breed:'Nelore',lot:'Elite',category:'Bezerra'}}).rows.length,1);
 assert.equal(build('rebanho',{filters:{activity:'genetica',lot:'Engorda'}}).rows.length,0);
 assert.equal(build('rebanho',{filters:{activity:R.missing}}).rows[0][0],'004');
});
test('descendant filters select the ancestor; time selects birth, including an inactive sire',()=>{
 const out=build('descendentes',{filters:{category:'Touro',activity:'genetica',start:'2026-10-01',end:'2026-10-01'}});assert.equal(out.rows.length,1);assert.equal(out.rows[0][0],'001');assert.equal(out.rows[0][4],'Filha FIV');
 assert.equal(build('descendentes',{filters:{start:'2026-10-02'}}).rows.length,0);assert.equal(build('crias',{filters:{start:'2026-10-01'}}).rows.length,1);
});
test('historical events keep names of inactive animals and handle lot/general events honestly',()=>{
 const events=[{animal_id:1,event_date:'2026-10-10',event_type:'Vacina'},{lot:'Elite',event_date:'2026-10-10',event_type:'Vacina'},{event_date:'2026-10-10',event_type:'Vacina'}];
 assert.equal(build('saude',{events}).rows.length,3);assert.match(build('saude',{events}).rows[0][1],/Touro Central/);
 assert.equal(build('saude',{events,filters:{activity:'genetica'}}).rows.length,1);assert.equal(build('saude',{events,filters:{lot:'Elite'}}).rows.length,1);
});
test('weight/reproduction/exit labels include names; zero values and dates survive',()=>{
 assert.match(build('pesagens',{events:[{animal_id:1,weighing_date:'2026-10-10',weight:0}]}).rows[0][1],/Touro Central/);
 assert.match(build('reproducao',{events:[{animal_id:2,event_date:'2026-10-10',event_type:'Parto'}]}).rows[0][1],/Matriz Alfa/);
 assert.equal(build('baixas',{filters:{start:'2026-10-20',end:'2026-10-20'}}).rows[0][7],0);
 assert.equal(build('prontos_venda').rows[0].at(-1),0);
});
test('lot-only reports ignore unsupported animal criteria and describe effective filters',()=>{
 const events=[{lot_name:'Elite',entry_date:'2026-10-01',quantity_kg:0,total_cost:0},{lot_name:'Matrizes',entry_date:'2026-10-01'}];
 assert.equal(build('alimentacao',{events,filters:{lot:'Elite',activity:'recria'}}).rows.length,1);assert.doesNotMatch(R.filterSummary('alimentacao',{lot:'Elite',activity:'recria'}),/Recria/);
});
test('date intervals reject reversed ranges and exclude undated events when restricted',()=>{assert.throws(()=>build('rebanho',{filters:{start:'2026-11-01',end:'2026-10-01'}}));assert.equal(R.inPeriod(null,{start:'2026-10-01'}),false);assert.equal(R.inPeriod(null,{}),true);});
test('wide PDFs split without dropping columns and repeat number/name; CSV prevents formulas',()=>{
 const headers=Array.from({length:19},(_,i)=>'C'+i),groups=R.columnGroups(headers);assert.ok(groups.every(g=>g.length<=8&&g[0]===0&&g[1]===1));assert.deepEqual([...new Set(groups.flat())],headers.map((_,i)=>i));
 for(const value of ['=1+1','  +CMD','\t@SUM(A1)','-formula'])assert.ok(R.csvCell(value).startsWith('"\''));assert.equal(R.csvCell(-5),'"-5"');assert.equal(R.csvCell('001'),'"001"');assert.equal(R.csvCell('Nome "A"'),'"Nome ""A"""');
});
test('paginated report reads are farm scoped and preserve ordering beyond 1000 records',async()=>{
 const html=fs.readFileSync(require('node:path').join(__dirname,'../app.html'),'utf8'),start=html.indexOf('async function mgReportRows'),end=html.indexOf('async function apiOnline',start),source=html.slice(start,end),calls=[];
 const c=vm.createContext({mgGetFarm:async()=>({id:9}),mgErr:e=>{throw e},mgSb:{from:table=>{const filter={table};const q={select(s){filter.select=s;return q},eq(k,v){filter[k]=v;return q},order(k){filter.order=k;return q},is(k,v){filter[k]=v;return q},range(a,b){calls.push({...filter,a,b});return Promise.resolve({data:Array.from({length:Math.max(0,Math.min(b+1,2005)-a)},(_,i)=>({id:a+i+1})),error:null})}};return q;}}});vm.runInContext(source,c);const rows=await c.mgReportRows('weighings');assert.equal(rows.length,2005);assert.equal(rows.at(-1).id,2005);assert.equal(calls.length,3);assert.ok(calls.every(q=>q.farm_id===9&&q.deleted_at===null&&q.order==='id'));
});
