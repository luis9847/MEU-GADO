/* Owner billing portal: authenticated API, explicit recurring consent, no card data. */
(function(){
 'use strict';
 const apiBase=window.MG_SB_URL+'/functions/v1/billing/';let dialog,busy=false,context=null,requestId=null,choiceKey=null;
 const money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),date=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
 const states={creating:'Criando contratação',creation_unknown:'Contratação em conferência',pending:'Aguardando pagamento',authorized:'Renovação automática ativa',paused:'Renovação pausada',cancelled:'Renovação cancelada'};
 const $=id=>document.getElementById(id);
 async function api(action,body={}){
  if(!navigator.onLine)throw new Error('Conecte-se à internet para consultar ou contratar seu plano.');
  const {data:{session}}=await mgSb.auth.getSession();if(!session)throw new Error('Entre em sua conta para continuar.');
  let response;try{response=await fetch(apiBase+action,{method:'POST',headers:{apikey:window.MG_SB_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});}catch{throw new Error('Não foi possível conectar. Verifique sua internet e tente novamente.');}
  let data;try{data=await response.json();}catch{throw new Error('Resposta indisponível. Tente novamente.');}if(!response.ok)throw new Error(data.error||'Não foi possível concluir a operação.');return data;
 }
 function ensure(){if(dialog)return;
  dialog=document.createElement('dialog');dialog.className='mg-billing-dialog';dialog.id='mgBillingDialog';dialog.innerHTML=`<div class="mg-billing-head"><h2 id="mgBillingTitle">Meu plano</h2><button type="button" id="mgBillingClose" class="btn secondary">Fechar</button></div><p id="mgBillingIntro"></p><p id="mgBillingFarm"></p><div id="mgBillingCurrent"></div><p id="mgBillingAvailability" role="status"></p><div id="mgBillingContracts"></div>
  <form id="mgBillingForm"><h3>Contratar um plano</h3><div class="mg-billing-grid"><label for="mgBillingPlan">Plano<select id="mgBillingPlan"><option value="essential">Essencial · até 150 animais ativos</option><option value="complete">Completo · todos os recursos</option></select></label><label for="mgBillingPeriod">Período<select id="mgBillingPeriod"><option value="monthly">Mensal</option><option value="annual">Anual · pagamento único a cada 12 meses</option></select></label></div><p id="mgBillingFeatures"></p><details class="mg-billing-comparison"><summary>Compare o que cada plano oferece</summary><div class="mg-billing-table-wrap" role="region" aria-label="Comparação dos recursos dos planos Essencial e Completo" tabindex="0"><table class="mg-billing-table"><thead><tr><th scope="col">Recursos por fazenda</th><th scope="col">Essencial</th><th scope="col">Completo</th></tr></thead><tbody><tr><th scope="row">Cadastro e ficha dos animais</th><td>Incluído</td><td>Incluído</td></tr>
<tr><th scope="row">Lotes, pesagens e evolução do peso</th><td>Incluído</td><td>Incluído</td></tr>
<tr><th scope="row">Saúde e reprodução</th><td>Incluído</td><td>Incluído</td></tr>
<tr><th scope="row">Registro de alimentação</th><td>Incluído</td><td>Incluído</td></tr>
<tr><th scope="row">Modo Campo nos registros compatíveis</th><td>Incluído</td><td>Incluído</td></tr>
<tr><th scope="row">Suporte para dúvidas de uso</th><td>Incluído</td><td>Incluído</td></tr>
<tr><th scope="row">Controle de gastos</th><td><span class="unavailable">Não incluído</span></td><td>Incluído</td></tr>
<tr><th scope="row">Planejamento alimentar e custos</th><td><span class="unavailable">Não incluído</span></td><td>Incluído</td></tr>
<tr><th scope="row">Painel de desempenho</th><td><span class="unavailable">Não incluído</span></td><td>Incluído</td></tr>
<tr><th scope="row">Relatórios e exportações disponíveis</th><td><span class="unavailable">Não incluído</span></td><td>Incluído</td></tr></tbody></table></div></details><p id="mgBillingPrice" class="mg-billing-price"></p><label for="mgBillingEmail">E-mail para o pagamento<input id="mgBillingEmail" type="email" required autocomplete="email"></label>
  <label class="mg-billing-consent"><input id="mgBillingConsent" type="checkbox" required><span id="mgBillingConsentText"></span></label><p>Você será direcionado ao Mercado Pago para escolher a forma de pagamento. O acesso será liberado após a confirmação no servidor, que pode levar alguns minutos.</p><p><a href="/?legal=terms" target="_blank" rel="noopener noreferrer">Termos de Uso</a> · <a href="/?legal=privacy" target="_blank" rel="noopener noreferrer">Política de Privacidade</a></p><p>Você pode cancelar a renovação nesta tela e manter o acesso pelo período já pago. Para trocar o plano ou a periodicidade, cancele a renovação e aguarde o fim do período atual.</p><button id="mgBillingBuy" class="btn primary" type="submit">Continuar para pagamento</button></form><p id="mgBillingMessage" role="status" aria-live="polite"></p>`;
  document.body.append(dialog);$('mgBillingClose').onclick=()=>dialog.close();$('mgBillingPlan').onchange=$('mgBillingPeriod').onchange=()=>{price();$('mgBillingConsent').checked=false;};
  $('mgBillingForm').onsubmit=e=>{e.preventDefault();run(async()=>{
   if(!$('mgBillingConsent').checked)throw new Error('Confirme o valor e a renovação automática.');
   const plan=$('mgBillingPlan').value,period=$('mgBillingPeriod').value,key=[context.farm.farm_id,plan,period].join(':');if(choiceKey!==key||!requestId){requestId=crypto.randomUUID();choiceKey=key;}
   const data=await api('create',{request_id:requestId,plan,billing_period:period,farm_id:context.farm.farm_id,payer_email:$('mgBillingEmail').value.trim(),accepted_terms:true});
   await refresh();$('mgBillingMessage').textContent='Contratação criada. Use o botão Abrir pagamento para continuar no Mercado Pago.';
   const link=$('mgBillingContracts').querySelector('a');link?.focus();
  });};
 }
 function price(){const p=MGPlansCore.plans[$('mgBillingPlan').value],annual=$('mgBillingPeriod').value==='annual',amount=annual?p.annual:p.monthly;
  $('mgBillingPrice').textContent=money(amount)+' por '+(annual?'ano':'mês');
  $('mgBillingFeatures').textContent=$('mgBillingPlan').value==='essential'?'Animais, lotes, pesagens, saúde, reprodução, registro de alimentação, Modo Campo compatível e suporte de uso.':'Todos os recursos do Essencial, mais gastos, planejamento alimentar e custos, desempenho, relatórios e exportações disponíveis.';
  $('mgBillingConsentText').textContent=`Concordo com a assinatura de ${money(amount)} e a renovação automática ${annual?'a cada 12 meses':'mensal'}. Li os Termos de Uso e a Política de Privacidade disponíveis no site.`;
 }
 function action(text,fn){const b=document.createElement('button');b.type='button';b.className='btn secondary';b.textContent=text;b.onclick=()=>run(fn);return b;}
 function render(){const f=context.farm;
  $('mgBillingTitle').textContent=f.status==='pending'?'Escolha seu plano':'Meu plano';
  $('mgBillingIntro').textContent=f.status==='pending'?'Sua fazenda já está cadastrada. Escolha o plano e o período para continuar. O acesso aos recursos será liberado após a confirmação do pagamento.':'';
  $('mgBillingClose').textContent=MGPlansCore.writable(f)?'Acessar sistema':'Fechar';$('mgBillingFarm').textContent=f.farm_name+' · '+f.active_heads+' animais ativos';
  $('mgBillingCurrent').textContent=`Plano atual: ${MGPlansCore.plans[f.plan]?.name||'A configurar'} · ${MGPlansCore.label(f)}${f.expires_at?' · Validade: '+date(f.expires_at):''}`;
  $('mgBillingAvailability').textContent=context.enabled?'Contratação online disponível.':'A contratação automática está em preparação. Você pode consultar e cancelar uma assinatura existente. Testes gratuitos continuam disponíveis quando liberados pelo administrador.';
  const area=$('mgBillingContracts');area.replaceChildren();
  for(const c of context.contracts){const box=document.createElement('article');box.className='mg-billing-contract';const title=document.createElement('h3');title.textContent=`${MGPlansCore.plans[c.plan].name} ${c.billing_period==='annual'?'anual':'mensal'} · ${money(c.amount)}`;const state=document.createElement('p');state.textContent=states[c.status]||'Situação em consulta';box.append(title,state);
   const expiry=document.createElement('p');expiry.textContent=c.activated&&c.paid_until?'Período pago até '+date(c.paid_until):'A liberação depende da confirmação do pagamento.';box.append(expiry);
   if(c.needs_review){const p=document.createElement('p');p.textContent='Este pagamento precisa de conferência pela equipe. Seus dados e o acesso liberado anteriormente foram preservados. Entre em contato com o suporte.';box.append(p);}
   const actions=document.createElement('div');actions.className='mg-billing-actions';
   if(c.checkout_url&&c.status==='pending'){try{const u=new URL(c.checkout_url);if(u.protocol==='https:'&&u.hostname==='www.mercadopago.com.br'&&u.pathname==='/subscriptions/checkout'){const a=document.createElement('a');a.className='btn primary';a.textContent='Abrir pagamento';a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';actions.append(a);}}catch{}}
   actions.append(action('Consultar pagamento',async()=>{await api('refresh',{id:c.id,farm_id:f.farm_id});await refresh();if(typeof mgRefreshPlan==='function'&&typeof mgFarm!=='undefined'&&mgFarm)await mgRefreshPlan(mgFarm,true);$('mgBillingMessage').textContent='Pagamento e acesso atualizados.';}));
   if(c.status!=='cancelled')actions.append(action('Cancelar renovação',async()=>{if(!confirm('Cancelar a renovação automática? O acesso continuará pelo período já pago.'))return;await api('cancel',{id:c.id,farm_id:f.farm_id});requestId=null;choiceKey=null;await refresh();$('mgBillingMessage').textContent='Renovação cancelada. Confira a validade do seu acesso acima.';}));
   box.append(actions);area.append(box);
  }
  const open=context.contracts.some(c=>c.status!=='cancelled'||c.needs_review),active=f.status==='active'&&(!f.expires_at||Date.parse(f.expires_at)>Date.now());
  $('mgBillingBuy').disabled=!context.enabled||open||active||f.blocked||f.archived;
  $('mgBillingBuy').dataset.locked=String($('mgBillingBuy').disabled);
  if(open||active){const note=document.createElement('p');note.textContent=open?'Consulte a contratação existente antes de iniciar outra.':'Você já tem acesso ativo. A troca poderá ser contratada ao final do período atual.';area.append(note);}
 }
 async function refresh(){context=await api('context');render();}
 async function run(fn){if(busy)return;busy=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);$('mgBillingMessage').textContent='Consultando…';try{await fn();}catch(e){$('mgBillingMessage').textContent=e.message;}finally{busy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);if(context)render();}}
 window.mgOpenBilling=async()=>{
  ensure();if(!dialog.open)dialog.showModal();await run(async()=>{
   await refresh();const q=new URLSearchParams(location.search);let intent;try{intent=JSON.parse(sessionStorage.getItem('mg-billing-choice')||'null');}catch{}
   const plan=q.get('billing_plan')||intent?.plan,period=q.get('billing_period')||intent?.period;
   if(['essential','complete'].includes(plan))$('mgBillingPlan').value=plan;else $('mgBillingPlan').value=context.farm.plan;
   if(['monthly','annual'].includes(period))$('mgBillingPeriod').value=period;
   const {data:{session}}=await mgSb.auth.getSession();$('mgBillingEmail').value=session?.user?.email||'';price();$('mgBillingMessage').textContent='';
   sessionStorage.removeItem('mg-billing-choice');
  });
 };
 const q=new URLSearchParams(location.search);if(q.has('billing_plan'))try{sessionStorage.setItem('mg-billing-choice',JSON.stringify({plan:q.get('billing_plan'),period:q.get('billing_period')}));}catch{}
 let intent=false;try{intent=!!sessionStorage.getItem('mg-billing-choice');}catch{}
 // React to the validated farm snapshot, including a registration completed much later.
 // This is navigation only: access and payment confirmation remain server controlled.
 const handled=new Set();
 async function enterBilling(){
  if(!navigator.onLine||typeof mgUser==='undefined'||!mgUser||typeof mgFarm==='undefined'||!mgFarm||typeof mgPlanState==='undefined'||mgPlanState?.farm_id!==mgFarm.id)return;
  if(mgFarm.owner_id!==mgUser.id)return;
  const key=mgUser.id+':'+mgFarm.id;if(handled.has(key))return;
  const returning=q.has('billing_return'),trial=mgPlanState.status==='trial'&&MGPlansCore.writable(mgPlanState,mgPlanNow());
  if(trial&&!returning){handled.add(key);try{sessionStorage.removeItem('mg-billing-choice');}catch{}return;}
  if(!returning&&!intent&&mgPlanState.status!=='pending')return;
  handled.add(key);
  await window.mgOpenBilling();
  if(returning&&context?.contracts.some(c=>c.id===q.get('billing_return')))await run(async()=>{
   await api('refresh',{id:q.get('billing_return'),farm_id:context.farm.farm_id});await refresh();
   if(typeof mgRefreshPlan==='function')await mgRefreshPlan(mgFarm,true);
   $('mgBillingMessage').textContent='Resultado consultado no servidor. Confira o acesso e a validade acima.';
  });
 }
 const scheduleEntry=()=>setTimeout(()=>enterBilling().catch(()=>{}),0);
 window.addEventListener('mg:plan-ready',scheduleEntry);
 scheduleEntry();
})();
