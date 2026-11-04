import test from 'node:test';import assert from 'node:assert/strict';import {createHandler,planChoice,liveSeller,normalizePayment,validateContract,sha} from '../supabase/functions/billing/core.mjs';
const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',provider='production1234567';
function fixture(opts={}){
 let cfg={enabled:opts.enabled!==false,seller_id:'11111'},row=null,callback=null,claimedTs=0;const calls=[],applied=[];
 const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
 const payment=()=>({id:'44444',status:'approved',live_mode:opts.fakePayment?false:true,collector_id:'11111',payer:{id:'22222'},external_reference:'mg-live:'+id,currency_id:'BRL',transaction_amount:opts.wrongAmount?1:row.amount,date_created:new Date().toISOString(),date_last_updated:new Date().toISOString(),date_approved:new Date().toISOString()});
 const subscription=()=>({id:provider,status:opts.remoteStatus||'authorized',payer_id:'22222',collector_id:'11111',external_reference:'mg-live:'+id,auto_recurring:{frequency:row.billing_period==='annual'?12:1,frequency_type:'months',transaction_amount:row.amount,currency_id:'BRL'}});
 const fetcher=async(url,opt={})=>{calls.push({url,opt});const u=new URL(url),body=opt.body?JSON.parse(opt.body):null,path=u.pathname;
 if(u.hostname==='supabase.test'){
  if(path==='/auth/v1/user'){const token=opt.headers.Authorization;if(!['Bearer owner','Bearer admin'].includes(token))return response({},401);return response({id:token==='Bearer admin'?'admin-id':'owner-id',email:'owner@example.com'});}
  const p=path.replace('/rest/v1/','');
  if(p==='rpc/billing_test_is_admin')return response(opt.headers.Authorization==='Bearer admin');
  if(p==='rpc/billing_owner'){if(body.p_farm_id&&body.p_farm_id!==999)return response({code:'42501',message:'Fazenda de outro proprietário.'},403);return response({farm_id:999,farm_name:'Teste',plan:'essential',status:'pending',revision:1,active_heads:0});}
  if(p==='billing_settings'){if(opt.method==='PATCH')cfg={...cfg,...body};return response([cfg]);}
  if(p==='rpc/billing_reserve'){if(row)return response({created:false,contract:row});row={id,farm_id:999,created_by:'owner-id',plan:body.p_plan,billing_period:body.p_period,amount:planChoice(body.p_plan,body.p_period).amount,seller_id:'11111',payer_id:null,status:'creating',provider_id:null,notify_hash:body.p_notify_hash};return response({created:true,contract:row});}
  if(p==='billing_contracts'){if(opt.method==='PATCH'){row={...row,...body};return response([row]);}if(u.searchParams.get('farm_id')&&u.searchParams.get('farm_id')!=='eq.999')return response([]);return response(row?[row]:[]);}
  if(p==='rpc/billing_claim')return response(!opts.busy);
  if(p==='billing_audit')return response([]);
  if(p==='billing_payments')return response([]);
  if(p==='rpc/billing_apply'){applied.push(body);row={...row,status:body.p_status,activated_at:body.p_status==='authorized'&&body.p_payments.some(x=>x.status==='approved')?new Date().toISOString():null,paid_until:body.p_payments.length?'2027-01-01T00:00:00Z':null};return response(row);}
  if(p==='rpc/billing_job_secret')return response('non-public-job-signing-key');
  if(p==='rpc/billing_job_claim'){const yes=body.p_ts>claimedTs;claimedTs=Math.max(claimedTs,body.p_ts);return response(yes);}
 }
 if(u.hostname==='api.mercadopago.com'){
  assert.equal(opt.headers.Authorization,'Bearer production-secret');
  if(path==='/users/me')return response({id:'11111',site_id:'MLB',tags:opts.testSeller?['test_user']:['normal'],email:'seller@example.com'});
  if(path==='/preapproval'&&opt.method==='POST'){callback=body.notification_url;return response({...subscription(),status:'pending',init_point:'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id='+provider});}
  if(path==='/preapproval/search')return response({results:[]});
  if(path==='/preapproval/'+provider)return response({...subscription(),status:opts.cancelled?'cancelled':opts.remoteStatus||'authorized'});
  if(path==='/authorized_payments/search')return response({results:[]});
  if(path==='/v1/payments/search')return response({results:opts.noPayment?[]:[payment()]});
  if(path==='/v1/payments/44444')return response(payment());
 }
 throw Error('Unexpected route '+url);
 };
 const env=k=>({SUPABASE_URL:'https://supabase.test',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server-only',MP_ACCESS_TOKEN_PROD:opts.noToken?undefined:'production-secret'})[k];
 const handler=createHandler(env,fetcher);
 const request=async(action,body={},token='owner')=>{const r=await handler(new Request('https://supabase.test/functions/v1/billing/'+action,{method:'POST',headers:token?{Authorization:'Bearer '+token}:undefined,body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};};
 const create=extra=>request('create',{request_id:id,plan:'essential',billing_period:'monthly',accepted_terms:true,...extra});
 return {handler,request,create,calls,applied,get row(){return row;},get callback(){return callback;}};
}
test('production catalogue and recurrence enforce all agreed values',()=>{assert.deepEqual(planChoice('essential','annual'),{amount:900,months:12});assert.deepEqual(planChoice('complete','annual'),{amount:1440,months:12});assert.deepEqual(planChoice('essential','monthly'),{amount:90,months:1});assert.deepEqual(planChoice('complete','monthly'),{amount:130,months:1});assert.throws(()=>planChoice('__proto__','monthly'));});
test('real seller gate fails closed on missing metadata, test accounts and foreign accounts',()=>{assert.equal(liveSeller({id:12345,site_id:'MLB',tags:['normal'],email:'real@example.com'}),true);for(const u of [{id:12345,site_id:'MLB'},{id:12345,site_id:'MLB',tags:['test_user']},{id:12345,site_id:'MLA',tags:[]}])assert.equal(liveSeller(u),false);});
test('missing production token and disabled setting cannot create a checkout',async()=>{for(const o of [{noToken:true},{enabled:false},{testSeller:true}]){const f=fixture(o);assert.notEqual((await f.create()).status,201);assert.equal(f.calls.filter(x=>new URL(x.url).pathname==='/preapproval').length,0);}});
test('authentication, owner isolation and explicit consent precede external checkout creation',async()=>{const f=fixture();assert.equal((await f.request('create',{},null)).status,401);assert.equal((await f.create({farm_id:1000})).status,403);assert.equal((await f.create({accepted_terms:false})).status,400);assert.equal(f.calls.filter(x=>new URL(x.url).pathname==='/preapproval').length,0);});
test('authenticated create ignores browser price and preserves its idempotent UUID',async()=>{const f=fixture();let r=await f.create({amount:1,status:'active'});assert.equal(r.status,201);assert.equal(r.data.contract.amount,90);await f.create();assert.equal(f.calls.filter(x=>new URL(x.url).pathname==='/preapproval').length,1);assert.equal(JSON.stringify(r).includes('notify_hash'),false);assert.equal(JSON.stringify(r).includes('production-secret'),false);const payload=JSON.parse(f.calls.find(x=>new URL(x.url).pathname==='/preapproval').opt.body);assert.equal(payload.status,'pending');assert.equal(payload.auto_recurring.transaction_amount,90);});
test('the initial live payment is fetched, verified and submitted only to the service-only ledger RPC',async()=>{const f=fixture();await f.create();const r=await f.request('refresh',{id});assert.equal(r.status,200);assert.equal(f.applied.length,1);assert.equal(f.applied[0].p_payments[0].amount,90);assert.ok(r.data.contract.activated);assert.equal(f.calls.some(x=>x.url.includes('/farm_subscriptions')),false);});
test('test-mode payments and mismatching amounts never reach access activation',async()=>{for(const o of [{fakePayment:true},{wrongAmount:true}]){const f=fixture(o);await f.create();assert.equal((await f.request('refresh',{id})).status,502);assert.equal(f.applied.length,0);}});
test('authorization without payment does not claim paid access',async()=>{const f=fixture({noPayment:true});await f.create();const r=await f.request('refresh',{id});assert.equal(r.data.contract.activated,false);assert.deepEqual(f.applied[0].p_payments,[]);});
test('forged notification payload is ignored and an unknown notification secret is refused',async()=>{const f=fixture({noPayment:true});await f.create();let r=await f.handler(new Request('https://supabase.test/functions/v1/billing/notify?contract='+id+'&token='+'0'.repeat(64),{method:'POST'}));assert.equal(r.status,401);r=await f.handler(new Request(f.callback,{method:'POST',body:JSON.stringify({status:'approved',amount:999999})}));assert.equal(r.status,200);assert.deepEqual(f.applied[0].p_payments,[]);});
test('only an MFA-authorized administrator may activate checkout',async()=>{const f=fixture({enabled:false});assert.equal((await f.request('admin-enable',{enabled:true},'owner')).status,403);assert.equal((await f.request('admin-enable',{enabled:true},'admin')).status,200);const missing=fixture({noToken:true});const r=await missing.request('admin-config',{},'admin');assert.equal(r.data.credential_present,false);});
test('cron requests require a fresh HMAC envelope and cannot be replayed',async()=>{const f=fixture({noToken:true});const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('non-public-job-signing-key'),{name:'HMAC',hash:'SHA-256'},false,['sign']);const body={ts:String(Date.now()),nonce:id};body.signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body.ts+':'+id))),x=>x.toString(16).padStart(2,'0')).join('');
 const send=async data=>{const r=await f.handler(new Request('https://supabase.test/functions/v1/billing/reconcile-due',{method:'POST',body:JSON.stringify(data)}));return {status:r.status,data:await r.json()};};
 assert.equal((await send({...body,signature:'0'.repeat(64)})).status,401);assert.equal((await send({...body,ts:String(Date.now()-300000)})).status,401);assert.equal((await send(body)).status,200);assert.equal((await send(body)).data.replayed,true);
});
test('payment and subscription identity substitution is rejected',()=>{const c={id,provider_id:provider,plan:'essential',billing_period:'monthly',amount:90,seller_id:'11111',payer_id:'22222'};assert.throws(()=>validateContract({},c));const p={id:'44444',live_mode:true,collector_id:'11111',payer:{id:'22222'},external_reference:'mg-live:'+id,currency_id:'BRL',transaction_amount:90,status:'approved',date_approved:new Date().toISOString(),date_created:new Date().toISOString()};assert.equal(normalizePayment(p,c,'22222').amount,90);for(const bad of [{external_reference:'mg-test:'+id},{collector_id:'other'},{payer:{id:'other'}},{live_mode:false},{currency_id:'USD'}])assert.throws(()=>normalizePayment({...p,...bad},c,'22222'));});

test('an admin can finish a cancelled payment review without activating access; owner cannot',async()=>{const f=fixture();await f.create();assert.equal((await f.request('admin-resolve',{id},'owner')).status,403);assert.equal((await f.request('admin-resolve',{id},'admin')).status,409);f.row.status='cancelled';f.row.review_reason='access_changed';assert.equal((await f.request('admin-resolve',{id},'admin')).status,200);assert.equal(f.row.review_reason,null);assert.equal(f.applied.length,0);});
