const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://local').pathname);try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}}).listen(8771,'127.0.0.1');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader'],env:{...process.env,LD_LIBRARY_PATH:'/tmp/mg-chrome-runtime/al2023/lib'}});
 try{
  const page=await browser.newPage({viewport:{width:1365,height:950},serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{errors.push(d.message());d.dismiss()});await page.route('https://**/*',r=>r.abort());
  await page.goto('http://127.0.0.1:8771/app.html',{waitUntil:'load'});
  await page.evaluate(()=>{
   document.getElementById('mgTestLoginGate')?.remove();document.documentElement.classList.remove('mg-route-boot');
   mgUser={id:'fixture-owner',email:'owner@example.com'};mgFarm={id:999,owner_id:mgUser.id,name:'Fixture'};mgFarmRole='owner';
   mgPlanState={farm_id:999,status:'active',plan:'complete',features:{core:true,expenses:true,planning:true,performance:true,reports:true}};
   mgRefreshPlan=async()=>mgPlanState;mgPlanCheckRequest=async()=>{};mgGetFarm=async()=>mgFarm;
   window.fixtureAnimals=[];window.fixtureQueued=[];
   mgSb.from=table=>{let mode='read',payload,one=false,done=false,result;const filters=[];
    const q={select(){return q},eq(k,v){filters.push(r=>String(r[k])===String(v));return q},neq(k,v){filters.push(r=>String(r[k])!==String(v));return q},is(k,v){filters.push(r=>(r[k]??null)===v);return q},order(){return q},limit(){return q},range(){return q},or(expr){const clauses=expr.split(',').map(v=>v.split('.'));filters.push(r=>clauses.some(([key,op,value])=>op==='eq'&&String(r[key])===value));return q},single(){one=true;return q},maybeSingle(){one=true;return q},insert(row){mode='insert';payload=row;return q},update(row){mode='update';payload=row;return q},then(resolve,reject){
     if(!done){done=true;const rows=table==='animals'?window.fixtureAnimals:[];let selected=rows.filter(r=>filters.every(f=>f(r)));
      if(mode==='insert'){const row={id:rows.length+1,...payload};rows.push(row);selected=[row];}
      if(mode==='update')selected.forEach(r=>Object.assign(r,payload));
      result={data:one?(selected[0]||null):selected.map(r=>({...r})),error:null};
     }return Promise.resolve(result).then(resolve,reject);
    }};return q;
   };
   api=apiOnline;mgRows=async()=>[];
   loadLots=async()=>{lotsData=[];document.getElementById('alot').innerHTML='<option value="">Sem lote</option>';};
   dashboard=loadExpenses=loadWeightHistory=loadRecentWeighings=async()=>{};renderReadyAnimalsForSale=()=>{};
   document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));document.getElementById('animais').classList.add('active');
  });
  await page.evaluate(()=>openNewAnimal());
  assert.equal(await page.locator('#mgAnimalRegistration').getAttribute('open'),null);
  await page.locator('#acat').selectOption('Touro');
  await page.locator('#mgAnimalClassification summary').click();await page.locator('#amaleCondition').selectOption('inteiro');await page.locator('#areproRole').selectOption('reprodutor');
  await page.locator('#mgAnimalRegistration summary').click();await page.locator('#aregAssociation').fill('ABCZ');await page.locator('#aregSeries').fill('MG');await page.locator('#aregBirth').fill('001');await page.locator('#aregDefinitive').fill('002');await page.locator('#aregCategory').fill('PO');
  await page.locator('#mgAnimalParentage summary').click();await page.locator('#afatherSource').selectOption('external');await page.locator('#afatherName').fill('Touro da Central');await page.locator('#afatherRegistry').fill('CENT 100');
  await page.locator('#anum').fill('125');await page.locator('#aname').fill('  Bela Vista FIV  ');await page.locator('#animalSaveBtn').click();
  await page.waitForFunction(()=>window.fixtureAnimals.length===1);
  assert.deepEqual(await page.evaluate(()=>({number:fixtureAnimals[0].number,name:fixtureAnimals[0].name})),{number:'125',name:'Bela Vista FIV'});
  assert.equal(await page.evaluate(()=>fixtureAnimals[0].registry_birth),'001');assert.equal(await page.evaluate(()=>fixtureAnimals[0].father_external_name),'Touro da Central');assert.equal(await page.evaluate(()=>mgGlobalSearchMatches('001')[0]?.id),1);
  await page.locator('#animalSearch').fill('bela vista');assert.equal(await page.locator('.animal-row-card').count(),1);assert.match(await page.locator('.animal-row-card').innerText(),/125 · Bela Vista FIV/);
  assert.equal(await page.evaluate(()=>mgGlobalSearchMatches('Bela Vista')[0]?.id),1);
  assert.match(await page.locator('#ranimal').innerText(),/Bela Vista FIV/);
  await page.locator('.animal-row-card').click();await page.locator('#animalProfileModal').waitFor({state:'visible'});assert.match(await page.locator('#profileAnimalTitle').innerText(),/Bela Vista FIV/);assert.match(await page.locator('.ap8-card').filter({hasText:'Identificação'}).innerText(),/Nome\s+Bela Vista FIV/);
  await page.getByRole('button',{name:'Editar animal'}).click();assert.equal(await page.locator('#aname').inputValue(),'Bela Vista FIV');
  await page.locator('#aname').fill('<img src=x onerror=alert(1)>');await page.locator('#animalSaveBtn').click();
  await page.locator('#animalSearch').fill('onerror');await page.locator('.animal-row-card').click();assert.equal(await page.locator('.ap8-title img').count(),0);assert.match(await page.locator('#profileAnimalTitle').innerText(),/<img/);
  await page.evaluate(()=>openEditAnimal(1));await page.locator('#aname').fill('Bela Vista FIV');await page.locator('#animalSaveBtn').click();
  // Older clients and queued edits that omit the new field must preserve its value.
  await page.evaluate(()=>apiOnline('/api/animals/1',{method:'PUT',body:JSON.stringify({number:'125',category:'Boi'})}));assert.equal(await page.evaluate(()=>fixtureAnimals[0].name),'Bela Vista FIV');
  for(const width of [1365,390]){await page.setViewportSize({width,height:900});await page.evaluate(width=>{Object.defineProperty(navigator,'maxTouchPoints',{value:width===390?1:0,configurable:true});window.dispatchEvent(new Event('resize'));},width);await page.waitForTimeout(300);await page.evaluate(()=>openEditAnimal(1));await page.locator('#aname').scrollIntoViewIfNeeded();assert.ok(await page.locator('#aname').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));await page.screenshot({path:'/tmp/mg-animal-name-'+width+'.png'});await page.evaluate(()=>closeModal('animalModal'));}
  await page.evaluate(()=>openNewAnimal());assert.equal(await page.locator('#aname').inputValue(),'');await page.locator('#anum').fill('126');await page.locator('#animalSaveBtn').click();await page.waitForFunction(()=>fixtureAnimals.length===2);assert.equal(await page.evaluate(()=>fixtureAnimals[1].name),null);
  // The actual offline queue keeps the complete payload for later replay.
  await page.evaluate(async()=>{mgOfflinePut=async(store,item)=>{fixtureQueued.push(item);return item;};mgUpdateConnectionUi=async()=>{};mgOfflineToast=()=>{};await mgQueueMutation('/api/animals/1',{method:'PUT',body:JSON.stringify({number:'125',name:'Bela Vista Offline',registry_birth:'OFF001',father_external_name:'Central Offline',father_id:null})});});
  assert.equal(await page.evaluate(()=>JSON.parse(fixtureQueued[0].body).name),'Bela Vista Offline');
  assert.equal(await page.evaluate(()=>{try{mgAnimalName('a'.repeat(121));return false;}catch{return true;}}),true);
  // Link a historical dam from the same farm without adding external ancestors to the herd.
  await page.evaluate(async()=>{await apiOnline('/api/animals',{method:'POST',body:JSON.stringify({number:'200',name:'Matriz Teste',category:'Vaca',reproductive_role:'matriz'})});fixtureAnimals[2].status='inactive';await openEditAnimal(1);});
  await page.locator('#amotherSource').selectOption('herd');await page.locator('#amotherId').selectOption('3');await page.locator('#animalSaveBtn').click();
  assert.equal(await page.evaluate(()=>fixtureAnimals[0].mother_id),3);assert.equal(await page.evaluate(()=>fixtureAnimals[0].registry_birth),'001');
  await page.evaluate(async()=>{await apiOnline('/api/animals',{method:'POST',body:JSON.stringify({number:'300',name:'Descendente',category:'Bezerra',father_id:1,mother_id:3})});await openAnimalProfile(1);});
  assert.match(await page.locator('#animalProfileBody').innerText(),/Touro da Central/);assert.match(await page.locator('#animalProfileBody').innerText(),/Matriz Teste/);assert.match(await page.locator('#animalProfileBody').innerText(),/Descendente/);assert.match(await page.locator('#animalProfileBody').innerText(),/Registro na associação/);
  await page.evaluate(()=>openEditAnimal(1));assert.equal(await page.locator('#afatherSource').inputValue(),'external');assert.equal(await page.locator('#amotherSource').inputValue(),'herd');
  await page.locator('#afatherSource').selectOption('');await page.locator('#aregBirth').fill('');await page.locator('#animalSaveBtn').click();assert.equal(await page.evaluate(()=>fixtureAnimals[0].father_external_name),null);assert.equal(await page.evaluate(()=>fixtureAnimals[0].registry_birth),null);
  assert.equal(await page.evaluate(()=>JSON.parse(fixtureQueued[0].body).registry_birth),'OFF001');
  await page.evaluate(()=>apiOnline(fixtureQueued[0].path,{method:fixtureQueued[0].method,body:fixtureQueued[0].body}));assert.equal(await page.evaluate(()=>fixtureAnimals[0].registry_birth),'OFF001');assert.equal(await page.evaluate(()=>fixtureAnimals[0].father_external_name),'Central Offline');assert.equal(await page.evaluate(()=>fixtureAnimals[0].mother_id),3);
  assert.deepEqual(errors,[]);console.log('PASS: real animal form, CRUD route, optional name, edit, legacy payload preservation, list/global search, selectors, profile, escaped markup, desktop/mobile and offline queue. Fixture DB only.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
