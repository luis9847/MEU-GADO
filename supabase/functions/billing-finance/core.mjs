/* Read-only financial ledger. Uses the existing platform-admin/MFA guard. */
export function createHandler(env,fetcher=fetch){
 const base=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY'),service=env('SUPABASE_SERVICE_ROLE_KEY');
 const allowed=new Set(['https://www.sistemameugado.com.br','https://sistemameugado.com.br']);
 return async req=>{
  const origin=req.headers.get('Origin'),headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':allowed.has(origin)?origin:'https://www.sistemameugado.com.br','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET,OPTIONS','Vary':'Origin'};
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  try{
   if(origin&&!allowed.has(origin))return reply({error:'Origem não permitida.'},403);
   if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
   if(req.method!=='GET')return reply({error:'Método não permitido.'},405);
   const authorization=req.headers.get('Authorization')||'';
   if(!authorization.startsWith('Bearer '))return reply({error:'Entre novamente no admin.'},401);
   const auth=await fetcher(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:authorization},signal:AbortSignal.timeout(8000)});
   if(!auth.ok)return reply({error:'Sua sessão expirou. Entre novamente.'},401);
   const guard=await fetcher(base+'/rest/v1/rpc/billing_test_is_admin',{method:'POST',headers:{apikey:anon,Authorization:authorization,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(8000)});
   if(!guard.ok||await guard.json()!==true)return reply({error:'Acesso exclusivo do administrador. Conclua a verificação em duas etapas, se solicitada.'},403);
   // Keyset pagination avoids the default API row limit and never silently truncates totals.
   async function all(table,select,key){
    let cursor=null;const rows=[];
    for(let page=0;page<200;page++){
     const q=new URLSearchParams({select,order:key+'.asc',limit:'500'});if(cursor!==null)q.set(key,'gt.'+cursor);
     const r=await fetcher(base+'/rest/v1/'+table+'?'+q,{headers:{apikey:service,Authorization:'Bearer '+service},signal:AbortSignal.timeout(8000)});
     if(!r.ok)throw Error('read');const batch=await r.json();if(!Array.isArray(batch))throw Error('format');rows.push(...batch);
     if(batch.length<500)return rows;
     const next=String(batch.at(-1)[key]);if(next===cursor)throw Error('pagination');cursor=next;
    }
    throw Error('limit');
   }
   const [contracts,payments,farms]=await Promise.all([
    all('billing_contracts','id,farm_id,plan,billing_period,amount,status,review_reason,paid_until,created_at,checked_at','id'),
    all('billing_payments','payment_id,contract_id,status,approved_at,amount,refunded_amount,provider_modified_at,observed_at','payment_id'),
    all('farms','id,name','id')
   ]);
   return reply({contracts,payments,farms,generated_at:new Date().toISOString()});
  }catch{return reply({error:'Não foi possível carregar o financeiro completo. Tente atualizar novamente.'},502);}
 };
}
