import test from 'node:test';import assert from 'node:assert/strict';import {createHandler,planChoice,liveSeller,normalizePayment,validateContract,sha,validCpf,pixPayment,pixCheckout} from '../supabase/functions/billing/core.mjs';
const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',provider='production1234567';
function fixture(opts={}){
 let cfg={enabled:opts.enabled!==false,seller_id:'11111',...(opts.pilotOffer?{pilot_farm_id:999,pilot_owner_id:'owner-id',pilot_expires_at:new Date(Date.now()+3600000).toISOString()}:{} )},row=null,callback=null,claimedTs=0;const calls=[],applied=[];
 const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
 const payment=()=>({id:'44444',payment_method_id:'pix',status:opts.pixCancelled?'cancelled':opts.pixPending?'pending':'approved',transaction_amount_refunded:opts.refund?90:0,point_of_interaction:{transaction_data:{ticket_url:'https://www.mercadopago.com.br/payments/44444/ticket?hash=test'}},date_of_expiration:'2026-12-20T00:00:00Z',live_mode:opts.fakePayment?false:true,collector_id:'11111',payer:{id:'22222'},external_reference:'mg-live:'+id,currency_id:'BRL',transaction_amount:opts.wrongAmount?1:row.amount,date_created:new Date().toISOString(),date_last_updated:new Date().toISOString(),date_approved:new Date().toISOString()});
 const subscription=()=>({id:provider,status:opts.remoteStatus||'authorized',payer_id:'22222',collector_id:'11111',external_reference:'mg-live:'+id,auto_recurring:{frequency:row.billing_period==='annual'?12:1,frequency_type:'months',transaction_amount:row.amount,currency_id:'BRL'}});
 const fetcher=async(url,opt={})=>{calls.push({url,opt});const u=new URL(url),body=opt.body?JSON.parse(opt.body):null,path=u.pathname;
 if(u.hostname==='supabase.test'){
  if(path==='/auth/v1/user'){const token=opt.headers.Authorization;if(!['Bearer owner','Bearer admin'].includes(token))return response({},401);return response({id:token==='Bearer admin'?'admin-id':'owner-id',email:'owner@example.com'});}
  const p=path.replace('/rest/v1/','');
  if(p==='rpc/billing_test_is_admin')return response(opt.headers.Authorization==='Bearer admin');
  if(p==='rpc/billing_owner'){if(body.p_farm_id&&body.p_farm_id!==999)return response({code:'42501',message:'Fazenda de outro proprietário.'},403);return response({farm_id:999,farm_name:'Teste',plan:'essential',status:'pending',revision:1,active_heads:0});}
  if(p==='billing_settings'){if(opt.method==='PATCH')cfg={...cfg,...body};return response([cfg]);}
  if(p==='farms')return response([{id:999,owner_id:'owner-id',blocked:false,archived_at:null}]);
  if(p==='farm_subscriptions')return response([{status:'trial',expires_at:null}]);
  if(p==='rpc/billing_reserve_pilot'){
   if(!opts.pilotOffer)return response({code:'42501',message:'O piloto não está disponível.'},403);
   if(row)return response({created:false,contract:row});
   row={id:body.p_id,farm_id:999,created_by:body.p_actor,plan:'complete',billing_period:'monthly',is_pilot:true,amount:5,seller_id:'11111',payer_id:null,status:'creating',provider_id:null,notify_hash:body.p_notify_hash};return response({created:true,contract:row});
  }
  if(p==='rpc/billing_reserve_pix'){if(row)return response({created:false,contract:row});row={id,farm_id:999,created_by:'owner-id',plan:body.p_plan,billing_period:body.p_period,payment_method:'pix',amount:planChoice(body.p_plan,body.p_period).amount,seller_id:'11111',payer_id:null,status:'creating',provider_id:null,notify_hash:body.p_notify_hash};return response({created:true,contract:row});}
  if(p==='rpc/billing_reserve'){if(row)return response({created:false,contract:row});row={id,farm_id:999,created_by:'owner-id',plan:body.p_plan,billing_period:body.p_period,amount:planChoice(body.p_plan,body.p_period).amount,seller_id:'11111',payer_id:null,status:'creating',provider_id:null,notify_hash:body.p_notify_hash};return response({created:true,contract:row});}
  if(p==='billing_contracts'){if(u.searchParams.has('is_pilot'))return response(row?.is_pilot?[row]:[]);if(opt.method==='PATCH'){row={...row,...body};return response([row]);}if(u.searchParams.get('farm_id')&&u.searchParams.get('farm_id')!=='eq.999')return response([]);return response(row?[row]:[]);}
  if(p==='rpc/billing_claim')return response(!opts.busy);
  if(p==='billing_audit')return response([]);
  if(p==='billing_payments')return response([]);
  if(p==='rpc/billing_apply'){applied.push(body);row={...row,status:row.payment_method==='pix'?'cancelled':body.p_status,activated_at:body.p_status==='authorized'&&body.p_payments.some(x=>x.status==='approved')?new Date().toISOString():null,paid_until:body.p_payments.length?'2027-01-01T00:00:00Z':null};return response(row);}
  if(p==='rpc/billing_job_secret')return response('non-public-job-signing-key');
  if(p==='rpc/billing_job_claim'){const yes=body.p_ts>claimedTs;claimedTs=Math.max(claimedTs,body.p_ts);return response(yes);}
 }
 if(u.hostname==='api.mercadopago.com'){
  assert.equal(opt.headers.Authorization,'Bearer production-secret');
  if(path==='/v1/payments'&&opt.method==='POST'){assert.equal(opt.headers['X-Idempotency-Key'],id);assert.equal(body.payment_method_id,'pix');callback=body.notification_url;return response(payment());}
  if(path==='/users/me')return response({id:'11111',site_id:'MLB',tags:opts.testSeller?['test_user']:['normal'],email:'seller@example.com'});
  if(path==='/preapproval'&&opt.method==='POST'){callback=body.notification_url;return response({...subscription(),status:'pending',init_point:'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id='+provider});}
  if(path==='/preapproval/search')return response({results:[]});
  if(path==='/preapproval/'+provider)return response({...subscription(),status:opts.cancelled?'cancelled':opts.remoteStatus||'authorized'});
  if(path==='/authorized_payments/search')return response({results:[]});
  if(path==='/v1/payments/search')return response({results:opts.noPayment?[]:[payment()]});
  if(path==='/v1/payments/44444'){if(opt.method==='PUT')opts.pixCancelled=true;return response(payment());}
 }
 throw Error('Unexpected route '+url);
 };
 const env=k=>({SUPABASE_URL:'https://supabase.test',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server-only',MP_ACCESS_TOKEN_PROD:opts.noToken?undefined:'production-secret'})[k];
 const handler=createHandler(env,fetcher);
 const request=async(action,body={},token='owner')=>{const r=await handler(new Request('https://supabase.test/functions/v1/billing/'+action,{method:'POST',headers:token?{Authorization:'Bearer '+token}:undefined,body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};};
 const create=extra=>request('create',{request_id:id,plan:'essential',billing_period:'monthly',accepted_terms:true,...extra});
 return {handler,request,create,calls,applied,get row(){return row;},get callback(){return callback;}};
}

const pixRequest={request_id:id,plan:'essential',billing_period:'monthly',payment_method:'pix',payer_cpf:'529.982.247-25',accepted_terms:true};
test('Pix creates one provider charge with server price, idempotency and a safe hosted QR link',async()=>{const f=fixture({pixPending:true});const r=await f.request('create',{...pixRequest,amount:1});assert.equal(r.status,201);assert.equal(r.data.contract.payment_method,'pix');assert.equal(r.data.contract.amount,90);assert.match(r.data.contract.checkout_url,/payments\/44444\/ticket/);assert.equal(f.applied.length,0);assert.equal(f.calls.some(x=>new URL(x.url).pathname==='/preapproval'),false);await f.request('create',pixRequest);assert.equal(f.calls.filter(x=>new URL(x.url).pathname==='/v1/payments'&&x.opt.method==='POST').length,1);});
test('pending Pix cannot activate access; cancellation is confirmed at provider',async()=>{const f=fixture({pixPending:true});await f.request('create',pixRequest);assert.equal((await f.request('refresh',{id})).status,200);assert.equal(f.applied.length,0);const r=await f.request('cancel',{id});assert.equal(r.status,200);assert.equal(r.data.contract.status,'cancelled');assert.equal(f.applied.length,0);assert.equal(f.calls.some(x=>x.opt.method==='PUT'&&new URL(x.url).pathname==='/v1/payments/44444'),true);});
test('approved Pix reaches the access ledger and has no recurring subscription',async()=>{const f=fixture();await f.request('create',pixRequest);const r=await f.request('refresh',{id});assert.equal(r.status,200);assert.equal(r.data.contract.activated,true);assert.equal(r.data.contract.status,'cancelled');assert.equal(f.applied[0].p_payments[0].amount,90);assert.equal(f.calls.some(x=>new URL(x.url).pathname.includes('preapproval')),false);});
test('invalid CPF/method/owner and sandbox payments fail before creating or granting access',async()=>{const f=fixture();for(const cpf of ['11111111111','123','52998224724'])assert.equal((await f.request('create',{...pixRequest,payer_cpf:cpf})).status,400);assert.equal((await f.request('create',{...pixRequest,payment_method:'cash'})).status,400);assert.equal((await f.request('create',{...pixRequest,farm_id:998})).status,403);const bad=fixture({fakePayment:true});assert.equal((await bad.request('create',pixRequest)).status,502);assert.equal(bad.applied.length,0);});
test('switching method on an existing UUID is rejected',async()=>{const f=fixture();await f.create();assert.equal((await f.request('create',pixRequest)).status,409);});
test('Pix identity, recipient, currency, amount, mode and ticket URL substitutions are rejected',()=>{const c={id,provider_id:'44444',amount:90,seller_id:'11111'},p={id:'44444',payment_method_id:'pix',live_mode:true,collector_id:'11111',payer:{id:'22222'},currency_id:'BRL',external_reference:'mg-live:'+id,transaction_amount:90,status:'approved',date_created:new Date().toISOString(),date_approved:new Date().toISOString()};assert.equal(pixPayment(p,c).amount,90);for(const bad of [{id:'99999'},{payment_method_id:'visa'},{collector_id:'99999'},{live_mode:false},{currency_id:'USD'},{transaction_amount:5},{external_reference:'other'},{payer:{}}])assert.throws(()=>pixPayment({...p,...bad},c));assert.throws(()=>pixCheckout('https://evil.example/payments/44444/ticket','44444'));assert.equal(validCpf('529.982.247-25'),'52998224725');});
