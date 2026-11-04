const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://local').pathname,file=path.join(root,pathname==='/'?'index.html':pathname);try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}}).listen(8770,'127.0.0.1');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader'],env:{...process.env,LD_LIBRARY_PATH:'/tmp/mg-chrome-runtime/al2023/lib'}});
 try{
 const page=await browser.newPage({viewport:{width:1365,height:950},serviceWorkers:'block'}),errors=[],requests=[];let enabled=true,contract=null,paid=false;
 const farm={farm_id:999,farm_name:'Fazenda de teste',plan:'essential',status:'pending',active_heads:10,expires_at:null};
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route('https://**/*',r=>r.abort());
 await page.route('https://*/functions/v1/billing/*',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'}});
  const action=route.request().url().split('/').pop(),body=JSON.parse(route.request().postData()||'{}');requests.push({action,body});let data={};
  if(action==='context')data={farm,enabled,contracts:contract?[contract]:[]};
  if(action==='availability')data={enabled};
  if(action==='create'){contract={id:body.request_id,plan:body.plan,billing_period:body.billing_period,amount:1440,status:'pending',checkout_url:'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=production1234567',activated:false};data={contract};}
  if(action==='refresh'){if(paid){contract.status='authorized';contract.activated=true;contract.paid_until='2027-11-04T12:00:00Z';Object.assign(farm,{status:'active',plan:'complete',expires_at:contract.paid_until});}data={contract};}
  if(action==='cancel'){contract.status='cancelled';contract.checkout_url=null;data={contract};}
  if(action==='admin-config')data={enabled,ready:false,credential_present:false};
  if(action==='admin-list')data={contracts:contract?[{...contract,farm_id:999,needs_review:true,review_reason:'access_changed'}]:[]};
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
 for(const width of [1365,390]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.getElementById('mgBillingDialog').getBoundingClientRect().width<=innerWidth));await page.screenshot({path:'/tmp/mg-production-billing-'+width+'.png'});}
 const expiry=contract.paid_until;await page.getByRole('button',{name:'Cancelar renovação',exact:true}).click();await page.waitForFunction(()=>document.getElementById('mgBillingContracts').textContent.includes('Renovação cancelada'));assert.equal(contract.paid_until,expiry);assert.equal(await page.locator('#mgBillingBuy').isDisabled(),true);
 enabled=false;await page.locator('#mgBillingClose').click();await page.evaluate(()=>window.mgOpenBilling());assert.match(await page.locator('#mgBillingAvailability').innerText(),/em preparação/);
 await page.goto('http://127.0.0.1:8770/admin.html',{waitUntil:'load'});await page.evaluate(async()=>{sb.auth.getSession=async()=>({data:{session:{access_token:'fixture'}}});sb.from=()=>{const q={select(){return q},order(){return q},range(){return q},then(a,b){return Promise.resolve({data:[],error:null}).then(a,b)}};return q;};document.getElementById('loginPage').classList.add('hidden');document.getElementById('app').classList.remove('hidden');await loadData();openView('plans');});
 await page.locator('#billingProductionCheck').click();await page.waitForFunction(()=>document.getElementById('billingProductionState').textContent.includes('MP_ACCESS_TOKEN_PROD'));assert.equal(await page.locator('#billingProductionEnable').isDisabled(),true);await page.locator('#billingProductionList').click();await page.getByRole('button',{name:'Concluir conferência'}).click();await page.waitForFunction(()=>document.getElementById('billingProductionState').textContent.includes('Conferência concluída'));assert.ok(requests.some(x=>x.action==='admin-resolve'));
 await page.goto('http://127.0.0.1:8770/index.html',{waitUntil:'load'});await page.locator('[data-pricing-period=annual]').click();assert.match(await page.locator('[data-pricing-plan=complete] [data-plan-contact]').getAttribute('href'),/billing_plan=complete&billing_period=annual/);assert.equal(await page.locator('[data-pricing-plan=complete] [data-plan-contact]').getAttribute('target'),null);
 await page.goto('http://127.0.0.1:8770/index.html?legal=terms',{waitUntil:'load'});await page.waitForTimeout(500);assert.ok(await page.getByRole('heading',{name:'Termos de Uso — Meu Gado'}).isVisible());
 assert.deepEqual(errors,[]);console.log('PASS: actual customer/admin/landing/legal UI, consent, annual price, authenticated checkout, pending/approved access, cancellation preserving validity, disabled production gate, desktop/mobile, no page errors. Fixture provider transport only.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
