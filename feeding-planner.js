/* Meu Gado: farm-scoped feed catalog and producer-entered beef feeding plans. */
(function(){
 'use strict';
 const C=window.MGFeedingCore;
 const state={foods:[],plans:[],lots:[],animals:[],entries:[],tab:'plans',loaded:false,loading:false,busy:false,foodId:null,planId:null,revision:null,farmId:null,offline:false};
 const el=id=>document.getElementById(id), esc=v=>mgEsc(v), num=(v,d=2)=>Number(v).toLocaleString('pt-BR',{maximumFractionDigits:d}), cash=v=>v===null?'Preço não informado':money(v);
 const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
 const date=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
 const writable=()=>['owner','admin','manager'].includes(mgFarmRole);
 const management={pasto:'A pasto',semi:'Semiconfinamento',confinamento:'Confinamento'};
 const kind={volumoso:'Volumoso',concentrado:'Concentrado',suplemento:'Suplemento',outro:'Outro'};
 const root=el('planejamento');
 root.innerHTML=`<div class="page-title"><div><h2>🌱 Planejamento alimentar</h2><p>Organize o fornecimento diário do gado de engorda.</p></div><div class="fp-actions"><button class="btn secondary" data-fp="refresh">Atualizar</button><button class="btn primary" data-fp="new-plan" id="fpNewPlan">+ Novo plano</button><button class="btn primary" data-fp="new-food" id="fpNewFood" hidden>+ Cadastrar alimento</button></div></div>
 <div class="fp-note">Defina as quantidades com orientação técnica. O Meu Gado calcula o fornecimento e o custo do plano cadastrado; não formula nem garante a adequação nutricional da dieta. No pasto e no semiconfinamento, o capim consumido no campo não é medido por esta tela.</div>
 <div id="fpStatus" role="status" aria-live="polite"></div><div class="fp-tabs" role="tablist" aria-label="Planejamento alimentar"><button class="btn secondary" role="tab" id="fpTabPlans" aria-selected="true" aria-controls="fpPlans" data-fp="plans">Planos por lote</button><button class="btn secondary" role="tab" id="fpTabFoods" aria-selected="false" aria-controls="fpFoods" data-fp="foods">Meus alimentos</button></div>
 <div id="fpEditor"></div><div id="fpPlans" role="tabpanel" aria-labelledby="fpTabPlans"></div><div id="fpFoods" role="tabpanel" aria-labelledby="fpTabFoods" hidden></div>`;
 function status(message,error=false){el('fpStatus').className=message?'fp-note'+(error?' fp-error':''):'';el('fpStatus').textContent=message;}
 function canWrite(){if(!writable())throw new Error('Somente o proprietário e os gerentes podem gerenciar planos e custos.');if(state.offline||!navigator.onLine)throw new Error('Conecte-se à internet para salvar. A consulta dos dados já carregados continua disponível offline.');}
 function tab(name){state.tab=name;el('fpPlans').hidden=name!=='plans';el('fpFoods').hidden=name!=='foods';el('fpNewPlan').hidden=name!=='plans';el('fpNewFood').hidden=name!=='foods';el('fpTabPlans').setAttribute('aria-selected',name==='plans');el('fpTabFoods').setAttribute('aria-selected',name==='foods');el('fpEditor').innerHTML='';}
 async function load(){
  if(state.loading)return;
  state.loading=true;status('Carregando alimentos e planos…');
  try{
   if(!writable())throw new Error('Esta área contém custos e está disponível para o proprietário e os gerentes.');
   const f=await mgGetFarm();if(!writable())throw new Error('Seu perfil não possui acesso a esta área.');const cacheKey=`feeding-planner-v1:${mgUser.id}:${f.id}`;
   if(!navigator.onLine){const hit=await mgOfflineGet(MG_OFFLINE_CACHE,cacheKey);if(!hit)throw new Error('Conecte-se uma vez para carregar os planos neste aparelho.');Object.assign(state,hit.data,{offline:true});status('Consulta offline. Dados de '+new Date(hit.updatedAt).toLocaleString('pt-BR')+'. Conecte-se para atualizar ou salvar.');}
   else{
    const [foods,plans,lots,animals,entries]=await Promise.all([
     mgSb.from('feed_ingredients').select('*').eq('farm_id',f.id).order('name'),
     mgSb.from('feeding_plans').select('*').eq('farm_id',f.id).order('created_at',{ascending:false}),
     api('/api/lots'),api('/api/animals'),api('/api/nutrition')
    ]);
    if(foods.error)throw foods.error;if(plans.error)throw plans.error;
    Object.assign(state,{foods:foods.data||[],plans:plans.data||[],lots,animals,entries,farmId:f.id,offline:false});
    try{await mgOfflinePut(MG_OFFLINE_CACHE,{data:{foods:state.foods,plans:state.plans,lots,animals,entries,farmId:f.id},updatedAt:new Date().toISOString()},cacheKey)}catch(_e){}
    status('');
   }
   state.loaded=true;render();
  }catch(e){status('Não foi possível carregar o planejamento. '+(e.message||e),true);state.loaded=false;el('fpPlans').innerHTML='';el('fpFoods').innerHTML='';}
  finally{state.loading=false;}
 }
 function lotFor(p){return state.lots.find(l=>String(l.id)===String(p.lot_id));}
 function summary(p){return C.lotSummary(state.animals,lotFor(p)?.name||'');}
 function calc(p){return C.calculate(p.items,summary(p).heads,Number(p.meals),30);}
 function usable(p){const l=lotFor(p);return l&&l.active&&!l.deleted_at&&C.activeOn(p,today());}
 function render(){
  const active=state.plans.filter(usable);const estimated=active.map(calc);const totalCost=estimated.every(c=>c.cost_day!==null)?estimated.reduce((s,c)=>s+c.cost_day,0):null;
  const cards=state.plans.filter(p=>!p.archived).map(p=>{
   const l=lotFor(p),s=summary(p),c=calc(p);const inactive=!usable(p);
   return `<article class="fp-plan-card"><h3>${esc(p.name)}</h3><div class="fp-sub">${esc(l?.name||'Lote indisponível')} · ${esc(management[p.management])} · ${s.heads} animais ativos · ${p.meals} trato(s)/dia${inactive?' · Fora da vigência ou lote inativo':''}</div><p>${num(c.kg_day)} kg/dia no lote · ${cash(c.cost_day)}/dia</p><div class="fp-actions"><button class="btn primary" data-fp="detail" data-id="${p.id}">Ver fornecimento</button><button class="btn secondary" data-fp="edit-plan" data-id="${p.id}">Editar</button><button class="btn secondary" data-fp="archive-plan" data-id="${p.id}">Arquivar</button></div></article>`;
  }).join('');
  el('fpPlans').innerHTML=`<div class="fp-grid"><div class="fp-metric"><small>PLANOS EM VIGÊNCIA</small><strong>${active.length}</strong><span>Lotes ativos hoje</span></div><div class="fp-metric"><small>ANIMAIS NOS PLANOS</small><strong>${estimated.reduce((s,c)=>s+c.heads,0)}</strong><span>Recalculado pelo lote atual</span></div><div class="fp-metric"><small>FORNECIMENTO DIÁRIO</small><strong>${num(estimated.reduce((s,c)=>s+c.kg_day,0))} kg</strong><span>Alimentos cadastrados</span></div><div class="fp-metric"><small>CUSTO DIÁRIO PREVISTO</small><strong>${totalCost===null?'—':cash(totalCost)}</strong><span>${totalCost===null?'Há alimento sem preço':'Preços salvos nos planos'}</span></div></div>${cards||'<div class="fp-empty">Nenhum plano cadastrado. Cadastre seus alimentos e crie o primeiro plano para um lote.</div>'}<details><summary>Planos arquivados</summary>${state.plans.filter(p=>p.archived).map(p=>`<p>${esc(p.name)} <button class="btn secondary" data-fp="detail" data-id="${p.id}">Consultar</button></p>`).join('')||'<p>Nenhum plano arquivado.</p>'}</details>`;
  const foods=state.foods.filter(f=>!f.archived);
  el('fpFoods').innerHTML=`<div class="fp-note">Cadastre somente os alimentos da sua fazenda. Quantidades e preços são calculados em kg de alimento natural (como fornecido). Para um saco de 30 kg, divida o preço do saco por 30. Composição é opcional e deve vir de rótulo ou análise.</div>${foods.length?`<div class="fp-scroll"><table><thead><tr><th>Alimento</th><th>Tipo</th><th>Preço/kg</th><th>Matéria seca</th><th>Estoque informado</th><th>Ações</th></tr></thead><tbody>${foods.map(f=>`<tr><td><b>${esc(f.name)}</b></td><td>${esc(kind[f.kind])}</td><td>${cash(f.price_kg)}</td><td>${f.dry_matter_pct===null?'—':num(f.dry_matter_pct)+'%'}</td><td>${f.stock_kg===null?'—':num(f.stock_kg)+' kg em '+date(f.stock_date)}</td><td><div class="fp-actions"><button class="btn secondary" data-fp="edit-food" data-id="${f.id}">Editar</button><button class="btn secondary" data-fp="archive-food" data-id="${f.id}">Arquivar</button></div></td></tr>`).join('')}</tbody></table></div>`:'<div class="fp-empty">Seu catálogo está vazio. Clique em Cadastrar alimento para começar.</div>'}`;
 }
 function input(id,label,value='',attrs=''){return `<label>${label}<input id="${id}" value="${esc(value??'')}" ${attrs}></label>`;}
 function options(obj,value){return Object.entries(obj).map(([k,v])=>`<option value="${esc(k)}" ${k===value?'selected':''}>${esc(v)}</option>`).join('');}
 function editorFocus(){el('fpEditor').scrollIntoView({behavior:'smooth',block:'start'});el('fpEditor').querySelector('input,select')?.focus();}
 function foodEditor(id){
  canWrite();tab('foods');const f=state.foods.find(x=>x.id===id)||{};state.foodId=f.id||null;state.revision=f.revision||null;
  el('fpEditor').innerHTML=`<form id="fpFoodForm" class="fp-editor"><h3>${f.id?'Editar':'Cadastrar'} alimento</h3><div class="fp-form">${input('fpFoodName','Nome do alimento *',f.name,'required maxlength="120" autocomplete="off"')}<label>Tipo *<select id="fpFoodKind">${options(kind,f.kind||'volumoso')}</select></label>${input('fpFoodPrice','Preço por kg (R$)',f.price_kg,'type="number" min="0" max="1000000" step="0.0001"')}${input('fpFoodStock','Estoque informado (kg)',f.stock_kg,'type="number" min="0" max="1000000000" step="0.001"')}${input('fpFoodStockDate','Data do estoque',f.stock_date||today(),'type="date"')}${input('fpFoodDm','Matéria seca (%)',f.dry_matter_pct,'type="number" min="0.001" max="100" step="0.001"')}${input('fpFoodPb','Proteína bruta (% da matéria seca)',f.protein_pct,'type="number" min="0" max="100" step="0.001"')}${input('fpFoodNdt','NDT (% da matéria seca)',f.ndt_pct,'type="number" min="0" max="100" step="0.001"')}${input('fpFoodSource','Fonte da composição (rótulo/análise)',f.composition_source,'maxlength="300"')}<label class="fp-full">Observações<textarea id="fpFoodNotes" maxlength="2000">${esc(f.notes||'')}</textarea></label></div><p class="fp-sub">Preço vazio significa desconhecido; zero significa sem custo. Alterações no catálogo não atualizam os preços salvos nos planos: edite e salve o plano para atualizá-los. Estoque é um saldo informado, sem baixa automática.</p><div class="fp-actions"><button class="btn primary" type="submit">Salvar alimento</button><button class="btn secondary" type="button" data-fp="cancel">Cancelar</button></div></form>`;editorFocus();
 }
 function optional(id){const v=el(id).value.trim();return v===''?null:Number(v);}
 async function persist(table,id,row,revision){
  const f=await mgGetFarm();let q=id?mgSb.from(table).update(row).eq('farm_id',f.id).eq('id',id).eq('revision',revision):mgSb.from(table).insert({...row,farm_id:f.id});
  const r=await q.select('id').maybeSingle();if(r.error){if(['23505','23P01'].includes(r.error.code))throw new Error('Já existe um alimento com esse nome ou outro plano em vigor para o lote.');throw r.error;}if(!r.data)throw new Error('Este registro foi alterado em outro aparelho. Atualize a tela antes de editar novamente.');
 }
 async function saveFood(){
  canWrite();const row={name:el('fpFoodName').value.trim(),kind:el('fpFoodKind').value,price_kg:optional('fpFoodPrice'),stock_kg:optional('fpFoodStock'),stock_date:el('fpFoodStockDate').value||null,dry_matter_pct:optional('fpFoodDm'),protein_pct:optional('fpFoodPb'),ndt_pct:optional('fpFoodNdt'),composition_source:el('fpFoodSource').value.trim(),notes:el('fpFoodNotes').value.trim()};
  if(!row.name)throw new Error('Informe o nome do alimento.');await persist('feed_ingredients',state.foodId,row,state.revision);el('fpEditor').innerHTML='';await load();status('Alimento salvo.');
 }
 function foodOptions(id){return '<option value="">Selecione um alimento</option>'+state.foods.filter(f=>!f.archived).map(f=>`<option value="${f.id}" ${f.id===id?'selected':''}>${esc(f.name)}</option>`).join('');}
 function addLine(item={}){
  if(el('fpLines').children.length>=30)throw new Error('O limite é de 30 alimentos por plano.');
  const row=document.createElement('div');row.className='fp-line';row.innerHTML=`<label>Alimento *<select class="fp-ingredient" required>${foodOptions(item.ingredient_id)}</select></label><label>Kg/animal/dia *<input class="fp-qty" type="number" min="0.001" max="1000" step="0.001" required value="${esc(item.kg_head_day||'')}"></label><button type="button" class="btn secondary" data-fp="remove-line" aria-label="Remover alimento">Remover</button>`;el('fpLines').append(row);preview();
 }
 function planEditor(id){
  canWrite();if(!state.foods.some(f=>!f.archived)){tab('foods');status('Cadastre pelo menos um alimento antes de criar o plano.');return;}
  if(!state.lots.some(l=>l.active&&!l.deleted_at))throw new Error('Cadastre um lote ativo e os animais antes de criar o plano.');
  tab('plans');const p=state.plans.find(x=>x.id===id)||{};state.planId=p.id||null;state.revision=p.revision||null;
  el('fpEditor').innerHTML=`<form id="fpPlanForm" class="fp-editor"><h3>${p.id?'Editar':'Novo'} plano por lote</h3><div class="fp-form">${input('fpPlanName','Nome do plano *',p.name,'required maxlength="120"')}<label>Lote *<select id="fpPlanLot" required><option value="">Selecione o lote</option>${state.lots.filter(l=>l.active&&!l.deleted_at).map(l=>`<option value="${l.id}" ${String(l.id)===String(p.lot_id)?'selected':''}>${esc(l.name)}</option>`).join('')}</select></label><label>Manejo *<select id="fpPlanManagement">${options(management,p.management||'pasto')}</select></label>${input('fpPlanMeals','Tratos por dia (divisão igual) *',p.meals||2,'type="number" min="1" max="12" step="1" required')}${input('fpPlanStart','Início do plano *',p.start_date||today(),'type="date" required')}${input('fpPlanEnd','Fim do plano (opcional)',p.end_date,'type="date"')}${input('fpPlanGmd','Meta de ganho (kg/animal/dia, opcional)',p.target_gmd,'type="number" min="0.001" max="5" step="0.001"')}${input('fpPlanReference','Responsável ou referência técnica',p.technical_reference,'maxlength="300"')}<label class="fp-full">Orientações de manejo<textarea id="fpPlanNotes" maxlength="2000">${esc(p.notes||'')}</textarea></label></div><p class="fp-sub">Informe a quantidade de alimento natural, como vai ao cocho. A meta de ganho é informativa; não calcula a dieta nem garante o resultado.</p><div id="fpLines"></div><button type="button" class="btn secondary" data-fp="add-line">+ Adicionar alimento</button><div id="fpPreview" class="fp-note" aria-live="polite"></div><div class="fp-actions"><button type="submit" class="btn primary">Salvar plano</button><button type="button" class="btn secondary" data-fp="cancel">Cancelar</button></div></form>`;
  (p.items||[{}]).forEach(addLine);preview();editorFocus();
 }
 function draftItems(){return Array.from(el('fpLines').children).map(row=>{const f=state.foods.find(x=>x.id===row.querySelector('select').value);return {...f,ingredient_id:f?.id,kg_head_day:Number(row.querySelector('input').value)};});}
 function preview(){
  if(!el('fpPreview'))return;
  try{const l=state.lots.find(x=>String(x.id)===el('fpPlanLot').value),s=C.lotSummary(state.animals,l?.name||''),items=draftItems();if(!l||items.some(i=>!i.ingredient_id||!i.kg_head_day)){el('fpPreview').textContent='Selecione o lote e preencha as quantidades para visualizar o cálculo.';return;}
   const c=C.calculate(items,s.heads,Number(el('fpPlanMeals').value));el('fpPreview').textContent=`${s.heads} animais ativos · ${num(c.kg_day)} kg/dia no lote · ${num(c.kg_day/c.meals)} kg por trato · ${cash(c.cost_day)}/dia. Quantidades recalculadas conforme o lote atual.`;
  }catch(e){el('fpPreview').textContent=e.message;}
 }
 async function savePlan(){
  canWrite();const items=draftItems().map(i=>({ingredient_id:i.ingredient_id,kg_head_day:i.kg_head_day}));if(!items.length||items.some(i=>!i.ingredient_id||!Number.isFinite(i.kg_head_day)||i.kg_head_day<0.001))throw new Error('Preencha pelo menos um alimento e uma quantidade positiva.');if(new Set(items.map(i=>i.ingredient_id)).size!==items.length)throw new Error('Não repita o mesmo alimento. Some as quantidades em uma linha.');
  const row={name:el('fpPlanName').value.trim(),lot_id:Number(el('fpPlanLot').value),management:el('fpPlanManagement').value,meals:Number(el('fpPlanMeals').value),start_date:el('fpPlanStart').value,end_date:el('fpPlanEnd').value||null,target_gmd:optional('fpPlanGmd'),technical_reference:el('fpPlanReference').value.trim(),notes:el('fpPlanNotes').value.trim(),items};
  if(!row.name||!row.lot_id||!row.start_date)throw new Error('Informe o nome, o lote e a data de início.');if(row.end_date&&row.end_date<row.start_date)throw new Error('O fim do plano deve ser igual ou posterior ao início.');
  await persist('feeding_plans',state.planId,row,state.revision);el('fpEditor').innerHTML='';await load();status('Plano salvo. Quantidades prontas para consulta.');
 }
 async function archive(type,id){
  canWrite();const list=type==='food'?state.foods:state.plans,r=list.find(x=>x.id===id);if(!r)return;
  if(!confirm(`Arquivar ${r.name}? O registro será preservado para consulta.`))return;
  await persist(type==='food'?'feed_ingredients':'feeding_plans',id,{archived:true},r.revision);await load();status('Registro arquivado.');
 }
 function detail(id){
  const p=state.plans.find(x=>x.id===id);if(!p)return;const l=lotFor(p),s=summary(p),c=calc(p),on=usable(p);
  const other=state.plans.filter(x=>usable(x)&&x.id!==p.id);
  el('fpEditor').innerHTML=`<div class="fp-editor"><h3>${esc(p.name)} · ${esc(l?.name||'Lote indisponível')}</h3><p>${esc(management[p.management])} · ${date(p.start_date)} até ${p.end_date?date(p.end_date):'sem data final'} · ${p.meals} trato(s) iguais/dia</p><p class="fp-sub">${s.heads} animais ativos. Peso médio conhecido: ${s.avg_weight===null?'—':num(s.avg_weight)+' kg'} (${s.weighed}/${s.heads} com peso). Referência mais antiga: ${date(s.oldest_date)}. Atualize as pesagens para acompanhar o lote.</p>${!on?'<div class="fp-note">Plano arquivado, fora de vigência ou lote inativo. Valores abaixo são uma simulação com a composição atual do lote.</div>':''}${!s.heads?'<div class="fp-note">O lote não possui animais ativos. O fornecimento total será zero até cadastrar ou mover os animais.</div>':''}<div class="fp-grid"><div class="fp-metric"><small>KG/LOTE/DIA</small><strong>${num(c.kg_day)}</strong></div><div class="fp-metric"><small>CUSTO/ANIMAL/DIA</small><strong>${cash(c.cost_head)}</strong></div><div class="fp-metric"><small>CUSTO/LOTE/DIA</small><strong>${cash(c.cost_day)}</strong></div><div class="fp-metric"><small>PROJEÇÃO PARA 30 DIAS</small><strong>${cash(c.cost_period)}</strong></div></div><p class="fp-sub">Projeção de 30 dias com lote e preços constantes; pode ultrapassar a vigência do plano. Preços e composição correspondem ao último salvamento do plano em ${date(p.updated_at)}.</p><div class="fp-scroll"><table><thead><tr><th>Alimento</th><th>Kg/animal/dia</th><th>Kg/lote/dia</th><th>Kg/lote/trato</th><th>Kg em 30 dias</th><th>Custo/dia</th><th>Estoque ÷ demanda</th><th></th></tr></thead><tbody>${c.lines.map((i,index)=>{
   const f=state.foods.find(x=>x.id===i.ingredient_id),demand=i.kg_day+other.reduce((n,x)=>n+calc(x).lines.filter(z=>z.ingredient_id===i.ingredient_id).reduce((a,z)=>a+z.kg_day,0),0),days=C.stockDays(f?.stock_kg,demand);
   return `<tr><td><b>${esc(i.name)}</b></td><td>${num(i.kg_head_day,3)}</td><td>${num(i.kg_day,3)}</td><td>${num(i.kg_meal,3)}</td><td>${num(i.kg_period)}</td><td>${cash(i.cost_day)}</td><td>${days===null?'—':num(days,1)+' dias'}${f?.stock_date?'<div class="fp-sub">Saldo em '+date(f.stock_date)+'</div>':''}</td><td>${on&&s.heads>0&&!state.offline?`<button class="btn secondary" data-fp="entry" data-id="${p.id}" data-index="${index}">Preparar lançamento</button>`:''}</td></tr>`;
  }).join('')}</tbody></table></div><p class="fp-sub">Estoque ÷ demanda considera o saldo manual e a demanda dos planos em vigor hoje. Não desconta consumo passado nem prevê mudanças futuras de lote ou plano. Não há baixa automática.</p><p>Matéria seca dos alimentos informados: <b>${c.dm_head===null?'Composição incompleta':num(c.dm_head,3)+' kg/animal/dia'}</b>. Esse total não avalia o balanceamento nutricional${p.management!=='confinamento'?' e não inclui o pasto consumido no campo':''}.</p><p>Meta de ganho: ${p.target_gmd?num(p.target_gmd,3)+' kg/animal/dia (informada, sem garantia)':'não informada'}.</p>${p.technical_reference?'<p>Referência técnica: '+esc(p.technical_reference)+'</p>':''}${p.notes?'<p style="white-space:pre-wrap">'+esc(p.notes)+'</p>':''}<h4>Planejado × fornecido hoje</h4><p class="fp-sub">Comparação pela quantidade total dos lançamentos do lote e do dia, inclusive os feitos fora deste plano. Não mede o consumo real nem inclui capim no campo.</p><p>Planejado: <b>${num(c.kg_day)} kg</b> · Fornecido: <b>${num(state.entries.filter(e=>!e.deleted_at&&e.lot_name===l?.name&&e.entry_date===today()).reduce((n,e)=>n+Number(e.quantity_kg||0),0))} kg</b></p><div class="fp-actions"><button class="btn secondary" data-fp="nutrition">Ver histórico de alimentação</button><button class="btn secondary" data-fp="cancel">Fechar</button></div></div>`;editorFocus();
 }
 function prepareEntry(id,index){
  canWrite();const p=state.plans.find(x=>x.id===id);if(!p||!usable(p))throw new Error('O plano não está em vigor.');const l=lotFor(p),c=calc(p),line=c.lines[index];if(!line||!c.heads)throw new Error('O lote precisa ter animais ativos.');
  const marker=`[PLANO:${p.id}:${line.ingredient_id}]`;
  if(state.entries.some(e=>!e.deleted_at&&e.entry_date===today()&&String(e.notes||'').includes(marker))&&!confirm('Já existe um lançamento deste alimento/plano hoje. Deseja preparar outro?'))return;
  if(!confirm('Preparar o total diário de '+num(line.kg_day)+' kg de '+line.name+' para '+l.name+'? Confira a quantidade realmente fornecida antes de salvar.'))return;
  openNutrition();el('nutLot').value=l.name;el('nutDate').value=today();el('nutFeed').value=line.name;el('nutQty').value=line.kg_day.toFixed(3);el('nutCost').value=line.cost_day===null?'':line.cost_day.toFixed(2);el('nutNotes').value=marker+' '+p.name+' · '+c.heads+' animais · total diário. Conferir o fornecido.';
  // Existing nutrition form accepts hundredths of kg.
  el('nutQty').step='0.001';
 }
 root.addEventListener('click',async e=>{
  const b=e.target.closest('[data-fp]');if(!b||state.busy)return;
  try{switch(b.dataset.fp){case 'plans':tab('plans');break;case 'foods':tab('foods');break;case 'refresh':if(el('fpEditor').innerHTML&&!confirm('Descartar a edição aberta e atualizar os dados?'))return;el('fpEditor').innerHTML='';await load();break;case 'new-food':foodEditor();break;case 'edit-food':foodEditor(b.dataset.id);break;case 'new-plan':planEditor();break;case 'edit-plan':planEditor(b.dataset.id);break;case 'add-line':addLine();break;case 'remove-line':b.closest('.fp-line').remove();preview();break;case 'cancel':el('fpEditor').innerHTML='';break;case 'detail':detail(b.dataset.id);break;case 'nutrition':show('nutricao');break;case 'entry':prepareEntry(b.dataset.id,Number(b.dataset.index));break;case 'archive-food':case 'archive-plan':state.busy=true;b.disabled=true;await archive(b.dataset.fp==='archive-food'?'food':'plan',b.dataset.id);break;}}
  catch(err){status(err.message||String(err),true);}finally{state.busy=false;b.disabled=false;}
 });
 root.addEventListener('input',preview);root.addEventListener('change',preview);
 root.addEventListener('submit',async e=>{
  if(!['fpFoodForm','fpPlanForm'].includes(e.target.id))return;e.preventDefault();if(state.busy)return;state.busy=true;const form=e.target;form.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{if(form.id==='fpFoodForm')await saveFood();else await savePlan();}catch(err){status(err.message||String(err),true);el('fpStatus').scrollIntoView({behavior:'smooth'});}finally{state.busy=false;form.querySelectorAll('button').forEach(b=>b.disabled=false);}
 });
 const previousShow=show;show=function(id,button){if(id==='planejamento'&&!writable()){status('Seu perfil não possui acesso ao planejamento alimentar.',true);alert('Esta área está disponível para o proprietário e os gerentes.');return;}const r=previousShow(id,button);if(id==='planejamento')load();return r;};
 window.addEventListener('online',()=>{if(root.classList.contains('active')&&!el('fpEditor').innerHTML)load();});
 // restoreLastView may have run before this deferred module.
 if(root.classList.contains('active'))load();
})();
