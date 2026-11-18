/* Public plan cards show prices; signup precedes farm and plan selection. */
(function(){
 'use strict';
 const section=document.getElementById('planos');if(!section)return;
 const currency=n=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
 function selectPeriod(period){
  if(!['monthly','annual'].includes(period))return;
  section.dataset.period=period;
  for(const button of section.querySelectorAll('[data-pricing-period]'))button.setAttribute('aria-pressed',String(button.dataset.pricingPeriod===period));
  for(const card of section.querySelectorAll('[data-pricing-plan]')){
   const key=card.dataset.pricingPlan,plan=window.MGPlansCore.plans[key],annual=period==='annual',amount=annual?plan.annual:plan.monthly;
   card.querySelector('[data-plan-price]').textContent=currency(amount);
   card.querySelector('[data-plan-period]').textContent=annual?'/ano':'/mês';
   const annualValue=currency(plan.annual),monthlyEquivalent=currency(plan.annual/12),savings=currency(12*plan.monthly-plan.annual);
   card.querySelector('[data-plan-alternative]').textContent=(annual?`Total anual: ${annualValue} (equivale a ${monthlyEquivalent}/mês).`:`Ou ${annualValue}/ano (equivale a ${monthlyEquivalent}/mês).`)+` Economia de ${savings} em relação a 12 mensalidades.`;
   const button=card.querySelector('[data-plan-contact]');button.textContent='Cadastre-se';
   button.setAttribute('aria-label',`Cadastre-se no Meu Gado — conheça o plano ${plan.name}`);
   button.onclick=()=>window.openAuth('register');
  }
  document.getElementById('pricingAnnouncement').textContent=`Valores ${period==='annual'?'anuais':'mensais'} por fazenda. Cadastre-se e informe sua fazenda para escolher o plano.`;
 }
 section.querySelectorAll('[data-pricing-period]').forEach(button=>button.addEventListener('click',()=>selectPeriod(button.dataset.pricingPeriod)));
 selectPeriod('monthly');
})();

fetch(window.MG_SB_URL+'/functions/v1/billing/availability',{cache:'no-store'}).then(r=>r.json()).then(c=>{const note=document.querySelector('.pricing-contact-note');if(note)note.textContent=c.enabled?'Crie sua conta e cadastre sua fazenda. Depois, escolha o plano e finalize no Mercado Pago. Pague com Pix, sem renovação automática, ou cartão de crédito, com renovação automática que pode ser cancelada na sua conta.':'Crie sua conta e cadastre sua fazenda. A contratação automática está em preparação; o pagamento online será disponibilizado após sua ativação.';}).catch(()=>{});
