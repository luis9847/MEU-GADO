const { chromium }=require('playwright');
const { readFileSync }=require('node:fs');
const path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname,file=path.join(root,pathname==='/app'?'app.html':pathname);
  try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(readFileSync(file));}catch{res.statusCode=404;res.end();}
 }).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.on('listening',resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:830},serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',r=>r.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/app',{waitUntil:'load'});
  await page.waitForTimeout(1000);
  await page.evaluate(async()=>{
   mgFarmRole='owner';mgFarm={id:999,name:'Fazenda teste'};mgUser={id:'fixture-owner'};
   mgGetFarm=async()=>mgFarm;mgSession=async()=>mgUser;
   document.getElementById('mgTestLoginGate')?.remove();
   document.documentElement.classList.remove('mg-route-boot');
   const now=new Date().toISOString().slice(0,10);
   const cows=[{id:5,number:'150',name:'Estrela',category:'Vaca',status:'active',current_weight:500,breed:'Nelore'}];
   const births=[{id:55,animal_id:5,animal_number:'150',event_type:'Parto',event_date:now,postpartum_checklist:null}];
   api=async(p,o)=>{
    if(p==='/api/dashboard')return mgDashboard();
    if(p!=='/api/reproduction')return [];
    if(o?.method==='POST'){births.push({id:56,animal_number:'150',postpartum_checklist:null,...JSON.parse(o.body)});return {ok:true,id:56};}
    return structuredClone(births);
   };
   mgRows=async table=>table==='reproductive_events'?structuredClone(births):[];
   mgAnimals=async()=>structuredClone(cows);
   loadAnimals=async()=>{};
   dashboard=async()=>{};
   mgSb.rpc=async()=>({data:{farm_id:999,plan:'essential',status:'active',server_now:new Date().toISOString(),features:{core:true}},error:null});
   mgSb.from=table=>{
    let payload,id,original;const q={update(data){payload=data;return q},eq(k,v){if(k==='id')id=v;if(k==='postpartum_checklist')original=JSON.parse(v);return q},is(k){if(k==='postpartum_checklist')original=null;return q},select(){return q},async maybeSingle(){
     const birth=births.find(b=>b.id===id);
     if(table!=='reproductive_events'||!birth||JSON.stringify(birth.postpartum_checklist)!==JSON.stringify(original))return {data:null};
     Object.assign(birth,payload);return {data:{id}};
    }};return q;
   };
   await mgRefreshPlan(mgFarm,true);
   show('repro');await loadRepro();
  });
  for(const name of ['agendaManejo','financeiroFazenda'])assert.equal(await page.locator('.nav [data-v="'+name+'"] .mgi').count(),1);
  await page.locator('#reproRows').getByRole('button',{name:'Checklist pós-parto'}).click();
  const dialog=page.getByRole('dialog',{name:'Checklist pós-parto'});
  await dialog.getByRole('checkbox',{name:'Mamada do colostro confirmada'}).check();
  await dialog.getByRole('button',{name:'Salvar checklist'}).click();await dialog.waitFor({state:'hidden'});
  await page.evaluate(async()=>{mgDatabaseReadAlertIds=async()=>new Set();await openNotifications();});
  await page.getByRole('button',{name:'Abrir checklist',exact:true}).click();
  assert.equal(await dialog.getByRole('checkbox',{name:'Mamada do colostro confirmada'}).isChecked(),true);
  for(const checkbox of await dialog.getByRole('checkbox').all()){
   if((await checkbox.getAttribute('name'))!=='sem_cria_viva')await checkbox.check();
  }
  await dialog.getByRole('button',{name:'Salvar checklist'}).click();
  await page.locator('#reproRows').getByText('Concluído',{exact:true}).waitFor();
  assert.equal(await page.evaluate(async()=>(await mgDashboard()).alerts.some(a=>a.repro_event_id===55)),false);
  await page.evaluate(async()=>{openNewRepro();ranimal.value='5';rtype.value='Parto';rdate.value=new Date().toISOString().slice(0,10);rCreateCalf.checked=false;await saveRepro();});
  await dialog.waitFor();
  assert.equal(await dialog.getByRole('checkbox',{name:'Mamada do colostro confirmada'}).isChecked(),false);
  await dialog.getByRole('checkbox',{name:'Sem cria viva neste parto'}).check();
  assert.equal(await dialog.locator('#mgPostpartumCalfItems').isHidden(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: SVG menu icons, existing and new birth checklist, save/reopen, active and completed alert, no live calf.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
