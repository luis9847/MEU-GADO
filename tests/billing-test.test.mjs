import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,selection,testAccount,checkoutUrl,validateSubscription,paymentSummary,publicRow,constantEqual,resolveBuyerEmail} from '../supabase/functions/billing-test/core.mjs';
import fs from 'node:fs';
const id='11111111-1111-4111-8111-111111111111',provider='provider1234567890';
function fixture(options={}){
 const rows=new Map(),calls=[];let callback;
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
 const rowBase={id,plan:'essential',billing_period:'monthly',amount:90,buyer_id:'22222',seller_id:'11111',provider_id:provider};
 function sub(row){return {id:provider,status:options.subscriptionStatus||'authorized',collector_id:'11111',payer_id:'22222',external_reference:'mg-test:'+row.id,auto_recurring:{frequency:row.billing_period==='annual'?12:1,frequency_type:'months',transaction_amount:row.amount,currency_id:'BRL'}};}
 const fetcher=async(url,opt={})=>{
  calls.push({url,opt});const u=new URL(url),body=opt.body?JSON.parse(opt.body):null;
  if(u.hostname==='supabase.test'){
   if(u.pathname==='/auth/v1/user')return opt.headers.Authorization==='Bearer admin'?json({id:'actor'}):json({},401);
   const path=u.pathname.replace('/rest/v1/','');
   if(path==='rpc/billing_test_is_admin')return json(!options.noAdmin);
   if(path==='rpc/billing_test_claim')return json(true);
   if(path==='rpc/billing_test_reserve'){
    if(rows.has(body.p_id))return json({created:false,row:rows.get(body.p_id)});
    const row={...rowBase,id:body.p_id,plan:body.p_plan,billing_period:body.p_period,amount:selection(body.p_plan,body.p_period).amount,provider_id:null,status:'creating',notify_hash:body.p_notify_hash,payments:[],created_at:new Date().toISOString()};rows.set(row.id,row);return json({created:true,row});
   }
   if(path==='billing_test_checkouts'){
    const key=u.searchParams.get('id')?.slice(3);
    if(opt.method==='PATCH'){const row={...rows.get(key),...body};rows.set(key,row);return json([row]);}
    return json(key?(rows.has(key)?[rows.get(key)]:[]):[...rows.values()]);
   }
  }
  if(u.hostname==='api.mercadopago.com'){
   assert.equal(opt.headers.Authorization,'Bearer secret-test-token');
   if(u.pathname==='/users/me')return json({id:'11111',site_id:'MLB',tags:options.realSeller?[]:['test_user']});
   if(u.pathname==='/users/22222')return json(options.publicBuyer?{id:'22222',site_id:'MLB',user_type:'normal',nickname:'TESTUSER12345'}:{id:'22222',site_id:'MLB',tags:options.realBuyer?[]:['test_user'],email:'buyer@testuser.com'});
   if(u.pathname==='/preapproval'&&opt.method==='POST'){
    callback=body.notification_url;
    if(options.providerFailure)return json({message:'contains secret-test-token'},500);
    return json({...sub([...rows.values()][0]),payer_id:options.otherBuyer?'99999':'22222',status:'pending',init_point:'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id='+provider});
   }
   if(u.pathname==='/preapproval/'+provider)return json(sub([...rows.values()][0]));
   if(u.pathname==='/authorized_payments/search')return json({results:options.noPayment?[]:[{preapproval_id:provider,currency_id:'BRL',transaction_amount:[...rows.values()][0].amount,payment:{id:'33333'},date_created:'2026-11-04'}]});
   if(u.pathname==='/v1/payments/33333')return json({id:'33333',collector_id:'11111',payer:{id:'22222'},live_mode:!!options.livePayment,currency_id:'BRL',transaction_amount:options.wrongAmount?1:[...rows.values()][0].amount,status:'approved'});
  }
  throw Error('Unexpected route '+url);
 };
 const env=k=>({SUPABASE_URL:'https://supabase.test',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server',MP_ACCESS_TOKEN_TEST:'secret-test-token'})[k];
 const handle=createHandler(env,fetcher);
 const request=async(action,body={},token='admin')=>{const r=await handle(new Request('https://supabase.test/functions/v1/billing-test/'+action,{method:'POST',headers:token?{Authorization:'Bearer '+token,'Content-Type':'application/json'}:{},body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};};
 const create=(extra={})=>request('create',{request_id:id,plan:'essential',billing_period:'monthly',buyer_id:'22222',...extra});
 return {handle,request,create,calls,rows,get callback(){return callback;}};
}
test('all four prices and frequencies match the live commercial catalogue',()=>{const source=fs.readFileSync(new URL('../plans-core.js',import.meta.url),'utf8');for(const [p,period,amount,freq] of [['essential','monthly',90,1],['essential','annual',900,12],['complete','monthly',130,1],['complete','annual',1440,12]])assert.deepEqual(selection(p,period),{amount,frequency:freq});assert.match(source,/monthly:90,annual:900/);assert.match(source,/monthly:130,annual:1440/);assert.throws(()=>selection('__proto__','monthly'));});
test('unauthenticated or non-admin/MFA-denied callers cannot reach the payment provider',async()=>{for(const opts of [{},{noAdmin:true}]){const f=fixture(opts);const r=await f.request('create',{},opts.noAdmin?'admin':null);assert.ok([401,403].includes(r.status));assert.equal(f.calls.some(x=>x.url.includes('mercadopago')),false);}});
test('real seller and real buyer accounts are refused before creating any subscription',async()=>{for(const opts of [{realSeller:true},{realBuyer:true}]){const f=fixture(opts);assert.notEqual((await f.create()).status,201);assert.equal(f.calls.filter(x=>new URL(x.url).pathname==='/preapproval').length,0);}});
test('checkout creation uses server price and pending state, never browser amounts or access flags',async()=>{const f=fixture();const r=await f.create({amount:1,status:'active',farm_id:99});assert.equal(r.status,201);assert.equal(r.data.checkout.amount,90);const sent=JSON.parse(f.calls.find(x=>new URL(x.url).pathname==='/preapproval').opt.body);assert.equal(sent.auto_recurring.transaction_amount,90);assert.equal(sent.status,'pending');assert.equal(sent.external_reference,'mg-test:'+id);assert.equal(JSON.stringify(r).includes('secret-test-token'),false);assert.equal(JSON.stringify(r).includes('notify_hash'),false);assert.equal(f.calls.some(x=>x.url.includes('farm_subscriptions')),false);});
test('the same attempt reuses its checkout and does not create another subscription',async()=>{const f=fixture();await f.create();await f.create();assert.equal(f.calls.filter(x=>new URL(x.url).pathname==='/preapproval').length,1);assert.equal((await f.create({plan:'complete'})).status,409);});
test('uncertain provider responses retain attempt and hide provider error bodies',async()=>{const f=fixture({providerFailure:true});const r=await f.create();assert.equal(r.status,502);assert.equal(JSON.stringify(r).includes('secret-test-token'),false);assert.equal(f.rows.get(id).status,'creation_unknown');assert.equal((await f.create()).status,409);});
test('redirect or authorization without an approved invoice is not payment confirmation',async()=>{const f=fixture({noPayment:true});await f.create();const r=await f.request('refresh',{id});assert.equal(r.data.checkout.status,'authorized');assert.deepEqual(r.data.checkout.payments,[]);assert.equal(f.calls.some(x=>x.url.includes('farm_subscriptions')),false);});
test('the confirmed test payment is fetched server side and checked for amount and test mode',async()=>{const f=fixture();await f.create();const r=await f.request('refresh',{id});assert.equal(r.status,200);assert.equal(r.data.checkout.payments[0].status,'approved');for(const opts of [{wrongAmount:true},{livePayment:true}]){const fail=fixture(opts);await fail.create();assert.equal((await fail.request('refresh',{id})).status,502);assert.deepEqual(fail.rows.get(id).payments,[]);}});
test('webhook requires a per-checkout secret and ignores forged payload data',async()=>{const f=fixture({noPayment:true});await f.create();let r=await f.handle(new Request('https://supabase.test/functions/v1/billing-test/notify?checkout='+id+'&token='+'0'.repeat(64),{method:'POST'}));assert.equal(r.status,401);r=await f.handle(new Request(f.callback,{method:'POST',body:JSON.stringify({status:'approved',amount:1})}));assert.equal(r.status,200);assert.deepEqual(f.rows.get(id).payments,[]);});
test('cancel calls provider without changing a real farm or deleting history',async()=>{const f=fixture();await f.create();const r=await f.request('cancel',{id});assert.equal(r.status,200);assert.equal(f.rows.get(id).status,'cancelled');assert.equal(f.calls.some(x=>x.opt.method==='PUT'&&JSON.parse(x.opt.body).status==='cancelled'),true);});
test('links, references and account metadata fail closed on substitution',()=>{assert.equal(testAccount({site_id:'MLB',tags:['test_user']}),true);assert.equal(testAccount({site_id:'MLB',tags:[]}),false);assert.throws(()=>checkoutUrl('https://www.mercadopago.com.br.evil.test/subscriptions/checkout?preapproval_id=x','x'));assert.throws(()=>validateSubscription({},{}));assert.throws(()=>paymentSummary({},{},{}));assert.equal(constantEqual('aa','aa'),true);assert.equal(constantEqual('aa','bb'),false);assert.equal(publicRow({id,notify_hash:'hidden'}).notify_hash,undefined);});

test('public buyer profiles omit email and tags: ask for exact test email rather than refusing valid ID',async()=>{
 const f=fixture({publicBuyer:true});let r=await f.create();assert.equal(r.status,400);assert.match(r.data.error,/ocultou o e-mail/);assert.equal(f.rows.size,0);
 r=await f.create({buyer_email:'buyer@testuser.com'});assert.equal(r.status,201);assert.equal(JSON.stringify(r.data).includes('buyer@testuser.com'),false);
});
test('real emails, foreign users, same-account buyer, and explicit non-test tags remain denied',()=>{
 const publicBuyer={id:'22222',site_id:'MLB'};
 assert.throws(()=>resolveBuyerEmail(publicBuyer,'real@gmail.com','22222','11111'));
 assert.throws(()=>resolveBuyerEmail({...publicBuyer,site_id:'MLA'},'buyer@testuser.com','22222','11111'));
 assert.throws(()=>resolveBuyerEmail(publicBuyer,'buyer@testuser.com','22222','22222'));
 assert.throws(()=>resolveBuyerEmail({...publicBuyer,tags:[]},'buyer@testuser.com','22222','11111'));
});
test('an email resolving to a different buyer is rejected before exposing any checkout link',async()=>{
 const f=fixture({publicBuyer:true,otherBuyer:true});const r=await f.create({buyer_email:'buyer@testuser.com'});assert.equal(r.status,502);assert.equal(r.data.checkout,undefined);
 assert.ok(f.calls.some(x=>x.opt.method==='PUT'&&JSON.parse(x.opt.body).status==='cancelled'));
});
