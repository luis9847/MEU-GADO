const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://local').pathname,file=path.join(root,pathname==='/'?'index.html':pathname);try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}}).listen(8770,'127.0.0.1');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader'],env:{...process.env,LD_LIBRARY_PATH:'/tmp/mg-chrome-runtime/al2023/lib'}});
 try{
 const page=await browser.newPage({viewport:{width:1365,height:950},serviceWorkers:'block'}),errors=[],requests=[];let enabled=true,contract=null,paid=false,pilotFarm=null;
 const farm={farm_id:999,farm_name:'Fazenda de teste',plan:'essential',status:'pending',active_heads:10,expires_at:null};
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route('https://**/*',r=>r.abort());
 await page.route('https://*/functions/v1/billing/*',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'}});
  const action=route.request().url().split('/').pop(),body=JSON.parse(route.request().postData()||'{}');requests.push({action,body});let data={};
  if(action==='context')data={farm,enabled,contracts:contract?[contract]:[],pilot_offer:pilotFarm&&!contract?{amount:5}:null};
  if(action==='availability')data={enabled};
  if(action==='create'){contract={id:body.request_id,plan:body.plan,billing_period:body.billing_period,amount:body.pilot?5:1440,is_pilot:body.pilot===true,status:'pending',checkout_url:'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=production1234567',activated:false};data={contract};}
  if(action==='refresh'){if(paid){contract.status='authorized';contract.activated=true;contract.paid_until='2027-11-04T12:00:00Z';Object.assign(farm,{status:'active',plan:'complete',expires_at:contract.paid_until});}data={contract};}
  if(action==='cancel'){contract.status='cancelled';contract.checkout_url=null;data={contract};}
  if(action==='admin-config')data={enabled,ready:false,credential_present:false};
  if(action==='admin-list')data={contracts:contract?[{...contract,farm_id:999,needs_review:true,review_reason:'access_changed'}]:[]};
  if(action==='admin-pilot'){if(Object.hasOwn(body,'farm_id'))pilotFarm=body.farm_id;data={farm_id:pilotFarm,expires_at:pilotFarm?new Date(Date.now()+86400000).toISOString():null};}
  if(action==='admin-resolve'){contract=null;data={resolved:true};}
  return route.fulfill({headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'},body:JSON.stringify(data)});
 });
 await page.goto('http://127.0.0.1:8770/app.html',{waitUntil:'load'});await page.waitForTimeout(1600);
 await page.evaluate(async()=>{document.getElementById('mgTestLoginGate')?.remove();document.documentElement.classList.remove('mg-route-boot');mgUser={id:'fixture-owner',email:'owner@example.com'};mgFarm={id:999,name:'Fazenda de teste'};mgFarmRole='owner';mgSb.auth.getSession=async()=>({data:{session:{access_token:'fixture',user:mgUser}}});mgRefreshPlan=async()=>{};await window.mgOpenBilling();});
 await page.locator('#mgBillingPlan').selectOption('complete');await page.locator('#mgBillingPeriod').selectOption('annual');assert.match(await page.locator('#mgBillingPrice').innerText(),/1.440,00/);
 assert.equal(await page.locator('#mgBillingConsent').isChecked(),false);await page.locator('#mgBillingBuy').click();assert.equal(requests.filter(x=>x.action==='create').length,0);
 await page.locator('#mgBillingConsent').check();await page.locator('#mgBillingBuy').click();await page.waitForFunction(()=>document.getElementById('mgBillingMessage').textContent.includes('Contratação criada'));
 const created=requests.find(x=>x.action==='create').body;assert.equal(created.plan,'complete');assert.equal(created.billing_period,'annual');assert.equal(created.accepted_terms,true);assert.equal(created.payer_email,'owner@example.com');
 assert.equal(await page.locator('#mgBillingContracts a').getAttribute('rel'),'noopener noreferrer');assert.equal(await page.locator('#mgBillingBuy').isDisabled(),true);
 await page.getByRole('button',{name:'Consultar pagamento'}).click();await page.waitForFunction(()=>document.getElementById('mgBillingMessage').textContent.includes('atualizados'));assert.match(await page.locator('#mgBillingContracts').innerText(),/A liberação depende/);
 paid=true;await page.getByRole('button',{name:'Consultar pagamento'}).click();await page.waitForFunction(()=>document.getElementById('mgBillingContracts').textContent.includes('Período pago até'));
 await page.locator('.mg-billing-comparison summary').click();
 assert.equal(await page.locator('.mg-billing-table tbody tr').count(),12);
 assert.equal(await page.locator('.mg-billing-table tbody tr').filter({hasText:'Controle de gastos'}).locator('td').first().innerText(),'Não incluído');
 for(const width of [1365,390]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.getElementById('mgBillingDialog').getBoundingClientRect().width<=innerWidth));await page.screenshot({path:'/tmp/mg-production-billing-'+width+'.png'});}
 const expiry=contract.paid_until;await page.getByRole('button',{name:'Cancelar renovação',exact:true}).click();await page.waitForFunction(()=>document.getElementById('mgBillingContracts').textContent.includes('Renovação cancelada'));assert.equal(contract.paid_until,expiry);assert.equal(await page.locator('#mgBillingBuy').isDisabled(),true);
 enabled=false;await page.locator('#mgBillingClose').click();await page.evaluate(()=>window.mgOpenBilling());assert.match(await page.locator('#mgBillingAvailability').innerText(),/em preparação/);
 await page.goto('http://127.0.0.1:8770/admin.html',{waitUntil:'load'});await page.evaluate(async()=>{sb.auth.getSession=async()=>({data:{session:{access_token:'fixture'}}});sb.from=()=>{const q={select(){return q},order(){return q},range(){return q},then(a,b){return Promise.resolve({data:[],error:null}).then(a,b)}};return q;};document.getElementById('loginPage').classList.add('hidden');document.getElementById('app').classList.remove('hidden');await loadData();openView('plans');});
 await page.locator('#billingProductionCheck').click();await page.waitForFunction(()=>document.getElementById('billingProductionState').textContent.includes('MP_ACCESS_TOKEN_PROD'));assert.equal(await page.locator('#billingProductionEnable').isDisabled(),true);await page.locator('#billingProductionList').click();await page.getByRole('button',{name:'Concluir conferência'}).click();await page.waitForFunction(()=>document.getElementById('billingProductionState').textContent.includes('Conferência concluída'));assert.ok(requests.some(x=>x.action==='admin-resolve'));
 await page.evaluate(()=>{farms=[{id:999,name:'Fazenda piloto'}];});await page.locator('#billingPilotDetails summary').click();await page.locator('#billingPilotFarm').selectOption('999');await page.locator('#billingPilotEnable').click();await page.waitForFunction(()=>document.getElementById('billingPilotState').textContent.includes('Fazenda piloto'));
 enabled=true;contract=null;paid=false;Object.assign(farm,{status:'trial',expires_at:null});
 await page.goto('http://127.0.0.1:8770/app.html',{waitUntil:'load'});await page.evaluate(async()=>{document.getElementById('mgTestLoginGate')?.remove();document.documentElement.classList.remove('mg-route-boot');mgUser={id:'fixture-owner',email:'owner@example.com'};mgFarm={id:999,name:'Fazenda piloto'};mgFarmRole='owner';mgSb.auth.getSession=async()=>({data:{session:{access_token:'fixture',user:mgUser}}});await window.mgOpenBilling();});
 await page.locator('#mgBillingPlan').selectOption('pilot');assert.match(await page.locator('#mgBillingPrice').innerText(),/5,00 por mês/);assert.equal(await page.locator('#mgBillingPeriod').isDisabled(),true);assert.match(await page.locator('#mgBillingConsentText').innerText(),/renovação automática mensal/);
 await page.locator('#mgBillingConsent').check();await page.locator('#mgBillingBuy').click();await page.waitForFunction(()=>document.getElementById('mgBillingMessage').textContent.includes('Contratação criada'));
 const pilot=requests.filter(x=>x.action==='create').at(-1).body;assert.equal(pilot.pilot,true);assert.equal(pilot.plan,'complete');assert.equal(pilot.billing_period,'monthly');assert.match(await page.locator('#mgBillingContracts').innerText(),/Compra piloto.*5,00/);assert.equal(await page.locator('#mgBillingPlan option[value=pilot]').count(),0);
 pilotFarm=null;
 await page.goto('http://127.0.0.1:8770/index.html',{waitUntil:'load'});assert.equal(await page.locator('#planos table').count(),0); const help=page.locator('#planos .pricing-whatsapp');assert.equal(await help.getAttribute('target'),'_blank');assert.equal(new URL(await help.getAttribute('href')).pathname,'/5535999655305');assert.match(await page.locator('#planos .pricing-help').innerText(),/dúvida/);await page.locator('[data-pricing-period=annual]').click();assert.match(await page.locator('[data-pricing-plan=complete] [data-plan-price]').innerText(),/1.440/);assert.equal(await page.locator('[data-pricing-plan=complete] [data-plan-contact]').innerText(),'Cadastre-se');
 await page.goto('http://127.0.0.1:8770/index.html?legal=terms',{waitUntil:'load'});await page.waitForTimeout(500);assert.ok(await page.getByRole('heading',{name:'Termos de Uso — Meu Gado'}).isVisible());
 // The public CTA opens signup on both screen sizes.
 await page.goto('http://127.0.0.1:8770/index.html',{waitUntil:'load'});
 for(const width of [1365,390]){
  await page.setViewportSize({width,height:900});
  const buttonStyles=await page.locator('[data-plan-contact]').evaluateAll(buttons=>buttons.map(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {background:s.backgroundColor,color:s.color,height:r.height,font:s.font,padding:s.padding,border:s.borderRadius};}));
  assert.deepEqual(buttonStyles[0],buttonStyles[1],'public signup buttons must have identical styles and heights');
  await page.locator('.header-actions .primary').click();
  assert.equal(await page.locator('#registerForm').evaluate(el=>el.classList.contains('active')),true);
  assert.equal(await page.locator('.header-actions .primary').innerText(),'Cadastre-se');
  await page.evaluate(()=>closeAuth());
  for(const plan of ['essential','complete']){
   const button=page.locator(`[data-pricing-plan=${plan}] [data-plan-contact]`);
   await button.click();assert.equal(await page.locator('#registerForm').evaluate(el=>el.classList.contains('active')),true);
   assert.match(page.url(),/index.html$/);assert.equal(await page.evaluate(()=>sessionStorage.getItem('mg-billing-choice')),null);
   await page.evaluate(()=>closeAuth());
  }
 }
 // The actual server-snapshot event opens the chooser after farm registration.
 enabled=true;contract=null;paid=false;
 async function entry(status,{intent=false,member=false,offline=false,delay=false}={}){
  Object.assign(farm,{status,plan:'essential',expires_at:status==='trial'?'2099-01-01T00:00:00Z':null});
  await page.goto('http://127.0.0.1:8770/app.html'+(intent?'?billing_plan=complete&billing_period=annual':''),{waitUntil:'load'});
  if(delay){await page.clock.install();await page.clock.fastForward(75000);}
  await page.evaluate(async({farm,member,offline})=>{
   document.getElementById('mgTestLoginGate')?.remove();document.documentElement.classList.remove('mg-route-boot');
   mgUser={id:'fixture-owner',email:'owner@example.com'};
   mgFarm={id:999,name:farm.farm_name,owner_id:member?'other-owner':mgUser.id};mgFarmRole=member?'member':'owner';
   mgSb.auth.getSession=async()=>({data:{session:{access_token:'fixture',user:mgUser}}});
   mgSb.rpc=async()=>({data:{...farm,farm_id:999,features:{},server_now:new Date().toISOString()},error:null});
   if(offline){Object.defineProperty(navigator,'onLine',{value:false,configurable:true});return;}
   await mgRefreshPlan(mgFarm,true);
  },{farm,member,offline});
  if(delay)await page.clock.resume();
  await page.waitForTimeout(150);
 }
 await entry('pending',{delay:true});await page.locator('#mgBillingDialog').waitFor({state:'visible'});
 assert.equal(await page.locator('#mgBillingTitle').innerText(),'Escolha seu plano');
 assert.match(await page.locator('#mgBillingIntro').innerText(),/fazenda já está cadastrada/);
 await page.locator('#mgBillingClose').click();await page.evaluate(()=>mgRefreshPlan(mgFarm,true));await page.waitForTimeout(100);
 assert.equal(await page.locator('#mgBillingDialog').isVisible(),false,'refresh must not reopen dismissed onboarding');
 await entry('pending',{intent:true});await page.locator('#mgBillingDialog').waitFor({state:'visible'});
 assert.equal(await page.locator('#mgBillingPlan').inputValue(),'complete');assert.equal(await page.locator('#mgBillingPeriod').inputValue(),'annual');
 for(const status of ['trial','active','legacy']){await entry(status,{intent:status==='trial'});assert.equal(await page.locator('#mgBillingDialog').count(),0,status+' enters without automatic sales dialog');}
 await entry('pending',{member:true});assert.equal(await page.locator('#mgBillingDialog').count(),0,'members do not get owner checkout');
 await entry('pending',{offline:true});assert.equal(await page.locator('#mgBillingDialog').count(),0,'offline state does not trigger checkout');
 assert.deepEqual(errors,[]);console.log('PASS: customer/admin/landing/legal UI, consent, prices, checkout, payment status, cancellation, desktop/mobile. Signup CTA and automatic onboarding: pending, delayed registration, trial, active, legacy, member, offline, selected plan. Fixture provider transport only.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
