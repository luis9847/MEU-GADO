/* Plan choice is carried into the authenticated owner billing portal. */
(function(){
 'use strict';
 const section=document.getElementById('planos');if(!section)return;
 const currency=n=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
 const phone=section.dataset.contact;
 function selectPeriod(period){
  if(!['monthly','annual'].includes(period))return;
  section.dataset.period=period;
  for(const button of section.querySelectorAll('[data-pricing-period]'))button.setAttribute('aria-pressed',String(button.dataset.pricingPeriod===period));
  for(const card of section.querySelectorAll('[data-pricing-plan]')){
   const key=card.dataset.pricingPlan,plan=window.MGPlansCore.plans[key],annual=period==='annual',amount=annual?plan.annual:plan.monthly;
   card.querySelector('[data-plan-price]').textContent=currency(amount);
   card.querySelector('[data-plan-period]').textContent=annual?'/ano':'/mês';
   card.querySelector('[data-plan-alternative]').textContent=annual?`Equivale a ${currency(plan.annual/12)}/mês. Valor total anual: ${currency(plan.annual)}.`:`Ou ${currency(plan.annual)}/ano, equivalente a ${currency(plan.annual/12)}/mês.`;
   const link=card.querySelector('[data-plan-contact]');link.href=`/app?billing_plan=${key}&billing_period=${period}`;
   link.removeAttribute('target');link.removeAttribute('rel');link.textContent='Escolher '+plan.name+' →';
   link.setAttribute('aria-label',`Escolher plano ${plan.name} ${annual?'anual':'mensal'} por ${currency(amount)}`);
   link.onclick=()=>{try{sessionStorage.setItem('mg-billing-choice',JSON.stringify({plan:key,period}));}catch{}};
  }
  document.getElementById('pricingAnnouncement').textContent=`Valores ${period==='annual'?'anuais':'mensais'} por fazenda. Selecione o plano e entre em sua conta para contratar.`;
 }
 section.querySelectorAll('[data-pricing-period]').forEach(button=>button.addEventListener('click',()=>selectPeriod(button.dataset.pricingPeriod)));
 selectPeriod('monthly');
})();

fetch(window.MG_SB_URL+'/functions/v1/billing/availability',{cache:'no-store'}).then(r=>r.json()).then(c=>{const note=document.querySelector('.pricing-contact-note');if(note)note.textContent=c.enabled?'Escolha seu plano, entre ou crie sua conta e finalize no Mercado Pago. A assinatura tem renovação automática; você pode cancelar a renovação na sua conta.':'Escolha seu plano e acesse sua conta. A contratação automática está em preparação; o pagamento online será disponibilizado após sua ativação.';}).catch(()=>{});
