/* Platform admin only. Access mutations go through an audited, MFA-aware RPC. */
let farmSubscriptions=[],subscriptionAudit=[];
function adminSubscription(id){return farmSubscriptions.find(s=>Number(s.farm_id)===Number(id));}
function subscriptionDescription(s){return MGPlansCore.label(s);}
function renderPlanManagement(){
 const root=document.getElementById('planList');if(!root)return;
 const q=document.getElementById('planSearch').value.trim().toLowerCase(),filter=document.getElementById('planStatusFilter').value;
 const matches=farms.filter(f=>[f.name,f.email].join(' ').toLowerCase().includes(q)).filter(f=>{
  const s=adminSubscription(f.id);if(filter==='all')return true;
  if(filter==='expired')return s?.expires_at&&Date.parse(s.expires_at)<=Date.now();
  return s?.status===filter;
 });
 root.innerHTML=matches.map(f=>{
  const s=adminSubscription(f.id),p=MGPlansCore.plans[s?.plan],free=s?.status==='trial',heads=statsFor(f.id).active;
  return `<tr><td><b>${esc(f.name||'Sem nome')}</b><small>${esc(f.email||'E-mail não informado')}</small></td><td>${esc(p?.name||'Não configurado')}<small>${heads} animais ativos</small></td><td>${esc(subscriptionDescription(s))}</td><td>${s?.expires_at?esc(new Date(s.expires_at).toLocaleDateString('pt-BR')):'Sem data final'}</td><td>${free?'R$ 0,00':s?.status==='active'?brl(s.billing_period==='annual'?p?.annual:p?.monthly)+(s.billing_period==='annual'?' / ano':' / mês'):'—'}</td><td><button class="btn secondary" data-manage-plan="${Number(f.id)}">Gerenciar acesso</button></td></tr>`;
 }).join('');
 document.getElementById('planEmpty').hidden=matches.length>0;
 const log=document.getElementById('subscriptionAuditList');
 log.innerHTML=[...subscriptionAudit].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,10).map(a=>{
  const f=farms.find(f=>Number(f.id)===Number(a.farm_id));const after=a.after_value;
  return `<div class="attention"><div><b>${esc(f?.name||'Fazenda')} · ${esc(MGPlansCore.plans[after?.plan]?.name||'Plano')}</b><small>${esc(subscriptionDescription(after))} · ${esc(new Date(a.created_at).toLocaleString('pt-BR'))}</small></div></div>`;
 }).join('')||'<p class="subscription-note">Nenhuma alteração de plano registrada.</p>';
}
function renderSubscriptionEditor(id){
 const f=farms.find(f=>Number(f.id)===Number(id)),s=adminSubscription(id);if(!f||!s)return;
 let box=document.getElementById('subscriptionEditor');
 if(!box){box=document.createElement('section');box.id='subscriptionEditor';box.className='subscription-editor';document.getElementById('detailStats').before(box);}
 const expiry=s.expires_at?new Date(s.expires_at):null;
 const localDate=expiry?`${expiry.getFullYear()}-${String(expiry.getMonth()+1).padStart(2,'0')}-${String(expiry.getDate()).padStart(2,'0')}`:'';
 const statusLabels={pending:'Aguardando liberação',active:'Assinatura liberada manualmente',trial:'Teste gratuito',suspended:'Suspenso'};
 box.innerHTML=`<h3>Plano e teste gratuito</h3><p class="subscription-note">${esc(subscriptionDescription(s))}. ${s.expires_at?'Validade: '+esc(new Date(s.expires_at).toLocaleString('pt-BR')):'Sem data final.'}</p>
 <form id="subscriptionForm"><div class="subscription-fields">
 <div class="field"><label for="subPlan">Plano</label><select id="subPlan"><option value="essential">Essencial — até 150 animais ativos</option><option value="complete">Completo — todos os recursos</option></select></div>
 <div class="field"><label for="subStatus">Tipo de acesso</label><select id="subStatus" required>${s.status==='legacy'?'<option value="" selected disabled>Escolha como liberar este cliente</option>':''}${Object.entries(statusLabels).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
 <div class="field"><label for="subPeriod">Periodicidade da assinatura</label><select id="subPeriod"><option value="monthly">Mensal</option><option value="annual">Anual</option></select></div>
 <div class="field"><label for="subUntil">Último dia de acesso (opcional)</label><input id="subUntil" type="date"><small class="subscription-note">Válido até o fim do dia no seu fuso horário. Vazio: até você encerrar.</small></div></div>
 <p id="subscriptionPrice" class="subscription-note"></p><p class="subscription-note">Teste gratuito não gera cobrança nem muda automaticamente para uma assinatura. Ao vencer, bloqueia novos lançamentos e preserva os dados. Bloqueio e arquivamento da fazenda continuam prevalecendo.</p>
 <button type="button" id="subGrantFree" class="btn secondary">Selecionar teste gratuito Completo</button>
 <button type="submit" id="subSave" class="btn primary">Salvar acesso</button><p id="subMessage" class="msg" role="status"></p></form>`;
 const plan=box.querySelector('#subPlan'),status=box.querySelector('#subStatus'),period=box.querySelector('#subPeriod'),until=box.querySelector('#subUntil');
 plan.value=s.plan;status.value=s.status==='legacy'?'':s.status;period.value=s.billing_period;until.value=localDate;
 const price=()=>{
  const p=MGPlansCore.plans[plan.value];period.disabled=status.value==='trial';
  box.querySelector('#subscriptionPrice').textContent=status.value==='trial'?'Teste gratuito: R$ 0,00.':`Valor de referência: ${brl(period.value==='annual'?p.annual:p.monthly)} por ${period.value==='annual'?'ano':'mês'}. Pagamento e renovação são controlados manualmente; salvar não cobra o cliente.`;
 };
 plan.onchange=status.onchange=period.onchange=price;
 box.querySelector('#subGrantFree').onclick=()=>{plan.value='complete';status.value='trial';price();until.focus();};
 box.querySelector('#subscriptionForm').onsubmit=async event=>{
  event.preventDefault();const msg=box.querySelector('#subMessage'),save=box.querySelector('#subSave');msg.textContent='';msg.className='msg';
  if(!status.value){msg.textContent='Escolha o tipo de acesso.';return;}
  if(plan.value==='essential'&&statsFor(id).active>150){msg.textContent='Esta fazenda tem mais de 150 animais ativos. Use o Completo.';return;}
  let expires;try{expires=MGPlansCore.localEndOfDay(until.value);}catch(e){msg.textContent=e.message;return;}
  if(['trial','active'].includes(status.value)&&expires&&Date.parse(expires)<=Date.now()){msg.textContent='Escolha uma validade futura.';return;}
  const summary=`${f.name}: ${MGPlansCore.plans[plan.value].name}, ${statusLabels[status.value]}${until.value?' até '+until.value:' sem data final'}.`;
  if(!confirm('Confirmar a alteração?\n\n'+summary+'\n\nNenhuma cobrança será feita ao salvar.'))return;
  save.disabled=true;
  try{
   const result=await sb.rpc('admin_set_farm_plan',{p_farm_id:Number(id),p_plan:plan.value,p_status:status.value,p_billing_period:period.value,p_expires_at:expires,p_expected_revision:s.revision});
   if(result.error)throw result.error;
   await loadData();toast('Acesso salvo. O cliente recebe a atualização ao conectar.');
  }catch(e){msg.textContent=e.message||'Não foi possível salvar o acesso. Atualize e tente novamente.';}
  finally{save.disabled=false;}
 };
 for(const button of box.querySelectorAll('button,input,select'))button.disabled=!!f.archived_at;
 price();
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-manage-plan]');if(button)showDetail(Number(button.dataset.managePlan));});
document.getElementById('planSearch').addEventListener('input',renderPlanManagement);
document.getElementById('planStatusFilter').addEventListener('change',renderPlanManagement);
