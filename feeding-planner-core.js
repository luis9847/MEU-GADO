/* Calculations for producer-entered plans. No automatic ration prescription. */
(function(root){
 'use strict';
 const finite=(v)=>v!==null&&v!==''&&v!==undefined&&Number.isFinite(Number(v));
 function calculate(items,heads,meals,days=30){
  if(!Number.isInteger(heads)||heads<0||!Number.isInteger(meals)||meals<1||!Number.isInteger(days)||days<1)throw new Error('Parâmetros do plano inválidos.');
  const lines=items.map(item=>{
   const kg=Number(item.kg_head_day);
   if(!Number.isFinite(kg)||kg<=0||kg>1000)throw new Error('Quantidade por animal inválida.');
   const price=finite(item.price_kg)?Number(item.price_kg):null;
   const dm=finite(item.dry_matter_pct)?Number(item.dry_matter_pct):null;
   return {...item,kg_head_day:kg,kg_day:kg*heads,kg_meal:kg*heads/meals,kg_period:kg*heads*days,cost_head:price===null?null:kg*price,cost_day:price===null?null:kg*heads*price,dm_head:dm===null?null:kg*dm/100};
  });
  const completePrice=lines.every(i=>i.cost_day!==null), completeDm=lines.every(i=>i.dm_head!==null);
  const cost=completePrice?lines.reduce((s,i)=>s+i.cost_day,0):null;
  return {lines,heads,meals,days,kg_day:lines.reduce((s,i)=>s+i.kg_day,0),cost_day:cost,cost_head:completePrice?lines.reduce((s,i)=>s+i.cost_head,0):null,cost_period:cost===null?null:cost*days,dm_head:completeDm?lines.reduce((s,i)=>s+i.dm_head,0):null};
 }
 function lotSummary(animals,lotName){
  const members=animals.filter(a=>a.status==='active'&&a.lot===lotName&&!a.deleted_at);
  const weighed=members.filter(a=>finite(a.current_weight??a.entry_weight)&&Number(a.current_weight??a.entry_weight)>0);
  return {heads:members.length,weighed:weighed.length,avg_weight:weighed.length?weighed.reduce((s,a)=>s+Number(a.current_weight??a.entry_weight),0)/weighed.length:null,oldest_date:weighed.map(a=>a.last_weighing_date||a.entry_date).filter(Boolean).sort()[0]||null};
 }
 function stockDays(stock,daily){return finite(stock)&&daily>0?Number(stock)/daily:null;}
 function activeOn(plan,date){return !plan.archived&&plan.start_date<=date&&(!plan.end_date||plan.end_date>=date);}
 const api={calculate,lotSummary,stockDays,activeOn};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.MGFeedingCore=api;
})(typeof window==='undefined'?globalThis:window);
