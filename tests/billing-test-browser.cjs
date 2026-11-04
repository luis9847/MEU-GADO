// Real Chromium UI with fixture transport; no provider charges or user passwords.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://local').pathname);try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}}).listen(8769,'127.0.0.1');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader'],env:{...process.env,LD_LIBRARY_PATH:'/tmp/mg-chrome-runtime/al2023/lib'}});
 try{
  const page=await browser.newPage({viewport:{width:1365,height:950},serviceWorkers:'block'}),errors=[],attempts=[];let row=null,paid=false,configError=false;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route('https://**/*',r=>r.abort());
  await page.route('https://*/functions/v1/billing-test/*',async route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'}});
   const action=route.request().url().split('/').pop(),data=JSON.parse(route.request().postData()||'{}');let result={},status=200;
   if(action==='list')result={checkouts:row?[row]:[]};
   if(action==='config'){result=configError?{error:'Acesso administrativo e verificação em duas etapas necessários.'}:{configured:true};status=configError?403:200;}
   if(action==='create'){attempts.push(data);row={id:data.request_id,plan:data.plan,billing_period:data.billing_period,amount:90,provider_id:'provider1234567890',checkout_url:'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=provider1234567890',status:'pending',payments:[]};result={checkout:row};}
   if(action==='refresh'){row.status='authorized';row.payments=paid?[{id:'33333',status:'approved',amount:90}]:[];result={checkout:row};}
   if(action==='cancel'){row.status='cancelled';result={checkout:row};}
   return route.fulfill({status,headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json'},body:JSON.stringify(result)});
  });
  await page.goto('http://127.0.0.1:8769/admin.html',{waitUntil:'load'});
  await page.evaluate(async()=>{
   sb.auth.getSession=async()=>({data:{session:{access_token:'fixture'}}});sb.from=()=>{const q={select(){return q},order(){return q},range(){return q},then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject)}};return q;};
   document.getElementById('loginPage').classList.add('hidden');document.getElementById('app').classList.remove('hidden');await loadData();
  });
  await page.locator('#navPlans').click();await page.waitForFunction(()=>document.getElementById('billingTestStatus').textContent.includes('pronta'));
  await page.locator('#billingTestCreate').click();assert.match(await page.locator('#billingTestStatus').innerText(),/Copie o User ID/);assert.equal(attempts.length,0);
  for(const [plan,period,value] of [['essential','monthly','90,00'],['essential','annual','900,00'],['complete','monthly','130,00'],['complete','annual','1.440,00']]){await page.locator('#billingTestPlan').selectOption(plan);await page.locator('#billingTestPeriod').selectOption(period);assert.ok((await page.locator('#billingTestPrice').innerText()).includes(value));}
  await page.locator('#billingTestPlan').selectOption('essential');await page.locator('#billingTestPeriod').selectOption('monthly');await page.locator('#billingTestBuyer').fill('22222');await page.locator('#billingTestCreate').click();await page.waitForFunction(()=>document.getElementById('billingTestStatus').textContent.includes('criado'));
  assert.equal(attempts.length,1);assert.equal(await page.locator('#billingTestResult a').getAttribute('rel'),'noopener noreferrer');
  await page.locator('#billingTestCreate').click();await page.waitForFunction(()=>document.getElementById('billingTestStatus').textContent.includes('criado'));assert.equal(attempts[0].request_id,attempts[1].request_id);
  await page.locator('#billingTestResult').getByRole('button',{name:'Consultar resultado'}).click();await page.waitForFunction(()=>document.getElementById('billingTestStatus').textContent.includes('consultado'));
  assert.match(await page.locator('#billingTestHistory').innerText(),/nenhum pagamento aprovado/);
  paid=true;await page.locator('#billingTestHistory').getByRole('button',{name:'Consultar resultado'}).click();await page.waitForFunction(()=>document.getElementById('billingTestHistory').textContent.includes('Pagamento aprovado'));
  assert.match(await page.locator('#billingTestHistory').innerText(),/Teste sem liberação de acesso/);
  for(const width of [1365,390]){await page.setViewportSize({width,height:950});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'/tmp/mg-billing-test-'+width+'.png',fullPage:true});}
  await page.locator('#billingTestHistory').getByRole('button',{name:'Cancelar assinatura de teste'}).click();await page.waitForFunction(()=>document.getElementById('billingTestHistory').textContent.includes('Assinatura cancelada'));assert.equal(await page.getByRole('button',{name:'Cancelar assinatura de teste'}).count(),0);
  configError=true;await page.locator('#billingTestConnection').click();await page.waitForFunction(()=>document.getElementById('billingTestStatus').textContent.includes('duas etapas'));
  assert.deepEqual(errors,[]);console.log('PASS: actual admin UI, all prices, empty history, invalid buyer, idempotent request, checkout link, unpaid/approved distinction, cancellation, denied auth, desktop/mobile, no page errors. Fixture provider transport.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1)});
