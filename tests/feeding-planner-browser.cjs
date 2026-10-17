// UI integration with a mock catalog transport; database/RLS tested separately in SQL.
// Run with playwright available and CHROMIUM_PATH pointing to a browser when needed.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const project=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const name=path.join(project,new URL(req.url,'http://local').pathname);try{const ext=path.extname(name);res.setHeader('Content-Type',ext==='.js'?'application/javascript':ext==='.css'?'text/css':'text/html');res.end(fs.readFileSync(name));}catch{res.statusCode=404;res.end();}}).listen(8766);
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader']});
 try{
 const page=await browser.newPage({viewport:{width:1365,height:900},hasTouch:true,serviceWorkers:'block'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route('https://**/*',r=>r.abort());
 await page.goto('http://127.0.0.1:8766/app.html',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(1800);
 await page.evaluate(()=>{
  mgFarmRole='owner';mgFarm={id:90001,name:'Fazenda de teste'};mgUser={id:'fixture-owner'};document.documentElement.dataset.mgRole='owner';
  document.getElementById('mgTestLoginGate').remove();document.documentElement.classList.remove('mg-route-boot');
  const lots=[{id:100,name:'Lote teste',active:true}],animals=Array.from({length:10},(_,i)=>({id:i+1,lot:'Lote teste',status:'active',current_weight:400,last_weighing_date:'2026-10-17'}));lotsData=lots;animalsData=animals;
  window.__plannerStore={feed_ingredients:[],feeding_plans:[]};
  mgGetFarm=async()=>mgFarm;
  api=async p=>p==='/api/lots'?lots:p==='/api/animals'?animals:[];
  mgSb.from=table=>{
   let operation='select',payload,filters=[];
   const q={select(){return q},order(){return q},eq(k,v){filters.push([k,v]);return q},insert(v){operation='insert';payload=v;return q},update(v){operation='update';payload=v;return q},maybeSingle(){return resolve(true)},then(a,b){return resolve(false).then(a,b)}};
   async function resolve(single){
    const rows=window.__plannerStore[table]||[];let selected=rows.filter(r=>filters.every(([k,v])=>String(r[k])===String(v)));
    if(operation==='insert'){
     const r={id:crypto.randomUUID(),price_kg:null,stock_kg:null,dry_matter_pct:null,protein_pct:null,ndt_pct:null,archived:false,revision:1,updated_at:new Date().toISOString(),...payload};
     if(table==='feeding_plans')r.items=r.items.map(i=>({...window.__plannerStore.feed_ingredients.find(f=>f.id===i.ingredient_id),...i}));rows.push(r);selected=[r];
    }else if(operation==='update'){selected.forEach(r=>{Object.assign(r,payload);r.revision++;});}
    return {data:single?selected[0]||null:structuredClone(selected),error:null};
   }return q;
  };
  show('planejamento');
 });
 await page.waitForFunction(()=>document.getElementById('fpPlans').innerText.includes('Nenhum plano cadastrado'));
 await page.click('[data-fp=foods]');await page.click('[data-fp=new-food]');
 await page.fill('#fpFoodName','Silagem de teste');await page.fill('#fpFoodPrice','0.3');await page.fill('#fpFoodStock','3000');await page.fill('#fpFoodDm','35');await page.locator('#fpFoodForm button[type=submit]').click();
 await page.waitForFunction(()=>document.getElementById('fpFoods').innerText.includes('Silagem de teste'));
 await page.click('[data-fp=plans]');await page.click('[data-fp=new-plan]');await page.fill('#fpPlanName','Engorda de teste');await page.selectOption('#fpPlanLot','100');await page.selectOption('#fpPlanManagement','semi');
 const food=await page.evaluate(()=>window.__plannerStore.feed_ingredients[0].id);await page.selectOption('.fp-ingredient',food);await page.fill('.fp-qty','15');
 assert.match(await page.locator('#fpPreview').innerText(),/150 kg\/dia/);await page.locator('#fpPlanForm button[type=submit]').click();
 await page.waitForFunction(()=>document.getElementById('fpPlans').innerText.includes('Engorda de teste'));
 await page.click('[data-fp=detail]');assert.match(await page.locator('#fpEditor').innerText(),/75/);assert.match(await page.locator('#fpEditor').innerText(),/20 dias/);
 await page.click('[data-fp=entry]');assert.equal(await page.inputValue('#nutQty'),'150.000');assert.equal(await page.inputValue('#nutCost'),'45.00');await page.evaluate(()=>closeModal('nutritionModal'));
 const output=process.env.FP_SCREENSHOTS||'/tmp';await page.screenshot({path:path.join(output,'feeding-desktop.png'),fullPage:false});
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{window.dispatchEvent(new Event('resize'));mgCloseMobileNav();document.getElementById('fpEditor').scrollIntoView()});await page.waitForTimeout(200);await page.screenshot({path:path.join(output,'feeding-mobile.png'),fullPage:false});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'No page-wide horizontal overflow on mobile');
 await page.click('[data-fp=cancel]');await page.click('[data-fp=refresh]');await page.waitForFunction(()=>document.getElementById('fpPlans').innerText.includes('Engorda de teste'));
 await page.context().setOffline(true);await page.click('[data-fp=refresh]');await page.waitForFunction(()=>document.getElementById('fpStatus').innerText.includes('Consulta offline'));assert.match(await page.locator('#fpPlans').innerText(),/Engorda de teste/);
 await page.click('[data-fp=new-plan]');assert.match(await page.locator('#fpStatus').innerText(),/Conecte-se/);
 await page.context().setOffline(false);await page.click('[data-fp=refresh]');await page.waitForFunction(()=>document.getElementById('fpStatus').innerText==='');
 await page.click('[data-fp=archive-plan]');await page.waitForFunction(()=>document.getElementById('fpStatus').innerText.includes('arquivado'));
 await page.evaluate(()=>{mgFarmRole='employee';show('planejamento')});
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS: full app parses, food create, plan create, preview, details, prepared nutrition entry, refreshed persistence, offline read/write guard, archive, role guard; desktop/mobile screenshots.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
