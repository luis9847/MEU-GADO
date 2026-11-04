// Test billing only. There is deliberately no path to farm_subscriptions here.
export const PRICES = Object.freeze({essential:{monthly:90,annual:900},complete:{monthly:130,annual:1440}});
export class SafeError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export function selection(plan,period){
 if(!Object.hasOwn(PRICES,plan)||!Object.hasOwn(PRICES[plan],period))throw new SafeError('Plano ou período inválido.');
 return {amount:PRICES[plan][period],frequency:period==='annual'?12:1};
}
export function testAccount(user){return !!user&&user.site_id==='MLB'&&Array.isArray(user.tags)&&user.tags.includes('test_user');}
// A seller token sees another user's public profile; tags and email may be omitted.
// Missing private fields are not a failed identity check. The provider's created
// subscription must still bind the requested buyer ID before its checkout is exposed.
export function resolveBuyerEmail(buyer,input,expectedId,sellerId){
 if(!buyer||buyer.site_id!=='MLB'||String(buyer.id)!==expectedId||String(buyer.id)===sellerId||(Array.isArray(buyer.tags)&&!buyer.tags.includes('test_user')))throw new SafeError('Use uma conta COMPRADORA brasileira de teste, diferente da vendedora.');
 const entered=String(input||'').trim().toLowerCase(),known=String(buyer.email||'').trim().toLowerCase();
 if(known&&entered&&known!==entered)throw new SafeError('O e-mail informado não corresponde à conta compradora de teste.');
 const email=known||entered;
 if(!email)throw new SafeError('O Mercado Pago ocultou o e-mail desta conta. Preencha o e-mail exato do perfil da conta COMPRADORA de teste no campo abaixo do User ID.');
 if(email.length>254||! /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@testuser\.com$/i.test(email))throw new SafeError('Informe o e-mail da conta de teste terminado em @testuser.com. Não use seu e-mail pessoal.');
 return email;
}
export function numericId(value){if(!/^\d{5,20}$/.test(String(value||'')))throw new SafeError('Informe o User ID da conta compradora de teste.');return String(value);}
export function uuid(value){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value||''))throw new SafeError('Identificador de teste inválido.');return value;}
export function checkoutUrl(value,id){
 let u;try{u=new URL(value);}catch{throw new SafeError('O Mercado Pago não retornou um link válido.',502);}
 if(u.protocol!=='https:'||u.hostname!=='www.mercadopago.com.br'||u.pathname!=='/subscriptions/checkout'||u.searchParams.get('preapproval_id')!==String(id))throw new SafeError('Link de checkout inesperado.',502);
 return u.href;
}
export function validateSubscription(s,row){
 const p=selection(row.plan,row.billing_period),r=s?.auto_recurring;
 if(String(s.id)!==row.provider_id||String(s.collector_id)!==row.seller_id||String(s.payer_id)!==row.buyer_id||s.external_reference!=='mg-test:'+row.id||r?.currency_id!=='BRL'||Number(r.transaction_amount)!==p.amount||r.frequency_type!=='months'||Number(r.frequency)!==p.frequency)throw new SafeError('A assinatura retornada não corresponde a este teste.',502);
 return s;
}
export function paymentSummary(payment,invoice,row){
 if(String(invoice.preapproval_id)!==row.provider_id||String(invoice.payment?.id)!==String(payment.id)||String(payment.collector_id)!==row.seller_id||String(payment.payer?.id)!==row.buyer_id||payment.live_mode!==false||payment.currency_id!=='BRL'||Number(payment.transaction_amount)!==row.amount||Number(invoice.transaction_amount)!==row.amount||invoice.currency_id!=='BRL')throw new SafeError('O pagamento não corresponde ao teste esperado.',502);
 return {id:String(payment.id),status:String(payment.status),date:payment.date_approved||payment.date_created||null,amount:Number(payment.transaction_amount)};
}
export async function sha(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');}
export function constantEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
export function publicRow(r){return {id:r.id,plan:r.plan,billing_period:r.billing_period,amount:r.amount,status:r.status,provider_id:r.provider_id,checkout_url:r.checkout_url,payments:r.payments,created_at:r.created_at,checked_at:r.checked_at};}
export function createHandler(env,fetcher=fetch){
 const base=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY'),service=env('SUPABASE_SERVICE_ROLE_KEY');
 const origins=new Set(['https://www.sistemameugado.com.br','https://sistemameugado.com.br']);
 let sellerCache=null;
 async function db(path,options={},jwt=service){
  const r=await fetcher(base+'/rest/v1/'+path,{...options,headers:{apikey:jwt===service?service:anon,Authorization:'Bearer '+jwt,'Content-Type':'application/json',Prefer:'return=representation',...options.headers},signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw new SafeError('Não foi possível registrar ou consultar o teste.',502);
  return r.status===204?null:await r.json();
 }
 async function mp(path,options={}){
  const token=env('MP_ACCESS_TOKEN_TEST');if(!token)throw new SafeError('Cadastre MP_ACCESS_TOKEN_TEST nos Secrets do Supabase.',503);
  const r=await fetcher('https://api.mercadopago.com'+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(6500)});
  if(!r.ok)throw new SafeError([401,403].includes(r.status)?'O Mercado Pago recusou a chave de teste. Confira as credenciais.':`O Mercado Pago não concluiu a operação (HTTP ${r.status}). Confira a conta compradora e tente consultar o teste.`,502);
  return await r.json();
 }
 async function seller(){
  if(sellerCache&&sellerCache.until>Date.now())return sellerCache.user;
  const u=await mp('/users/me');if(!testAccount(u))throw new SafeError('A chave deve pertencer a uma conta brasileira de TESTE. Cobrança bloqueada.',503);
  sellerCache={user:u,until:Date.now()+60000};return u;
 }
 async function admin(req){
  const authorization=req.headers.get('Authorization')||'';if(!authorization.startsWith('Bearer '))throw new SafeError('Entre no painel administrativo.',401);
  const token=authorization.slice(7);
  const r=await fetcher(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:authorization},signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw new SafeError('Sua sessão expirou. Entre novamente.',401);
  const u=await r.json();
  const allowed=await db('rpc/billing_test_is_admin',{method:'POST',body:'{}'},token);
  if(allowed!==true)throw new SafeError('Acesso administrativo e verificação em duas etapas necessários.',403);
  return u;
 }
 async function patch(id,values){return (await db('billing_test_checkouts?id=eq.'+id,{method:'PATCH',body:JSON.stringify(values)}))[0];}
 async function reconcile(row){
  if(!row.provider_id)return row;
  const claimed=await db('rpc/billing_test_claim',{method:'POST',body:JSON.stringify({p_id:row.id})});
  if(!claimed)return row;
  const account=await seller();if(String(account.id)!==row.seller_id)throw new SafeError('A chave de teste foi alterada para outro vendedor.',409);
  const s=validateSubscription(await mp('/preapproval/'+encodeURIComponent(row.provider_id)),row);
  const data=await mp('/authorized_payments/search?preapproval_id='+encodeURIComponent(row.provider_id)+'&limit=20&offset=0');
  const invoices=(data.results||[]).filter(x=>x.payment?.id).sort((a,b)=>String(b.date_created).localeCompare(String(a.date_created))).slice(0,5);
  const payments=await Promise.all(invoices.map(async invoice=>paymentSummary(await mp('/v1/payments/'+numericId(invoice.payment.id)),invoice,row)));
  return patch(row.id,{status:s.status,payments,checked_at:new Date().toISOString()});
 }
 return async function handle(req){
  const origin=req.headers.get('Origin');const cors={'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://www.sistemameugado.com.br','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
  try{
   if(origin&&!origins.has(origin))throw new SafeError('Origem não permitida.',403);
   if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
   const url=new URL(req.url),action=url.pathname.split('/').filter(Boolean).pop();
   if(action==='health'&&req.method==='GET')return reply({configured:!!env('MP_ACCESS_TOKEN_TEST'),mode:'test',live_billing:false});
   if(action==='notify'&&['GET','POST'].includes(req.method)){
    const id=uuid(url.searchParams.get('checkout')),token=url.searchParams.get('token');
    if(!/^[a-f0-9]{64}$/.test(token||''))throw new SafeError('Notificação não autorizada.',401);
    const rows=await db('billing_test_checkouts?id=eq.'+id+'&limit=1'),row=rows[0];
    if(!row||!constantEqual(row.notify_hash,await sha(token)))throw new SafeError('Notificação não autorizada.',401);
    if(!row.provider_id)throw new SafeError('Teste ainda em criação. Tente novamente.',503);
    // The notification is only a wake-up signal; all status/amount/identity data comes from authenticated API reads.
    await reconcile(row);return reply({received:true});
   }
   if(req.method!=='POST')throw new SafeError('Método não permitido.',405);
   const user=await admin(req);
   if(Number(req.headers.get('Content-Length')||0)>8192)throw new SafeError('Solicitação muito grande.',413);
   const raw=await req.text();if(raw.length>8192)throw new SafeError('Solicitação muito grande.',413);
   let body;try{body=JSON.parse(raw||'{}');}catch{throw new SafeError('Solicitação inválida.');}
   if(action==='config'){await seller();return reply({configured:true,test_account:true,mode:'test',live_billing:false});}
   if(action==='list')return reply({checkouts:(await db('billing_test_checkouts?created_by=eq.'+user.id+'&order=created_at.desc&limit=20')).map(publicRow)});
   if(action==='create'){
    const id=uuid(body.request_id),plan=body.plan,period=body.billing_period,p=selection(plan,period),buyerId=numericId(body.buyer_id);
    const account=await seller(),buyer=await mp('/users/'+buyerId);
    const payerEmail=resolveBuyerEmail(buyer,body.buyer_email,buyerId,String(account.id));
    const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
    const reserved=await db('rpc/billing_test_reserve',{method:'POST',body:JSON.stringify({p_id:id,p_actor:user.id,p_plan:plan,p_period:period,p_buyer:buyerId,p_seller:String(account.id),p_notify_hash:await sha(token)})});
    const row=reserved.row;
    if(!reserved.created){
     if(row.plan!==plan||row.billing_period!==period||row.buyer_id!==buyerId)throw new SafeError('Este teste já possui outra configuração. Inicie um novo teste.',409);
     if(row.provider_id)return reply({checkout:publicRow(row)});
     throw new SafeError('Este teste já foi enviado. Consulte o histórico antes de iniciar outro para evitar duplicidade.',409);
    }
    try{
     const s=await mp('/preapproval',{method:'POST',body:JSON.stringify({reason:'[TESTE] Meu Gado '+(plan==='essential'?'Essencial':'Completo')+' '+(period==='annual'?'anual':'mensal'),external_reference:'mg-test:'+id,payer_email:payerEmail,auto_recurring:{frequency:p.frequency,frequency_type:'months',transaction_amount:p.amount,currency_id:'BRL'},back_url:'https://www.sistemameugado.com.br/admin?billing_test='+id,status:'pending',notification_url:base+'/functions/v1/billing-test/notify?checkout='+id+'&token='+token})});
     if(!/^[a-zA-Z0-9_-]{10,80}$/.test(s.id||''))throw new SafeError('Identificador inesperado do Mercado Pago.',502);
     // Verify the email resolved to the exact requested buyer, not just any test account.
     try{validateSubscription(s,{...row,provider_id:String(s.id)});}catch(error){
      await mp('/preapproval/'+encodeURIComponent(s.id),{method:'PUT',body:JSON.stringify({status:'cancelled'})}).catch(()=>{});
      throw new SafeError('O Mercado Pago não vinculou o e-mail ao User ID informado. Confira o e-mail exato da conta compradora de teste. Nenhum checkout foi liberado.',502);
     }
     const link=checkoutUrl(s.init_point,s.id);
     const saved=await patch(id,{provider_id:String(s.id),checkout_url:link,status:s.status||'pending'});
     return reply({checkout:publicRow(saved)},201);
    }catch(error){await patch(id,{status:'creation_unknown'}).catch(()=>{});throw error;}
   }
   if(['refresh','cancel'].includes(action)){
    const id=uuid(body.id),rows=await db('billing_test_checkouts?id=eq.'+id+'&created_by=eq.'+user.id+'&limit=1'),row=rows[0];
    if(!row)throw new SafeError('Teste não encontrado.',404);
    if(!row.provider_id)throw new SafeError('Criação ainda não confirmada. Confira esta referência no painel Mercado Pago: mg-test:'+row.id,409);
    if(action==='cancel'){
     const account=await seller();if(String(account.id)!==row.seller_id)throw new SafeError('Vendedor de teste diferente.',409);
     const s=validateSubscription(await mp('/preapproval/'+encodeURIComponent(row.provider_id)),row);
     if(s.status!=='cancelled')await mp('/preapproval/'+encodeURIComponent(row.provider_id),{method:'PUT',body:JSON.stringify({status:'cancelled'})});
     return reply({checkout:publicRow(await patch(row.id,{status:'cancelled',checked_at:new Date().toISOString()}))});
    }
    return reply({checkout:publicRow(await reconcile(row))});
   }
   throw new SafeError('Operação não encontrada.',404);
  }catch(error){return reply({error:error instanceof SafeError?error.message:'Não foi possível concluir. Tente novamente em instantes.'},error instanceof SafeError?error.status:500);}
 };
}
