/* Production billing. A verified live seller and an explicit admin switch are required. */
export const PRICES={essential:{monthly:90,annual:900},complete:{monthly:130,annual:1440}};
export class SafeError extends Error{constructor(message,status=400){super(message);this.status=status;}}
export function planChoice(plan,period){if(!Object.hasOwn(PRICES,plan)||!Object.hasOwn(PRICES[plan],period))throw new SafeError('Plano ou período inválido.');return {amount:PRICES[plan][period],months:period==='annual'?12:1};}
export function validId(value){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value||''))throw new SafeError('Identificador inválido.');return value;}
export function liveSeller(u){return !!u&&u.site_id==='MLB'&&Array.isArray(u.tags)&&!u.tags.includes('test_user')&&/^\d+$/.test(String(u.id))&&!/@testuser\./i.test(u.email||'');}
export function normalizeStatus(status){if(status==='canceled')return 'cancelled';if(!['pending','authorized','paused','cancelled'].includes(status))throw new SafeError('Situação de assinatura inesperada.',502);return status;}
export function validateContract(s,c){const p=planChoice(c.plan,c.billing_period),r=s?.auto_recurring;
 if(String(s.id)!==c.provider_id||String(s.collector_id)!==c.seller_id||s.external_reference!=='mg-live:'+c.id||r?.currency_id!=='BRL'||Number(r.transaction_amount)!==p.amount||r.frequency_type!=='months'||Number(r.frequency)!==p.months||(c.payer_id&&String(s.payer_id)!==c.payer_id))throw new SafeError('A assinatura retornada não corresponde à contratação.',502);
 normalizeStatus(s.status);return s;
}
export function safeCheckout(value,id){let u;try{u=new URL(value);}catch{throw new SafeError('Link de pagamento indisponível.',502);}if(u.protocol!=='https:'||u.hostname!=='www.mercadopago.com.br'||u.pathname!=='/subscriptions/checkout'||u.searchParams.get('preapproval_id')!==String(id))throw new SafeError('Link de pagamento inválido.',502);return u.href;}
export function normalizePayment(p,c,payer,invoice=null){
 if(!/^\d+$/.test(String(p?.id))||p.live_mode!==true||String(p.collector_id)!==c.seller_id||String(p.payer?.id)!==String(payer)||p.currency_id!=='BRL'||Number(p.transaction_amount)!==c.amount)throw new SafeError('Pagamento incompatível com a contratação.',502);
 const linked=invoice?String(invoice.preapproval_id)===c.provider_id&&String(invoice.payment?.id)===String(p.id)&&Number(invoice.transaction_amount)===c.amount&&invoice.currency_id==='BRL':p.external_reference==='mg-live:'+c.id;
 if(!linked)throw new SafeError('Pagamento sem vínculo com a assinatura.',502);
 const modified=p.date_last_updated||p.date_created,approved=p.date_approved||null,refunded=Number(p.transaction_amount_refunded||0);
 if(!Number.isFinite(Date.parse(modified))||(p.status==='approved'&&!Number.isFinite(Date.parse(approved)))||!Number.isFinite(refunded)||refunded<0||refunded>c.amount)throw new SafeError('Datas ou valores de pagamento inválidos.',502);
 return {id:String(p.id),status:String(p.status),approved_at:approved,modified_at:modified,amount:Number(p.transaction_amount),refunded_amount:refunded};
}
export async function sha(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');}
export function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
export function publicContract(c){if(!c)return null;return {id:c.id,plan:c.plan,billing_period:c.billing_period,amount:c.amount,status:c.status,checkout_url:c.status==='pending'?c.checkout_url:null,paid_until:c.paid_until,activated:!!c.activated_at,needs_review:!!c.review_reason,checked_at:c.checked_at,created_at:c.created_at};}
export function createHandler(env,fetcher=fetch){
 const base=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY'),service=env('SUPABASE_SERVICE_ROLE_KEY');let sellerCache;
 async function db(path,opt={},jwt=service){
  const r=await fetcher(base+'/rest/v1/'+path,{...opt,headers:{apikey:jwt===service?service:anon,Authorization:'Bearer '+jwt,'Content-Type':'application/json',Prefer:'return=representation',...opt.headers},signal:AbortSignal.timeout(8000)});
  if(!r.ok){let e;try{e=await r.json();}catch{}if(path.startsWith('rpc/')&&['22023','42501','54000','40001'].includes(e?.code))throw new SafeError(e.message,e.code==='42501'?403:409);throw new SafeError('Não foi possível consultar a assinatura. Tente novamente.',502);}
  return r.status===204?null:await r.json();
 }
 const rpc=(name,body={},jwt=service)=>db('rpc/'+name,{method:'POST',body:JSON.stringify(body)},jwt);
 const settings=async()=>((await db('billing_settings?id=eq.true&limit=1'))[0]);
 async function mp(path,opt={}){
  const token=env('MP_ACCESS_TOKEN_PROD');if(!token)throw new SafeError('Contratação automática ainda em preparação.',503);
  const r=await fetcher('https://api.mercadopago.com'+path,{...opt,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...opt.headers},signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw new SafeError([401,403].includes(r.status)?'O Mercado Pago não autorizou a operação. Fale com o suporte.':`Não foi possível concluir a operação no Mercado Pago (HTTP ${r.status}). Consulte sua assinatura antes de tentar novamente.`,502);
  return r.json();
 }
 async function seller(){if(sellerCache?.until>Date.now())return sellerCache.value;const u=await mp('/users/me');if(!liveSeller(u))throw new SafeError('A credencial de produção deve pertencer à conta brasileira que receberá os pagamentos. Contas de teste não são aceitas.',503);sellerCache={value:u,until:Date.now()+60000};return u;}
 async function authenticate(req,admin=false){
  const h=req.headers.get('Authorization')||'';if(!h.startsWith('Bearer '))throw new SafeError('Entre em sua conta para continuar.',401);const jwt=h.slice(7);
  const r=await fetcher(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:h},signal:AbortSignal.timeout(8000)});if(!r.ok)throw new SafeError('Sua sessão expirou. Entre novamente.',401);const user=await r.json();
  if(admin&&await rpc('billing_test_is_admin',{},jwt)!==true)throw new SafeError('Acesso administrativo e verificação em duas etapas necessários.',403);
  return {user,jwt};
 }
 const patch=async(id,values)=>(await db('billing_contracts?id=eq.'+id,{method:'PATCH',body:JSON.stringify(values)}))[0];
 async function recover(c){
  if(c.provider_id)return c;
  const data=await mp('/preapproval/search?external_reference='+encodeURIComponent('mg-live:'+c.id));
  const found=(data.results||[]).filter(s=>s.external_reference==='mg-live:'+c.id);
  if(found.length>1)throw new SafeError('Contratação em conferência. Fale com o suporte.',409);
  if(!found.length)return c;
  const s=found[0],row={...c,provider_id:String(s.id)};validateContract(s,row);
  return patch(c.id,{provider_id:row.provider_id,payer_id:s.payer_id&&String(s.payer_id)!=='0'?String(s.payer_id):null,checkout_url:safeCheckout(s.init_point,s.id),status:normalizeStatus(s.status)});
 }
 async function reconcile(c,cancel=false){
  const account=await seller();if(String(account.id)!==c.seller_id)throw new SafeError('Conta recebedora diferente da contratação. Fale com o suporte.',409);
  const lease=crypto.randomUUID();if(!await rpc('billing_claim',{p_id:c.id,p_lease:lease}))throw new SafeError('Há uma consulta em andamento. Aguarde alguns instantes.',409);
  try{
   c=await recover(c);
   if(!c.provider_id){
    if(cancel){await patch(c.id,{status:'cancelled',checked_at:new Date().toISOString()});return publicContract(await patch(c.id,{lease_token:null,lease_until:null}));}
    throw new SafeError('A criação ainda não foi confirmada. Consulte novamente antes de iniciar outra contratação.',409);
   }
   let s=validateContract(await mp('/preapproval/'+encodeURIComponent(c.provider_id)),c);
   if(cancel&&normalizeStatus(s.status)!=='cancelled'){await mp('/preapproval/'+encodeURIComponent(c.provider_id),{method:'PUT',body:JSON.stringify({status:'cancelled'})});s=validateContract(await mp('/preapproval/'+encodeURIComponent(c.provider_id)),c);if(normalizeStatus(s.status)!=='cancelled')throw new SafeError('O cancelamento ainda não foi confirmado. Consulte novamente.',502);}
   const payer=String(s.payer_id||'0');
   const invoices=await mp('/authorized_payments/search?preapproval_id='+encodeURIComponent(c.provider_id));
   const search=await mp('/v1/payments/search?external_reference='+encodeURIComponent('mg-live:'+c.id)+'&sort=date_created&criteria=desc&limit=100');
   const map=new Map();for(const p of search.results||[])map.set(String(p.id),normalizePayment(p,c,payer));
   const invoiceRows=(invoices.results||[]).filter(x=>x.payment?.id).slice(0,30);
   for(let i=0;i<invoiceRows.length;i+=5){await Promise.all(invoiceRows.slice(i,i+5).map(async invoice=>{const id=String(invoice.payment.id);if(!/^\d+$/.test(id))throw new SafeError('Fatura inválida.',502);const p=await mp('/v1/payments/'+id);map.set(id,normalizePayment(p,c,payer,invoice));}));}
   // Re-read previously approved payments still inside an entitlement window, so
   // refunds/chargebacks are noticed even when provider search pagination changes.
   const known=await db('billing_payments?contract_id=eq.'+c.id+'&status=eq.approved&select=payment_id,approved_at&order=approved_at.desc&limit=20');
   for(const old of known){if(map.has(old.payment_id))continue;const age=Date.now()-Date.parse(old.approved_at);if(age>400*86400000)continue;const p=await mp('/v1/payments/'+encodeURIComponent(old.payment_id));const row=normalizePayment(p,c,payer,p.external_reference==='mg-live:'+c.id?null:{preapproval_id:c.provider_id,payment:{id:p.id},transaction_amount:c.amount,currency_id:'BRL'});map.set(row.id,row);}
   const result=await rpc('billing_apply',{p_id:c.id,p_lease:lease,p_status:normalizeStatus(s.status),p_payer:payer,p_payments:[...map.values()]});
   if(result.review_reason&&normalizeStatus(s.status)==='authorized'){
    // A manual access change wins. Stop future charges while the payment is reviewed.
    await mp('/preapproval/'+encodeURIComponent(c.provider_id),{method:'PUT',body:JSON.stringify({status:'cancelled'})});
    const current=validateContract(await mp('/preapproval/'+encodeURIComponent(c.provider_id)),c);
    if(normalizeStatus(current.status)==='cancelled')return publicContract(await patch(c.id,{status:'cancelled'}));
   }
   return publicContract(result);
  }finally{await db('billing_contracts?id=eq.'+c.id+'&lease_token=eq.'+lease,{method:'PATCH',body:JSON.stringify({lease_token:null,lease_until:null})}).catch(()=>{});}
 }
 async function handle(req){
  const origin=req.headers.get('Origin'),allowed=new Set(['https://www.sistemameugado.com.br','https://sistemameugado.com.br']);
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':allowed.has(origin)?origin:'https://www.sistemameugado.com.br','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin'};
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  try{
   if(origin&&!allowed.has(origin))throw new SafeError('Origem não permitida.',403);
   if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
   const url=new URL(req.url),action=url.pathname.split('/').filter(Boolean).pop();
   if(action==='availability'&&req.method==='GET'){const cfg=await settings();return reply({enabled:!!cfg.enabled&&!!env('MP_ACCESS_TOKEN_PROD')});}
   if(action==='notify'&&['GET','POST'].includes(req.method)){
    const id=validId(url.searchParams.get('contract')),token=url.searchParams.get('token');if(!/^[a-f0-9]{64}$/.test(token||''))throw new SafeError('Notificação não autorizada.',401);
    const c=(await db('billing_contracts?id=eq.'+id+'&limit=1'))[0];if(!c||!equal(await sha(token),c.notify_hash))throw new SafeError('Notificação não autorizada.',401);
    try{await reconcile(c);}catch(e){if(!(e instanceof SafeError&&e.status===409))throw e;}
    return reply({received:true});
   }
   if(action==='reconcile-due'&&req.method==='POST'){
    const raw=await req.text();if(raw.length>2048)throw new SafeError('Job inválido.',401);let envelope;try{envelope=JSON.parse(raw);}catch{throw new SafeError('Job inválido.',401);}
    if(!/^[0-9]{13}$/.test(String(envelope.ts))||Math.abs(Date.now()-Number(envelope.ts))>120000||! /^[0-9a-f]{64}$/.test(envelope.signature||''))throw new SafeError('Job expirado ou inválido.',401);
    validId(envelope.nonce);const secret=await rpc('billing_job_secret');
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signed=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(envelope.ts+':'+envelope.nonce))),x=>x.toString(16).padStart(2,'0')).join('');
    if(!equal(signed,envelope.signature))throw new SafeError('Job não autorizado.',401);
    if(!await rpc('billing_job_claim',{p_ts:Number(envelope.ts)}))return reply({processed:0,replayed:true});
    if(!env('MP_ACCESS_TOKEN_PROD'))return reply({processed:0});
    const cutoff=new Date(Date.now()-86400000).toISOString(),due=new Date(Date.now()-5*60000).toISOString();
    const rows=await db('billing_contracts?and=(or(status.neq.cancelled,paid_until.gt.'+encodeURIComponent(cutoff)+'),or(last_attempt_at.is.null,last_attempt_at.lt.'+encodeURIComponent(due)+'))&order=last_attempt_at.asc.nullsfirst&limit=20');
    let processed=0,failed=0;for(let i=0;i<rows.length;i+=3)await Promise.all(rows.slice(i,i+3).map(async c=>{try{await reconcile(c);processed++;}catch{failed++;}}));
    return reply({processed,failed});
   }
   if(req.method!=='POST')throw new SafeError('Método não permitido.',405);
   const admin=action==='admin-config'||action==='admin-enable'||action==='admin-list'||action==='admin-cancel'||action==='admin-resolve';const {user,jwt}=await authenticate(req,admin);
   const raw=await req.text();if(raw.length>8192)throw new SafeError('Solicitação muito grande.',413);let body;try{body=JSON.parse(raw||'{}');}catch{throw new SafeError('Solicitação inválida.');}
   if(action==='admin-config'){
    const cfg=await settings();if(!env('MP_ACCESS_TOKEN_PROD'))return reply({enabled:cfg.enabled,credential_present:false,ready:false});
    await seller();return reply({enabled:cfg.enabled,credential_present:true,ready:true});
   }
   if(action==='admin-enable'){
    if(typeof body.enabled!=='boolean')throw new SafeError('Configuração inválida.');const values={enabled:body.enabled,updated_at:new Date().toISOString(),updated_by:user.id};
    if(body.enabled)values.seller_id=String((await seller()).id);
    const cfg=await settings();if(body.enabled&&cfg.seller_id&&cfg.seller_id!==values.seller_id&&((await db('billing_contracts?status=neq.cancelled&limit=1')).length))throw new SafeError('Existem assinaturas vinculadas à conta anterior.',409);
    await db('billing_settings?id=eq.true',{method:'PATCH',body:JSON.stringify(values)});return reply({enabled:body.enabled});
   }
   if(action==='admin-list'){
    const rows=await db('billing_contracts?order=created_at.desc&limit=100');return reply({contracts:rows.map(c=>({...publicContract(c),farm_id:c.farm_id,review_reason:c.review_reason}))});
   }
   if(action==='admin-resolve'){
    const id=validId(body.id),c=(await db('billing_contracts?id=eq.'+id+'&limit=1'))[0];if(!c)throw new SafeError('Assinatura não encontrada.',404);
    if(c.status!=='cancelled')throw new SafeError('Cancele a renovação antes de concluir a conferência.',409);
    await patch(c.id,{review_reason:null});await db('billing_audit',{method:'POST',body:JSON.stringify({contract_id:c.id,action:'review_resolved',details:{actor_id:user.id}})});return reply({resolved:true});
   }
   if(action==='admin-cancel'){
    const id=validId(body.id),c=(await db('billing_contracts?id=eq.'+id+'&limit=1'))[0];if(!c)throw new SafeError('Assinatura não encontrada.',404);return reply({contract:await reconcile(c,true)});
   }
   const context=await rpc('billing_owner',{p_farm_id:body.farm_id??null},jwt);
   if(action==='context'){
    const cfg=await settings(),rows=await db('billing_contracts?farm_id=eq.'+context.farm_id+'&order=created_at.desc&limit=10');
    return reply({farm:context,enabled:cfg.enabled&&!!env('MP_ACCESS_TOKEN_PROD'),contracts:rows.map(publicContract)});
   }
   if(action==='create'){
    if(body.accepted_terms!==true)throw new SafeError('Confirme o valor e a renovação automática antes de continuar.');const id=validId(body.request_id),choice=planChoice(body.plan,body.billing_period);
    const cfg=await settings();if(!cfg.enabled)throw new SafeError('A contratação automática ainda está em preparação.',503);const account=await seller();if(String(account.id)!==cfg.seller_id)throw new SafeError('Conta recebedora alterada. Fale com o suporte.',503);
    const email=String(body.payer_email||user.email||'').trim().toLowerCase();if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||/@testuser\./i.test(email))throw new SafeError('Informe seu e-mail para o pagamento. Contas de teste não são aceitas.');
    const notify=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
    const reserved=await rpc('billing_reserve',{p_id:id,p_actor:user.id,p_farm_id:context.farm_id,p_plan:body.plan,p_period:body.billing_period,p_seller:String(account.id),p_notify_hash:await sha(notify)});let c=reserved.contract;
    if(!reserved.created){c=await recover(c);if(!c.provider_id)throw new SafeError('Esta tentativa já foi enviada. Consulte a assinatura antes de tentar novamente.',409);return reply({contract:publicContract(c)});}
    try{
     const s=await mp('/preapproval',{method:'POST',body:JSON.stringify({reason:'Meu Gado '+(c.plan==='essential'?'Essencial':'Completo')+' '+(c.billing_period==='annual'?'anual':'mensal'),external_reference:'mg-live:'+c.id,payer_email:email,auto_recurring:{frequency:choice.months,frequency_type:'months',transaction_amount:choice.amount,currency_id:'BRL'},back_url:'https://www.sistemameugado.com.br/app?billing_return='+c.id,notification_url:base+'/functions/v1/billing/notify?contract='+c.id+'&token='+notify,status:'pending'})});
     if(!/^[a-zA-Z0-9_-]{10,80}$/.test(s.id||''))throw new SafeError('Assinatura não confirmada.',502);const row={...c,provider_id:String(s.id)};validateContract(s,row);
     c=await patch(c.id,{provider_id:row.provider_id,payer_id:s.payer_id&&String(s.payer_id)!=='0'?String(s.payer_id):null,checkout_url:safeCheckout(s.init_point,s.id),status:normalizeStatus(s.status)});return reply({contract:publicContract(c)},201);
    }catch(e){await patch(c.id,{status:'creation_unknown'}).catch(()=>{});throw e;}
   }
   if(['refresh','cancel'].includes(action)){
    const id=validId(body.id),c=(await db('billing_contracts?id=eq.'+id+'&farm_id=eq.'+context.farm_id+'&limit=1'))[0];if(!c)throw new SafeError('Assinatura não encontrada.',404);return reply({contract:await reconcile(c,action==='cancel')});
   }
   throw new SafeError('Operação não encontrada.',404);
  }catch(e){return reply({error:e instanceof SafeError?e.message:'Não foi possível concluir. Tente novamente em instantes.'},e instanceof SafeError?e.status:500);}
 }
 return handle;
}
