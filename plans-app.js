/* Plan UX: server snapshot, account-scoped offline cache and clear locked states. */
let mgPlanState=null,mgPlanFetched=0,mgPlanOffset=0,mgPlanRequest=null;
const mgPlanNow=()=>Date.now()+mgPlanOffset;
const mgHasPlanFeature=key=>MGPlansCore.feature(mgPlanState,key);
function mgPlanCacheKey(farm){return 'mg-plan-v1:'+mgUser.id+':'+farm.id;}
async function mgRefreshPlan(farm,force=false){
 if(!farm||!mgUser)throw new Error('Carregue sua fazenda para consultar o plano.');
 if(mgPlanState?.farm_id===farm.id&&!force&&Date.now()-mgPlanFetched<60000)return mgPlanState;
 if(mgPlanRequest)return mgPlanRequest;
 mgPlanRequest=(async()=>{
  if(!navigator.onLine){
   const saved=JSON.parse(localStorage.getItem(mgPlanCacheKey(farm))||'null');
   if(!saved?.state||saved.state.farm_id!==farm.id)throw new Error('Conecte-se para validar o plano neste aparelho.');
   mgPlanState=saved.state;mgPlanOffset=saved.offset||0;
  }else{
   const {data,error}=await mgSb.rpc('get_farm_plan',{p_farm_id:Number(farm.id)});
   if(error){mgPlanState=null;mgPlanFetched=0;mgRenderPlan();throw new Error('Não foi possível validar seu plano. '+error.message);}
   mgPlanState=data;mgPlanOffset=Date.parse(data.server_now)-Date.now();
   try{localStorage.setItem(mgPlanCacheKey(farm),JSON.stringify({state:data,offset:mgPlanOffset}));}catch(_e){}
  }
  mgPlanFetched=Date.now();mgRenderPlan();
  window.dispatchEvent(new CustomEvent('mg:plan-ready',{detail:{farmId:farm.id,userId:mgUser.id}}));
  return mgPlanState;
 })();
 try{return await mgPlanRequest;}finally{mgPlanRequest=null;}
}
function mgPlanCanOpen(view){
 const feature=MGPlansCore.views[view];
 if(feature&&!mgPlanState)return false;
 if(feature&&!mgHasPlanFeature(feature)){mgPlanExplain('Este recurso está disponível no plano Completo.');return false;}
 return true;
}
function mgPlanExplain(message){
 let box=document.getElementById('mgPlanDialog');
 if(!box){box=document.createElement('dialog');box.id='mgPlanDialog';box.className='mg-plan-dialog';box.innerHTML='<h3>Seu plano Meu Gado</h3><p></p><button class="btn primary" type="button">Entendi</button>';box.querySelector('button').onclick=()=>box.close();document.body.append(box);}
 box.querySelector('p').textContent=message+' Para alterar o acesso, fale com o suporte pelo menu Ajuda.';
 if(!box.open)box.showModal();
}
async function mgPlanCheckRequest(path,opt={}){
 if(path==='/api/logout')return;
 if(!mgPlanState)await mgGetFarm();
 if(mgFarm)await mgRefreshPlan(mgFarm);
 const method=(opt.method||'GET').toUpperCase();
 if(method!=='GET'&&!MGPlansCore.writable(mgPlanState,mgPlanNow()))throw new Error('Seu acesso precisa ser liberado ou renovado. Seus dados estão preservados. Contate o suporte.');
 if(/^\/api\/expenses(?:\/|$)/.test(path)&&!mgHasPlanFeature('expenses')){
  // Startup and ordinary dashboards may request an empty collection; the expenses view stays locked.
  if(method!=='GET')throw new Error('O controle de gastos faz parte do plano Completo.');
 }
 if(path==='/api/animals'&&method==='POST'){
  const rows=await mgReadCachedResponse('/api/animals').catch(()=>null);
  if(rows){const error=MGPlansCore.admission(mgPlanState,rows.length,mgPlanNow());if(error)throw new Error(error);}
 }
}
function mgRenderPlan(){
 if(!document.body)return;
 let banner=document.getElementById('mgPlanBanner');
 if(!banner){banner=document.createElement('div');banner.id='mgPlanBanner';banner.className='mg-plan-banner';banner.setAttribute('role','status');const main=document.querySelector('main');(main||document.body).prepend(banner);}
 const s=mgPlanState,core=MGPlansCore,plan=core.plans[s?.plan];
 const writable=core.writable(s,mgPlanNow());
 banner.replaceChildren();
 const message=document.createElement('span');
 message.textContent=s?`${plan?.name||'Plano'} · ${core.label(s,mgPlanNow())}${s.expires_at?' · Até '+new Date(s.expires_at).toLocaleDateString('pt-BR'):''}${s.plan==='essential'?' · Até 150 animais ativos':''}${!writable?' · Cadastros indisponíveis; dados preservados.':''}`:'Não foi possível validar seu plano. Conecte-se e tente novamente.';
 const retry=document.createElement('button');retry.className='btn secondary';retry.textContent='Atualizar acesso';retry.onclick=async()=>{retry.disabled=true;try{await mgRefreshPlan(mgFarm,true);}catch(e){mgPlanExplain(e.message);}finally{retry.disabled=false;}};
 const manage=document.createElement('button');manage.className='btn secondary';manage.textContent='Meu plano';manage.onclick=()=>window.mgOpenBilling?.();banner.append(message,manage,retry);banner.classList.toggle('mg-plan-warning',!writable);
 document.documentElement.dataset.mgPlan=s?.plan||'unknown';
 for(const nav of document.querySelectorAll('[data-v],[data-mobile-v]')){
  const feature=core.views[nav.dataset.v||nav.dataset.mobileV];if(!feature)continue;
  const locked=!mgHasPlanFeature(feature);nav.classList.toggle('mg-plan-locked',locked);
  nav.title=locked?'Disponível no plano Completo':'';
  let badge=nav.querySelector('.mg-plan-tag');
  if(locked&&!badge){badge=document.createElement('small');badge.className='mg-plan-tag';badge.textContent='Completo';nav.append(badge);}
  if(!locked&&badge)badge.remove();
 }
 document.getElementById('feedLotRows')?.closest('.card')?.classList.toggle('mg-plan-hidden',!mgHasPlanFeature('expenses'));
 // Never display missing financial data as a true zero on the Essential plan.
 for(const id of ['dashExpensesMetric','dashFinanceSummary','mgNutritionCosts']){const el=document.getElementById(id);if(el)el.classList.toggle('mg-plan-hidden',!mgHasPlanFeature('expenses'));}
 document.querySelectorAll('#nutricao th:nth-child(5),#nutricao th:nth-child(6),#nutritionRows td:nth-child(5),#nutritionRows td:nth-child(6)').forEach(el=>el.classList.toggle('mg-plan-hidden',!mgHasPlanFeature('expenses')));
 for(const id of ['dMonth2','dExpenses','costHead'])document.getElementById(id)?.closest('.summary-line')?.classList.toggle('mg-plan-hidden',!mgHasPlanFeature('expenses'));
 for(const id of ['feedCostMonth','feedCostKg'])document.getElementById(id)?.closest('.dairy-kpi')?.classList.toggle('mg-plan-hidden',!mgHasPlanFeature('expenses'));
 const cost=document.getElementById('nutCost');if(cost){cost.closest('label')?.classList.toggle('mg-plan-hidden',!mgHasPlanFeature('expenses'));if(!mgHasPlanFeature('expenses'))cost.value='';}
 const current=document.querySelector('.view.active');
 if(current&&core.views[current.id]&&!mgHasPlanFeature(core.views[current.id]))show('inicio');
}
// Checks do not remove queued field entries. The server revalidates each replay.
window.addEventListener('online',()=>{if(mgFarm)mgRefreshPlan(mgFarm,true).catch(()=>{});});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&mgFarm&&navigator.onLine)mgRefreshPlan(mgFarm,true).catch(()=>{});});
