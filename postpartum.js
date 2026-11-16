(function(){
'use strict';

const mother={vaca:'Condição geral da matriz observada',placenta:'Eliminação da placenta verificada'};
const calf={colostro:'Mamada do colostro confirmada',umbigo:'Cuidados com o umbigo registrados',brinco:'Brinco ou identificação registrados',peso:'Peso ao nascimento registrado'};
function progress(value){
 const keys=[...Object.keys(mother),...(value?.sem_cria_viva===true?[]:Object.keys(calf))];
 return {done:keys.filter(k=>value?.[k]===true).length,total:keys.length};
}
function birthAlerts(events,animals,today){
 const active=new Map(animals.map(a=>[String(a.id),a]));
 const now=Date.parse(today+'T00:00:00Z');
 return events.flatMap(e=>{
  if(e.event_type!=='Parto'||e.deleted_at||!active.has(String(e.animal_id)))return [];
  const days=(now-Date.parse(e.event_date+'T00:00:00Z'))/86400000;
  if(!Number.isFinite(days)||days<0||days>7)return [];
  const {done,total}=progress(e.postpartum_checklist);
  if(done===total)return [];
  return [{id:'postpartum-'+e.id,type:'repro',level:'warning',title:'Checklist pós-parto pendente',detail:'Matriz #'+active.get(String(e.animal_id)).number+' · '+done+' de '+total+' cuidados conferidos.',date:e.event_date,animal_id:e.animal_id,repro_event_id:e.id}];
 });
}
if(typeof module==='object'&&module.exports){module.exports={progress,birthAlerts};return;}
window.MGPostpartum={progress,birthAlerts};

const byId=id=>document.getElementById(id);
const dialog=document.createElement('dialog');
dialog.id='mgPostpartumDialog';
dialog.className='mg-ops mg-ops-dialog mg-postpartum-dialog';
dialog.setAttribute('aria-labelledby','mgPostpartumTitle');
const items=group=>Object.entries(group).map(([key,desc])=>'<label><input type="checkbox" name="'+key+'"><span>'+desc+'</span></label>').join('');
dialog.innerHTML='<form id="mgPostpartumForm"><h2 id="mgPostpartumTitle">Checklist pós-parto</h2>'
 +'<p id="mgPostpartumContext"></p><p id="mgPostpartumProgress" role="status"></p>'
 +'<fieldset><legend>Matriz</legend>'+items(mother)+'</fieldset>'
 +'<fieldset><legend>Cria</legend><p>Se houver mais de uma cria, marque o item após conferir todas.</p>'
 +'<label><input type="checkbox" name="sem_cria_viva"><span>Sem cria viva neste parto</span></label>'
 +'<div id="mgPostpartumCalfItems">'+items(calf)+'</div></fieldset>'
 +'<p class="mg-ops-hint">Marque apenas o que foi conferido. Para medicamentos, vacinas e vermífugos, siga o protocolo do veterinário e agende as aplicações em Saúde.</p>'
 +'<p id="mgPostpartumError" role="alert"></p><div class="mg-ops-actions"><button class="btn secondary" type="button" id="mgPostpartumClose">Fechar</button>'
 +'<button type="submit" class="btn primary" id="mgPostpartumSave">Salvar checklist</button></div></form>';
document.body.append(dialog);
const form=dialog.querySelector('form');
const box=key=>form.elements.namedItem(key);
const fields=[...Object.keys(mother),...Object.keys(calf),'sem_cria_viva'];
const value=()=>Object.fromEntries(fields.filter(k=>box(k).checked&&!box(k).disabled).map(k=>[k,true]));
let current=null,inFlight=false,request=0;
function sync(){
 const absent=box('sem_cria_viva').checked;
 if(absent)Object.keys(calf).forEach(k=>{box(k).checked=false;});
 Object.keys(calf).forEach(k=>{box(k).disabled=absent;});
 byId('mgPostpartumCalfItems').hidden=absent;
 const {done,total}=progress(value());
 byId('mgPostpartumProgress').textContent=done===total?'Checklist concluído':done+' de '+total+' itens conferidos';
 byId('mgPostpartumSave').disabled=inFlight||!navigator.onLine||!MGPlansCore.writable(mgPlanState,mgPlanNow());
}
async function open(id){
 if(!Number.isSafeInteger(id)||id<=0)return;
 const run=++request;
 if(!byId('repro').classList.contains('active'))show('repro');
 closeModal('notificationsModal');
 try{
  const f=await mgGetFarm();
  const rows=await api('/api/reproduction');
  if(run!==request)return;
  const e=rows.find(row=>Number(row.id)===id&&row.event_type==='Parto'&&!row.deleted_at);
  if(!e)throw Error('Parto não encontrado. Se foi salvo offline, aguarde a sincronização.');
  current={event:e,farmId:f.id};
  fields.forEach(k=>{box(k).checked=e.postpartum_checklist?.[k]===true;});
  byId('mgPostpartumContext').textContent='Matriz #'+(e.animal_number||e.animal_id)+' · '+reproDateBr(e.event_date);
  byId('mgPostpartumError').textContent=navigator.onLine?'':'Conecte-se para salvar o checklist.';
  sync();if(!dialog.open)dialog.showModal();
 }catch(error){if(run===request)alert(error.message||String(error));}
}
window.mgOpenPostpartum=open;
form.addEventListener('change',sync);
window.addEventListener('offline',()=>{if(dialog.open){sync();byId('mgPostpartumError').textContent='Conecte-se para salvar o checklist.';}});
window.addEventListener('online',()=>{if(dialog.open){sync();byId('mgPostpartumError').textContent='';}});
byId('mgPostpartumClose').onclick=()=>{if(!inFlight)dialog.close();};
dialog.addEventListener('cancel',e=>{if(inFlight)e.preventDefault();});
form.onsubmit=async e=>{
 e.preventDefault();if(!current||inFlight||!navigator.onLine)return;
 const item=current,next=value(),original=item.event.postpartum_checklist;
 inFlight=true;sync();byId('mgPostpartumError').textContent='';
 try{
  const f=await mgGetFarm();await mgRefreshPlan(f);
  if(f.id!==item.farmId||!MGPlansCore.writable(mgPlanState,mgPlanNow()))throw Error('Seu acesso não permite alterar este checklist.');
  const q=mgSb.from('reproductive_events').update({postpartum_checklist:next}).eq('farm_id',f.id).eq('id',item.event.id).eq('animal_id',item.event.animal_id).eq('event_type','Parto').is('deleted_at',null);
  if(original==null)q.is('postpartum_checklist',null);else q.eq('postpartum_checklist',JSON.stringify(original));
  const {data,error}=await q.select('id').maybeSingle();
  if(error)throw error;
  if(!data)throw Error('Este parto foi alterado. Feche e reabra o checklist para atualizar.');
  // Refresh through the existing API so its offline cache receives the updated row.
  dialog.close();
  await Promise.allSettled([loadRepro(),dashboard()]);
 }catch(error){byId('mgPostpartumError').textContent=error.message||'Não foi possível salvar o checklist.';}
 finally{inFlight=false;sync();}
};
})();
