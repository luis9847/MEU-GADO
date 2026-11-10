const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://local').pathname;const file=path.join(root,name==='/'?'index.html':name);try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}}).listen(8772,'127.0.0.1');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader'],env:{...process.env,LD_LIBRARY_PATH:'/tmp/mg-chrome-runtime/al2023/lib'}});
 try{
  const page=await browser.newPage({viewport:{width:1365,height:950},serviceWorkers:'block'}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{errors.push(d.message());d.dismiss()});await page.route('https://**/*',r=>r.abort());
  await page.goto('http://127.0.0.1:8772/app.html',{waitUntil:'load'});
  await page.evaluate(()=>{
   document.getElementById('mgTestLoginGate')?.remove();document.documentElement.classList.remove('mg-route-boot');
   mgUser={id:'report-owner',email:'owner@example.com'};mgFarm={id:999,owner_id:mgUser.id,name:'Fazenda de testes'};mgFarmRole='owner';
   mgPlanState={farm_id:999,plan:'complete',status:'active',features:{core:true,reports:true,expenses:true,performance:true,planning:true}};
   mgGetFarm=async()=>mgFarm;
   const nativeOpen=window.open.bind(window);window.open=(...args)=>{const popup=nativeOpen(...args);if(popup)popup.print=()=>{};return popup;};
   window.reportAnimals=[
    {id:1,number:'001',name:'Touro Central',status:'inactive',category:'Touro',breed:'Nelore',production_purpose:'genetica',lot:'Matrizes'},
    {id:2,number:'002',name:'Matriz Alfa',status:'active',category:'Vaca',breed:'Nelore',production_purpose:'cria',lot:'Matrizes'},
    {id:3,number:'003',name:'Filha FIV',status:'active',category:'Bezerra',breed:'Nelore',production_purpose:'genetica',lot:'Elite',father_id:1,mother_id:2,birth_date:'2026-10-01',entry_weight:35,target_weight:100,registry_association:'ABCZ',registry_series:'MG',registry_birth:'03',registry_definitive:'33',registry_category:'PO',reproductive_role:'doadora'},
    {id:4,number:'004',name:'=2+2',status:'active',category:'Novilho',breed:'Angus',lot:'Engorda'},
    {id:5,number:'005',name:'Matriz antiga',status:'active',category:'Vaca',breed:'Girolando'},
    {id:6,number:'006',status:'active',category:'Vaca',breed:'Holandês',deleted_at:'2026-11-04'}
   ];
   window.reportEvents={weighings:[{animal_id:3,weighing_date:'2026-10-20',weight:120},{animal_id:1,weighing_date:'2026-10-10',weight:500}],health:[{animal_id:1,event_date:'2026-10-01',event_type:'Vacina',product:'Teste'}],reproduction:[{animal_id:2,event_date:'2026-10-01',event_type:'Parto'}],nutrition:[],expenses:[]};
   api=async path=>{if(path==='/api/animals/report-context')return structuredClone(reportAnimals);if(path.startsWith('/api/reports/'))return structuredClone(reportEvents[path.split('/').pop()]||[]);throw Error('Unexpected fixture request: '+path);};
   show('relatorios');
  });
  await page.waitForFunction(()=>document.getElementById('reportFiltersStatus').textContent.includes('atualizadas'));
  assert.equal(await page.locator('.report-card').count(),12);
  const breeds=await page.evaluate(()=>({catalog:Array.from(abreed.options).filter(o=>o.value).map(o=>o.value).sort(),report:Array.from(reportBreed.querySelectorAll(':scope > option')).map(o=>o.value).filter(v=>v&&v!==MGAnimalReports.missing).sort(),saved:Array.from(reportBreed.querySelectorAll('optgroup option')).map(o=>o.value)}));
  assert.deepEqual(breeds.report,breeds.catalog,'report includes standard breeds even when not yet used');assert.deepEqual(breeds.saved,['Girolando'],'saved breeds stay selectable; deleted records add no options');
  const inventoryCard=page.locator('.report-card').filter({has:page.locator('b',{hasText:'Rebanho completo'})});
  await page.locator('#reportBreed').selectOption('Girolando');
  const [breedDownload]=await Promise.all([page.waitForEvent('download'),inventoryCard.getByRole('button',{name:'Baixar CSV'}).click()]);
  const breedCsv=fs.readFileSync(await breedDownload.path(),'utf8');assert.match(breedCsv,/"Matriz antiga";"Vaca";"Girolando"/);assert.doesNotMatch(breedCsv,/"Nelore"/);
  await page.locator('#reportBreed').selectOption('Guzerá');assert.equal((await page.evaluate(()=>mgBuildReportData('rebanho'))).rows.length,0);
  await page.locator('#reportActivity').selectOption('genetica');await page.locator('#reportBreed').selectOption('Nelore');await page.locator('#reportLot').selectOption('Elite');await page.locator('#reportCategory').selectOption('Bezerra');
  const filtered=await page.evaluate(()=>mgBuildReportData('rebanho'));assert.equal(filtered.rows.length,1);assert.equal(filtered.rows[0][1],'Filha FIV');assert.match(filtered.rows[0].join('|'),/Touro Central/);
  const registryCard=page.locator('.report-card').filter({has:page.locator('b',{hasText:'Registros na associação'})});
  const [download]=await Promise.all([page.waitForEvent('download'),registryCard.getByRole('button',{name:'Baixar CSV'}).click()]);const csv=fs.readFileSync(await download.path(),'utf8');assert.match(csv,/RGN/);assert.match(csv,/Filha FIV/);assert.match(csv,/"03"/);
  await page.getByRole('button',{name:'Limpar filtros de animais'}).click();
  const [allDownload]=await Promise.all([page.waitForEvent('download'),inventoryCard.getByRole('button',{name:'Baixar CSV'}).click()]);assert.match(fs.readFileSync(await allDownload.path(),'utf8'),/"'=2\+2"/);
  const [popup]=await Promise.all([page.waitForEvent('popup'),inventoryCard.getByRole('button',{name:'Baixar PDF'}).click()]);
  await popup.waitForFunction(()=>document.querySelectorAll('.report-part').length===3);
  assert.ok(await popup.locator('table').evaluateAll(tables=>tables.every(t=>t.querySelectorAll('thead th').length<=8)));
  assert.match(await popup.locator('body').innerText(),/Touro Central/);assert.match(await popup.locator('body').innerText(),/Genética/);assert.match(await popup.locator('.meta-card').first().innerText(),/Posição atual/);
  await popup.waitForFunction(()=>Array.from(document.images).every(img=>img.complete&&img.naturalWidth>0),null,{timeout:5000}).catch(async e=>{console.error(await popup.locator('img').evaluateAll(imgs=>imgs.map(i=>({src:i.src.slice(0,80),current:i.currentSrc.slice(0,80),complete:i.complete,width:i.naturalWidth,base:document.baseURI}))));throw e;});
  await popup.pdf({path:'/tmp/mg-reports-inventory.pdf',preferCSSPageSize:true,printBackground:true});await popup.close();
  await page.locator('#reportCategory').selectOption('Touro');await page.locator('#reportStartDate').fill('2026-10-01');await page.locator('#reportEndDate').fill('2026-10-01');
  const descendants=await page.evaluate(()=>mgBuildReportData('descendentes'));assert.equal(descendants.rows.length,1);assert.equal(descendants.rows[0][4],'Filha FIV');
  await page.getByRole('button',{name:'Limpar filtros de animais'}).click();await page.getByRole('button',{name:'Limpar período',exact:true}).click();
  const health=await page.evaluate(()=>mgBuildReportData('saude'));assert.match(health.rows[0][1],/Touro Central/);
  for(const width of [1365,390]){await page.setViewportSize({width,height:950});await page.evaluate(width=>{Object.defineProperty(navigator,'maxTouchPoints',{value:width===390?1:0,configurable:true});window.dispatchEvent(new Event('resize'));},width);await page.waitForTimeout(300);await page.locator('.mg-report-filters').scrollIntoViewIfNeeded();assert.ok(await page.locator('.mg-report-filters').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));await page.screenshot({path:'/tmp/mg-report-filters-'+width+'.png'});}
  await page.evaluate(async()=>{mgPlanState.features.reports=false;window.reportBlocked=0;window.mgPlanExplain=()=>{reportBlocked++;};await downloadReport('registrados');await downloadReportPDF('filiacao');});assert.equal(await page.evaluate(()=>reportBlocked),2);
  await page.goto('http://127.0.0.1:8772/index.html',{waitUntil:'load'});assert.match(await page.locator('#para-quem').innerText(),/Genética e animais registrados/);assert.match(await page.locator('[data-module=rebanho]').innerText(),/RGN e RGD/);assert.equal(await page.locator('#planos table').count(),0);assert.match(await page.locator('[data-pricing-plan=essential]').innerText(),/Registros na associação e filiação/);assert.match(await page.locator('[data-pricing-plan=complete]').innerText(),/CSV e PDF com filtros/);
  await page.setViewportSize({width:1365,height:1000});await page.locator('#planos').screenshot({path:'/tmp/mg-landing-plans-reports.png'});
  assert.deepEqual(errors,[]);console.log('PASS: actual report filters, new reports, current/inactive identity, CSV downloads and formula escaping, grouped printable PDF, desktop/mobile, Complete gate, and truthful public plan copy. Fixture API only.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
