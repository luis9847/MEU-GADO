// Browser integration uses fixture transport; real Postgres authorization is tested in plans-rls.sql.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://local').pathname;const file=path.join(root,pathname==='/'?'index.html':pathname);try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}}).listen(8767,'127.0.0.1');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader'],env:{...process.env,LD_LIBRARY_PATH:'/tmp/mg-chrome-runtime/al2023/lib'}});
 try{
 const page=await browser.newPage({viewport:{width:1365,height:950},serviceWorkers:'block'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route('https://**/*',r=>r.abort());
 await page.goto('http://127.0.0.1:8767/admin.html',{waitUntil:'load'});
 await page.evaluate(async()=>{
  window.__fixture={farms:[{id:999,name:'Fazenda teste',email:'teste@example.invalid',created_at:new Date().toISOString(),blocked:false}],farm_subscriptions:[{farm_id:999,plan:'complete',status:'legacy',billing_period:'monthly',expires_at:null,revision:1}],subscription_audit:[]};
  sb.from=table=>{
   let a=0,b=499;const q={select(){return q},order(){return q},range(x,y){a=x;b=y;return q},then(resolve,reject){return Promise.resolve({data:structuredClone((window.__fixture[table]||[]).slice(a,b+1)),error:null}).then(resolve,reject)}};return q;
  };
  sb.rpc=async(name,p)=>{
   if(name!=='admin_set_farm_plan')throw Error('Unexpected RPC '+name);
   window.__lastAccess=p;
   const s=window.__fixture.farm_subscriptions[0];Object.assign(s,{plan:p.p_plan,status:p.p_status,billing_period:p.p_billing_period,expires_at:p.p_expires_at,revision:s.revision+1});
   window.__fixture.subscription_audit.push({id:1,farm_id:999,actor_id:'fixture',after_value:structuredClone(s),created_at:new Date().toISOString()});return {data:s,error:null};
  };
  document.getElementById('loginPage').classList.add('hidden');document.getElementById('app').classList.remove('hidden');await loadData();openView('plans');
 });
 await page.getByRole('button',{name:'Gerenciar acesso'}).click();
 await page.locator('#subGrantFree').click();await page.locator('#subUntil').fill('2026-12-10');await page.locator('#subSave').click();
 await page.waitForFunction(()=>window.__lastAccess&&farmSubscriptions[0].status==='trial');
 const payload=await page.evaluate(()=>window.__lastAccess);assert.equal(payload.p_plan,'complete');assert.equal(payload.p_status,'trial');assert.equal(payload.p_expected_revision,1);assert.ok(payload.p_expires_at);
 assert.match(await page.locator('#subscriptionEditor').innerText(),/Teste gratuito: R\$ 0,00/);
 await page.screenshot({path:'/tmp/mg-plans-admin-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.querySelector('#detailModal .modalbox').getBoundingClientRect().width<=window.innerWidth));
 await page.screenshot({path:'/tmp/mg-plans-admin-mobile.png',fullPage:true});
 await page.locator('#subUntil').fill('');await page.locator('#subSave').click();await page.waitForFunction(()=>window.__lastAccess.p_expires_at===null);
 await page.locator('#subStatus').selectOption('suspended');await page.locator('#subSave').click();await page.waitForFunction(()=>farmSubscriptions[0].status==='suspended');
 assert.match(await page.locator('#planList').innerText(),/Acesso suspenso/);
 await page.locator('#subStatus').selectOption('active');await page.locator('#subPlan').selectOption('essential');await page.locator('#subPeriod').selectOption('annual');await page.locator('#subSave').click();await page.waitForFunction(()=>farmSubscriptions[0].plan==='essential');
 assert.match(await page.locator('#planList').innerText(),/900,00/);
 await page.evaluate(()=>closeDetail());await page.locator('#planStatusFilter').selectOption('trial');assert.equal(await page.locator('#planList tr').count(),0);
 const adminErrors=[...errors];errors.length=0;
 await page.setViewportSize({width:1365,height:950});await page.goto('http://127.0.0.1:8767/app.html',{waitUntil:'load'});await page.waitForTimeout(1600);
 await page.evaluate(async()=>{
  mgFarmRole='owner';mgFarm={id:999,name:'Fazenda teste'};mgUser={id:'fixture-owner'};mgGetFarm=async()=>mgFarm;mgSession=async()=>mgUser;
  document.getElementById('mgTestLoginGate')?.remove();document.documentElement.classList.remove('mg-route-boot');
  mgSb.rpc=async()=>({data:{farm_id:999,plan:'essential',status:'active',billing_period:'monthly',expires_at:null,server_now:new Date().toISOString(),features:{core:true,expenses:false,planning:false,performance:false,reports:false}},error:null});
  await mgRefreshPlan(mgFarm,true);show('inicio');
 });
 assert.match(await page.locator('#mgPlanBanner').innerText(),/Essencial/);
 await page.evaluate(()=>show('planejamento'));assert.equal(await page.locator('#planejamento.active').count(),0);assert.match(await page.locator('#mgPlanDialog').innerText(),/Completo/);await page.locator('#mgPlanDialog button').click();
 assert.equal(await page.locator('#dashExpensesMetric').isVisible(),false);assert.equal(await page.locator('#dashFinanceSummary').isVisible(),false);
 await page.evaluate(()=>show('animais'));assert.equal(await page.locator('#animais.active').count(),1);
 await page.evaluate(()=>downloadReportPDF('animais'));assert.equal(await page.locator('#mgPlanDialog').isVisible(),true);await page.locator('#mgPlanDialog button').click();
 await page.evaluate(async()=>{
  mgSb.rpc=async()=>({data:{farm_id:999,plan:'complete',status:'trial',expires_at:'2026-12-10T23:59:59Z',server_now:new Date().toISOString(),features:{core:true,expenses:true,planning:true,performance:true,reports:true}},error:null});
  await mgRefreshPlan(mgFarm,true);show('gastos');
 });
 assert.equal(await page.locator('#gastos.active').count(),1);assert.match(await page.locator('#mgPlanBanner').innerText(),/Teste gratuito/);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/mg-plans-app-mobile.png',fullPage:true});
 await page.evaluate(async()=>{mgSb.rpc=async()=>({data:{farm_id:999,plan:'complete',status:'trial',expires_at:'2000-01-01T00:00:00Z',server_now:new Date().toISOString(),features:{core:true,expenses:true,planning:true,performance:true,reports:true}},error:null});await mgRefreshPlan(mgFarm,true);});
 assert.match(await page.locator('#mgPlanBanner').innerText(),/Validade encerrada/);
 const blocked=await page.evaluate(async()=>{try{await api('/api/nutrition',{method:'POST',body:'{}'});return false;}catch(e){return e.message.includes('preservados');}});assert.equal(blocked,true);
 assert.deepEqual(adminErrors,[]);assert.deepEqual(errors,[]);
 console.log('PASS: desktop/mobile admin, dated and indefinite trials, suspension, paid Essential annual, search/filter, premium gates, financial visibility, report gate, trial expiry and mutation rejection; fixture transport only.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
