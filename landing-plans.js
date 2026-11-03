/* A request opens WhatsApp; no payment or automatic activation happens here. */
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
   const message=`Olá! Quero contratar o plano ${plan.name} do Meu Gado, na opção ${annual?'anual':'mensal'}, por ${currency(amount)} por ${annual?'ano':'mês'}, para uma fazenda. Como posso finalizar a contratação?`;
   const link=card.querySelector('[data-plan-contact]');link.href=`https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
   link.setAttribute('aria-label',`Solicitar contratação do plano ${plan.name} ${annual?'anual':'mensal'} por ${currency(amount)} pelo WhatsApp (abre em outra aba)`);
  }
  document.getElementById('pricingAnnouncement').textContent=`Valores ${period==='annual'?'anuais':'mensais'} por fazenda. Contratação pelo WhatsApp.`;
 }
 section.querySelectorAll('[data-pricing-period]').forEach(button=>button.addEventListener('click',()=>selectPeriod(button.dataset.pricingPeriod)));
 selectPeriod('monthly');
})();
