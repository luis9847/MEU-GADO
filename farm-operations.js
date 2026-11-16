(function(){
'use strict';
const $=id=>document.getElementById(id), kinds={health:'Vacinação / saúde',weight:'Pesagem',reproduction:'Reprodução',move:'Mudança de lote',other:'Outro manejo'};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const date=d=>d?String(d).slice(0,10).split('-').reverse().join('/'):'—';
const brl=c=>(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const cents=v=>Math.round((Number(v)||0)*100);
const monthOf=d=>String(d||'').slice(0,7);
function summarize(sales,expenses,month){
 const lots=new Map(), add=(lot,key,value)=>{const label=lot||'Sem lote';if(!lots.has(label))lots.set(label,{label,sold:0,received:0,spent:0});lots.get(label)[key]+=value;};
 let sold=0,received=0,spent=0,pending=0;
 for(const s of sales){if(s.cancelled_at)continue;const v=cents(s.amount);if(monthOf(s.sale_date)===month){sold+=v;add(s.lot,'sold',v);}if(!s.received_on)pending+=v;else if(monthOf(s.received_on)===month){received+=v;add(s.lot,'received',v);}}
 for(const e of expenses){if(monthOf(e.expense_date)!==month)continue;const v=cents(e.amount);spent+=v;add(e.lot,'spent',v);}
 return {sold,received,spent,pending,result:sold-spent,balance:received-spent,lots:[...lots.values()].sort((a,b)=>a.label.localeCompare(b.label,'pt-BR'))};
}
function monthlyHistory(sales,expenses){
 const months=new Map();
 function add(date,key,amount){
  const month=monthOf(date);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return;
  if(!months.has(month))months.set(month,{month,sold:0,received:0,spent:0});
  months.get(month)[key]+=cents(amount);
 }
 for(const s of sales)if(!s.cancelled_at){add(s.sale_date,'sold',s.amount);add(s.received_on,'received',s.amount);}
 for(const e of expenses)add(e.expense_date,'spent',e.amount);
 return [...months.values()].sort((a,b)=>b.month.localeCompare(a.month)).map(m=>({...m,result:m.sold-m.spent,balance:m.received-m.spent}));
}
if(typeof module==='object'&&module.exports){module.exports={summarize,monthlyHistory};return;}
const E=val=>mgEsc(val), manager=()=>['owner','manager','admin'].includes(mgFarmRole);
const canWrite=()=>navigator.onLine&&MGPlansCore.writable(mgPlanState,mgPlanNow());
const complete=()=>mgHasPlanFeature('expenses')&&manager();
const msg=(id,value)=>{$(id).textContent=value;};
let sales=[],expenses=[],tasks=[],herd=[],lots=[],health=[],repro=[],financeLoad=0,agendaLoad=0;
function setNav(){document.querySelectorAll('[data-management-planning]').forEach(node=>node.hidden=mgFarmRole==='employee');const nav=$('mgFarmFinanceNav');if(nav)nav.hidden=!!mgFarm&&!manager();}
function kpi(label,value){return '<div><small>'+E(label)+'</small><strong>'+E(value)+'</strong></div>';}
function rows(items,empty,size){return items.join('')||'<tr><td colspan="'+size+'">'+E(empty)+'</td></tr>';}
async function requireFarm(write=false){
 if(!navigator.onLine)throw Error('Conecte-se à internet para atualizar esta área.');
 const f=await mgGetFarm();await mgRefreshPlan(f);
 if(write&&!canWrite())throw Error('Seu acesso precisa estar liberado para salvar.');
 return f;
}
const financeColumns=['sold','received','spent','result','balance'];
const monthLabel=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'});
function renderMonthlyHistory(){
 const all=monthlyHistory(sales,expenses), picker=$('mgFinanceHistoryYear'), selected=picker.value;
 const years=[...new Set(all.map(m=>m.month.slice(0,4)))];
 picker.replaceChildren(new Option('Todos os anos',''),...years.map(y=>new Option(y,y)));
 picker.value=years.includes(selected)?selected:'';
 const list=all.filter(m=>!picker.value||m.month.startsWith(picker.value+'-'));
 const values=m=>financeColumns.map(k=>'<td>'+E(brl(m[k]))+'</td>').join('');
 const total=Object.fromEntries(financeColumns.map(k=>[k,list.reduce((sum,m)=>sum+m[k],0)]));
 $('mgFinanceHistoryRows').innerHTML=rows(list.map(m=>'<tr><th scope="row">'+E(monthLabel.format(new Date(m.month+'-01T00:00:00Z')))+'</th>'+values(m)+'</tr>'),'Nenhum mês com movimentação registrada.',6);
 $('mgFinanceHistoryTotal').innerHTML=list.length?'<tr><th scope="row">Total</th>'+values(total)+'</tr>':'';
}
function renderFinance(){
 const month=$('mgFarmFinanceMonth').value||today().slice(0,7), totals=summarize(sales,expenses,month), filter=$('mgFarmFinanceFilter').value;
 $('mgFarmFinanceTotals').innerHTML=kpi('Vendas no mês',brl(totals.sold))+kpi('Recebido no mês',brl(totals.received))+kpi('Gastos no mês',brl(totals.spent))+kpi('Resultado estimado',brl(totals.result))+kpi('Saldo de caixa',brl(totals.balance))+kpi('A receber · todas as datas',brl(totals.pending));
 $('mgFarmFinanceLots').innerHTML=rows(totals.lots.map(x=>'<tr><td>'+E(x.label)+'</td>'+[x.sold,x.received,x.spent,x.sold-x.spent,x.received-x.spent].map(v=>'<td>'+E(brl(v))+'</td>').join('')+'</tr>'),'Sem movimentações por lote no mês.',6);
 const filtered=sales.filter(s=>filter==='pending'?!s.received_on&&!s.cancelled_at:monthOf(s.sale_date)===month||monthOf(s.received_on)===month);
 $('mgFarmFinanceRows').innerHTML=rows(filtered.map(s=>{
  const state=s.cancelled_at?'Cancelada':s.received_on?'Recebida':!Number(s.amount)?'Sem valor informado':s.due_date&&s.due_date<today()?'Em atraso':'A receber';
  return '<tr><td>'+E('#'+s.animal_number+(s.animal_name?' · '+s.animal_name:''))+'<small>'+E(s.lot||'Sem lote')+'</small></td><td>'+E(date(s.sale_date))+'</td><td>'+E(s.buyer||'—')+'</td><td>'+E(brl(cents(s.amount)))+'</td><td>'+E(date(s.due_date))+'</td><td>'+E(date(s.received_on))+'</td><td>'+E(state)+'</td><td>'+(!s.cancelled_at&&canWrite()?'<button type="button" class="btn secondary" data-sale="'+Number(s.id)+'">'+(s.received_on?'Editar':'Detalhar / receber')+'</button>':'—')+'</td></tr>';
 }),'Nenhuma venda para este filtro.',8);
}
async function loadFinance(){
 const run=++financeLoad;$('mgFarmFinanceContent').hidden=true;msg('mgFarmFinanceStatus','Carregando financeiro…');
 try{
  const f=await requireFarm();if(!complete())throw Error('O Financeiro da Fazenda é do plano Completo e está disponível para proprietário e gerente.');
  const data=await Promise.all([mgReportRows('farm_animal_sales','*',true),mgReportRows('expenses')]);
  if(run!==financeLoad||mgFarm?.id!==f.id)return;
  [sales,expenses]=data;sales.sort((a,b)=>b.sale_date.localeCompare(a.sale_date)||b.id-a.id);
  renderFinance();renderMonthlyHistory();$('mgFarmFinanceContent').hidden=false;msg('mgFarmFinanceStatus','');
 }catch(e){if(run===financeLoad)msg('mgFarmFinanceStatus',e.message);}
}
function editSale(id){
 const s=sales.find(x=>String(x.id)===id&&!x.cancelled_at);if(!s||!canWrite()||!complete())return;
 const form=$('mgFarmSaleForm');form.dataset.id=id;
 msg('mgFarmSaleTitle',s.animal_number+' · '+brl(cents(s.amount)));form.buyer.value=s.buyer||'';form.due.value=s.due_date||'';form.received.value=s.received_on||'';form.due.min=form.received.min=s.sale_date;form.received.max=today();
 form.received.disabled=!Number(s.amount);$('mgFarmSaleToday').disabled=!Number(s.amount);
 msg('mgFarmSaleError','');$('mgFarmSaleDialog').showModal();
}
async function saveSale(form){
 const s=sales.find(x=>String(x.id)===form.dataset.id);if(!s)return;
 if(s.received_on&&!form.received.value&&!confirm('Remover a data de recebimento? O valor volta para A receber.'))return;
 const f=await requireFarm(true);if(!complete())throw Error('Sem acesso para editar vendas.');
 const {data,error}=await mgSb.from('farm_animal_sales').update({buyer:form.buyer.value.trim()||null,due_date:form.due.value||null,received_on:form.received.value||null}).eq('farm_id',f.id).eq('id',s.id).is('cancelled_at',null).select('id').maybeSingle();
 if(error)throw Error(error.message);if(!data)throw Error('A venda mudou ou não está disponível. Atualize a tela.');
 $('mgFarmSaleDialog').close();await loadFinance();
}
function selection(select,entries,empty){select.replaceChildren(new Option(empty,''),...entries.map(([id,label])=>new Option(label,String(id))));}
function animal(id){return herd.find(a=>Number(a.id)===Number(id));}function lot(id){return lots.find(l=>Number(l.id)===Number(id));}
function titleFor(t){return [animal(t.animal_id)?mgAnimalLabel(animal(t.animal_id)):t.animal_id?'Animal #'+t.animal_id:'',lot(t.lot_id)?.name||''].filter(Boolean).join(' · ')||'Fazenda';}
function autoList(){
 const living=new Set(herd.map(a=>String(a.id))),terminal=new Map(),result=[],latestPreg=new Map();
 for(const e of repro){const id=String(e.animal_id);if(!living.has(id))continue;if((['Parto','Aborto'].includes(e.event_type)||(e.event_type==='Diagnóstico de gestação'&&e.result==='Negativo'))&&(!terminal.has(id)||e.event_date>terminal.get(id)))terminal.set(id,e.event_date);
  if(e.expected_date&&(['Prenhez confirmada','Inseminação artificial','Monta natural / pasto','Enxertada'].includes(e.event_type)||(e.event_type==='Diagnóstico de gestação'&&e.result==='Positivo'))&&(!latestPreg.has(id)||e.event_date>latestPreg.get(id).event_date))latestPreg.set(id,e);}
 for(const e of health)if(e.next_due_date&&(!e.animal_id||living.has(String(e.animal_id))))result.push({title:[e.event_type,e.product].filter(Boolean).join(' · '),details:e.animal_id?mgAnimalLabel(animal(e.animal_id)):'Fazenda',due:e.next_due_date,type:'health',id:e.id});
 for(const [id,e] of latestPreg)if(!terminal.has(id)||terminal.get(id)<e.event_date)result.push({title:'Parto previsto',details:mgAnimalLabel(animal(id)),due:e.expected_date,type:'birth',id:e.animal_id});
 return result.sort((a,b)=>a.due.localeCompare(b.due));
}
function renderAgenda(){
 const filter=$('mgFarmTaskFilter').value,end=new Date(today()+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+30);const horizon=end.toISOString().slice(0,10), edit=manager()&&canWrite();
 $('mgFarmTaskNew').hidden=!edit;
 const statuses={pending:'Pendente',done:'Concluída',cancelled:'Cancelada'};
 $('mgFarmTaskRows').innerHTML=rows(tasks.filter(t=>filter==='all'||t.status===filter).map(t=>'<tr><td>'+E(date(t.due_date))+'</td><td><b>'+E(t.title)+'</b><small>'+E(kinds[t.kind]+' · '+titleFor(t))+'</small>'+(t.notes?'<small>'+E(t.notes)+'</small>':'')+'</td><td>'+E(t.status==='pending'&&t.due_date<today()?'Em atraso':statuses[t.status])+'</td><td class="mg-ops-actions">'+(edit&&t.status==='pending'?(t.kind!=='other'?'<button type="button" class="btn secondary" data-task-open="'+E(t.id)+'">Abrir lançamento</button> ':'')+'<button type="button" class="btn secondary" data-task-edit="'+E(t.id)+'">Editar</button> <button type="button" class="btn secondary" data-task-done="'+E(t.id)+'">Concluir</button> <button type="button" class="btn secondary" data-task-cancel="'+E(t.id)+'">Cancelar</button>':edit&&t.status==='done'?'<button type="button" class="btn secondary" data-task-reopen="'+E(t.id)+'">Reabrir</button>':'—')+'</td></tr>'),'Nenhuma tarefa nesta situação.',4);
 $('mgFarmAutoRows').innerHTML=rows(autoList().filter(x=>x.due<=horizon).map(x=>'<tr><td>'+E(date(x.due))+'</td><td><b>'+E(x.title)+'</b><small>'+E(x.details)+'</small></td><td>'+E(x.due<today()?'Em atraso':'Previsto')+'</td><td>'+(edit?'<button type="button" class="btn secondary" data-task-auto="'+E(x.type+':'+x.id)+'">'+(x.type==='health'?'Registrar aplicação':'Registrar evento')+'</button>':'—')+'</td></tr>'),'Nenhum lembrete vencido ou previsto para os próximos 30 dias.',4);
}
async function loadAgenda(){
 const run=++agendaLoad;$('mgFarmAgendaContent').hidden=true;msg('mgFarmAgendaStatus','Carregando manejos…');
 try{
  const f=await requireFarm();
  const data=await Promise.all([mgReportRows('farm_management_tasks','*',true),mgReportRows('animals','id,number,name,category,lot,status'),mgReportRows('lots','id,name,active'),mgReportRows('health_events','id,animal_id,event_type,product,next_due_date'),mgReportRows('reproductive_events','id,animal_id,event_type,event_date,expected_date,result')]);
  if(run!==agendaLoad||mgFarm?.id!==f.id)return;
  [tasks,herd,lots,health,repro]=data;herd=herd.filter(a=>a.status==='active');lots=lots.filter(l=>l.active);tasks.sort((a,b)=>a.due_date.localeCompare(b.due_date)||a.id.localeCompare(b.id));
  renderAgenda();$('mgFarmAgendaContent').hidden=false;msg('mgFarmAgendaStatus','');
 }catch(e){if(run===agendaLoad)msg('mgFarmAgendaStatus',!navigator.onLine?'Conecte-se à internet para atualizar a agenda.':'Não foi possível carregar a agenda. Use Atualizar para tentar novamente.');console.warn('Agenda de manejo:',e.message);}
}
function editTask(id){
 const t=id?tasks.find(t=>t.id===id&&t.status==='pending'):null;if(id&&!t)return;if(!canWrite()||!manager())return;
 const form=$('mgFarmTaskForm');form.reset();form.dataset.id=id||'';form.taskTitle.value=t?.title||'';form.kind.value=t?.kind||'health';form.due.value=t?.due_date||today();form.notes.value=t?.notes||'';
 selection(form.animal,herd.map(a=>[a.id,mgAnimalLabel(a)]),'Nenhum animal');selection(form.lot,lots.map(l=>[l.id,l.name]),'Nenhum lote');
 form.animal.value=String(t?.animal_id||'');form.lot.value=String(t?.lot_id||'');msg('mgFarmTaskError','');$('mgFarmTaskDialog').showModal();
}
async function writeTask(id,payload,current){
 const f=await requireFarm(true);if(!manager())throw Error('Somente proprietário e gerente podem alterar tarefas.');
 let q=mgSb.from('farm_management_tasks');
 q=id?q.update(payload).eq('farm_id',f.id).eq('id',id).eq('status',current):q.insert({id:crypto.randomUUID(),...payload,farm_id:f.id});
 const {data,error}=await q.select('id').maybeSingle();if(error)throw Error(error.message);if(!data)throw Error('A tarefa mudou ou foi encerrada. Atualize a agenda.');
}
async function openTask(t){
 if(!canWrite()||!manager())return;
 const a=animal(t.animal_id),l=lot(t.lot_id);
 if(t.kind==='weight'){await Promise.all([loadAnimals(),loadLots()]);if(a)openSingleWeight(a.id);else if(l){openBatchWeight();$('batchLot').value=l.name;renderBatchAnimals();}else openSingleWeight();}
 if(t.kind==='health'){await loadAnimals();await loadLots();openNewHealth();if(a)$('hanimal').value=String(a.id);else if(l)$('hlot').value=l.name;}
 if(t.kind==='reproduction'){await loadRepro();openNewRepro();if(a)$('ranimal').value=String(a.id);updateReproForm();}
 if(t.kind==='move'){if(!a)throw Error('Selecione um animal ativo na tarefa para registrar a mudança de lote.');await loadLots();openMoveAnimal(a.id);if(l)$('moveLot').value=l.name;}
}
async function buttonRun(button,errorId,fn){button.disabled=true;msg(errorId,'');try{await fn();}catch(e){msg(errorId,e.message);}finally{button.disabled=false;}}
let nextFinancePanel=null;
function showFinancePanel(panel){
 $('mgFarmFinanceResult').hidden=panel!=='result';
 $('mgFarmFinanceSales').hidden=panel!=='sales';
 $('mgFarmFinanceFilterLabel').hidden=panel!=='sales';
 document.querySelectorAll('[data-finance-panel]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.financePanel===panel)));
}
for(const host of document.querySelectorAll('[data-mg-area]')){
 const root=host.closest('section').id,finance=host.dataset.mgArea==='finance';
 const nav=document.createElement('nav');nav.className='mg-ops-nav';nav.setAttribute('aria-label',finance?'Financeiro da Fazenda':'Manejo');
 const routes=finance?[['financeiroFazenda','Resultado'],['financeiroFazenda','Vendas'],['gastos','Gastos']]:[['agendaManejo','Agenda'],['planejamento','Planos alimentares'],['nutricao','Fornecimento']];
 for(const [index,[id,label]] of routes.entries()){
  const node=document.createElement(finance&&id==='financeiroFazenda'&&root===id?'button':'a');
  node.textContent=label;
  if(node.tagName==='BUTTON'){
   node.type='button';node.dataset.financePanel=index===0?'result':'sales';
   node.onclick=()=>showFinancePanel(node.dataset.financePanel);
  }else{
   node.href='#'+id;
   if(root===id)node.setAttribute('aria-current','page');
   if(!finance&&id==='planejamento')node.dataset.managementPlanning='true';
   node.onclick=e=>{
    if(finance&&id==='financeiroFazenda'&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey)nextFinancePanel=index===0?'result':'sales';
    return mgNavigate(e,id,node);
   };
  }
  nav.append(node);
 }
 host.replaceChildren(nav);
}
showFinancePanel('result');
window.mgRefreshManagementAgenda=()=>{if($('agendaManejo').classList.contains('active'))loadAgenda();};
window.mgFarmOpsView=function(id){if(id==='financeiroFazenda'){showFinancePanel(nextFinancePanel||'result');nextFinancePanel=null;loadFinance();}if(id==='gastos'){msg('mgFarmExpenseStatus','');loadExpenses().catch(e=>msg('mgFarmExpenseStatus',e.message));}if(id==='agendaManejo')loadAgenda();setNav();};
window.addEventListener('mg:plan-ready',setNav);
$('mgFarmFinanceMonth').value=today().slice(0,7);
$('mgFarmFinanceMonth').onchange=$('mgFarmFinanceFilter').onchange=renderFinance;
$('mgFarmFinanceReload').onclick=loadFinance;
$('mgFinanceHistoryYear').onchange=renderMonthlyHistory;
$('mgFarmFinanceRows').onclick=e=>{const b=e.target.closest('[data-sale]');if(b)editSale(b.dataset.sale);};
$('mgFarmSaleToday').onclick=()=>$('mgFarmSaleForm').received.value=today();
$('mgFarmSaleClose').onclick=()=>$('mgFarmSaleDialog').close();
$('mgFarmSaleForm').onsubmit=e=>{e.preventDefault();buttonRun(e.currentTarget.querySelector('[type=submit]'),'mgFarmSaleError',()=>saveSale(e.target));};
$('mgFarmAgendaReload').onclick=loadAgenda;$('mgFarmTaskNew').onclick=()=>editTask();$('mgFarmTaskFilter').onchange=renderAgenda;
$('mgFarmTaskClose').onclick=()=>$('mgFarmTaskDialog').close();
$('mgFarmTaskForm').onsubmit=e=>{e.preventDefault();const form=e.currentTarget;buttonRun(form.querySelector('[type=submit]'),'mgFarmTaskError',async()=>{
 const payload={title:form.taskTitle.value.trim(),kind:form.kind.value,due_date:form.due.value,animal_id:Number(form.animal.value)||null,lot_id:Number(form.lot.value)||null,notes:form.notes.value.trim()};
 if(!payload.title)throw Error('Informe o nome da tarefa.');
 if(payload.kind==='move'&&(!payload.animal_id||!payload.lot_id))throw Error('Selecione o animal e o lote de destino.');
 if(payload.kind==='reproduction'&&(!animal(payload.animal_id)||!reproIsFemale(animal(payload.animal_id))))throw Error('Selecione uma matriz ativa.');
 await writeTask(form.dataset.id,payload,'pending');$('mgFarmTaskDialog').close();await loadAgenda();
 });};
$('mgFarmTaskRows').onclick=e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.taskEdit)return editTask(b.dataset.taskEdit);
 if(b.dataset.taskOpen){const t=tasks.find(x=>x.id===b.dataset.taskOpen);if(t)buttonRun(b,'mgFarmAgendaStatus',()=>openTask(t));return;}
 const id=b.dataset.taskDone||b.dataset.taskCancel||b.dataset.taskReopen;if(!id)return;
 if(b.dataset.taskCancel&&!confirm('Cancelar esta tarefa planejada?'))return;
 if(b.dataset.taskDone&&!confirm('Confirma que o manejo foi realizado? Isso conclui a tarefa na agenda.'))return;
 buttonRun(b,'mgFarmAgendaStatus',async()=>{await writeTask(id,{status:b.dataset.taskDone?'done':b.dataset.taskCancel?'cancelled':'pending'},b.dataset.taskReopen?'done':'pending');await loadAgenda();});
};
$('mgFarmAutoRows').onclick=e=>{const b=e.target.closest('[data-task-auto]');if(!b||!manager()||!canWrite())return;const [kind,id]=b.dataset.taskAuto.split(':');buttonRun(b,'mgFarmAgendaStatus',async()=>{if(kind==='health'){await loadHealth();mgAlertRegisterApplication(Number(id));}else {await loadRepro();openNewRepro();$('ranimal').value=id;const option=[...$('rtype').options].find(o=>o.value==='Parto');if(option)$('rtype').value=option.value;updateReproForm();}});};
})();
