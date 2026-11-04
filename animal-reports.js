/* Farm-scoped report transformations. No networking, DOM or privileged access. */
(function(root){
 'use strict';
 const purposes={cria:'Cria',recria:'Recria',engorda:'Engorda',genetica:'Genética'},roles={reprodutor:'Reprodutor',rufiao:'Rufião',matriz:'Matriz',doadora:'Doadora',receptora:'Receptora'},conditions={inteiro:'Inteiro',castrado:'Castrado'};
 const missing='__not_informed__';
 const alive=a=>!a.deleted_at;
 const active=a=>alive(a)&&a.status==='active';
 const label=a=>a?'#'+String(a.number??a.id)+(a.name?' · '+a.name:''):'';
 function validate(filters={}){if(filters.start&&filters.end&&filters.start>filters.end)throw Error('A data inicial deve ser anterior ou igual à data final.');}
 function inPeriod(value,f={}){if(!value)return !f.start&&!f.end;const date=String(value).slice(0,10);return (!f.start||date>=f.start)&&(!f.end||date<=f.end);}
 function matchValue(value,filter){if(!filter)return true;if(filter===missing)return !value;return String(value??'')===filter;}
 function matches(a,f={}){return !!a&&matchValue(a.production_purpose,f.activity)&&matchValue(a.breed,f.breed)&&matchValue(a.lot,f.lot)&&matchValue(a.category,f.category);}
 function anyAnimalFilter(f={}){return !!(f.activity||f.breed||f.lot||f.category);}
 function eventMatches(event,map,f){const animal=map.get(String(event.animal_id));if(animal)return matches(animal,f);if(!anyAnimalFilter(f))return true;return !f.activity&&!f.breed&&!f.category&&!!event.lot&&matchValue(event.lot,f.lot);}
 function parent(a,side,map){
  if(a[side+'_id']){const linked=map.get(String(a[side+'_id']));return linked?label(linked):'Vínculo #'+a[side+'_id'];}
  return [a[side+'_external_name'],a[side+'_external_registry']?'Registro: '+a[side+'_external_registry']:''].filter(Boolean).join(' · ');
 }
 function parentSource(a,side){return a[side+'_id']?'Fazenda':a[side+'_external_name']||a[side+'_external_registry']?'Externo':'Não informado';}
 function build(type,{animals=[],events=[],filters={}}={}){
  validate(filters);const map=new Map(animals.map(a=>[String(a.id),a])),current=animals.filter(active).filter(a=>matches(a,filters));let headers=[],rows=[];
  if(type==='rebanho'){
   headers=['Número','Nome','Categoria','Raça','Atividade','Função reprodutiva','Condição do macho','Nascimento','Origem','Entrada no confinamento','Peso inicial (kg)','Peso atual (kg)','Meta de peso (kg)','Lote','Pai','Mãe'];
   rows=current.map(a=>[a.number,a.name||'',a.category,a.breed||'',purposes[a.production_purpose]||'',roles[a.reproductive_role]||'',conditions[a.male_condition]||'',a.birth_date||'',a.origin||'',a.entry_date||'',a.entry_weight??'',a.current_weight??a.entry_weight??'',a.target_weight??'',a.lot||'',parent(a,'father',map),parent(a,'mother',map)]);
  }else if(type==='registrados'){
   headers=['Número','Nome','Categoria','Raça','Atividade','Associação','Série do criador','RGN','RGD','Categoria do registro'];
   rows=current.filter(a=>[a.registry_association,a.registry_series,a.registry_birth,a.registry_definitive,a.registry_category].some(Boolean)).map(a=>[a.number,a.name||'',a.category,a.breed||'',purposes[a.production_purpose]||'',a.registry_association||'',a.registry_series||'',a.registry_birth||'',a.registry_definitive||'',a.registry_category||'']);
  }else if(type==='filiacao'){
   headers=['Número','Nome','Categoria','Raça','Atividade','Pai','Origem do pai','Mãe','Origem da mãe'];
   rows=current.map(a=>[a.number,a.name||'',a.category,a.breed||'',purposes[a.production_purpose]||'',parent(a,'father',map),parentSource(a,'father'),parent(a,'mother',map),parentSource(a,'mother')]);
  }else if(type==='descendentes'){
   headers=['Ascendente','Nome do ascendente','Vínculo','Descendente','Nome do descendente','Nascimento do descendente','Categoria do descendente','Atividade do descendente','Lote do descendente','Situação do descendente'];
   for(const child of animals.filter(alive).filter(a=>inPeriod(a.birth_date,filters)))for(const [side,kind] of [['father','Pai'],['mother','Mãe']]){
    const a=map.get(String(child[side+'_id']));if(!a||!alive(a)||!matches(a,filters))continue;
    rows.push([a.number,a.name||'',kind,child.number,child.name||'',child.birth_date||'',child.category||'',purposes[child.production_purpose]||'',child.lot||'',child.status==='active'?'Ativo':'Baixado']);
   }
  }else if(type==='crias'){
   headers=['Número','Nome','Sexo/Categoria','Raça','Atividade','Nascimento','Peso ao nascer/inicial (kg)','Lote','Pai','Mãe'];
   rows=current.filter(a=>['Bezerro','Bezerra'].includes(a.category)&&inPeriod(a.birth_date,filters)).map(a=>[a.number,a.name||'',a.category,a.breed||'',purposes[a.production_purpose]||'',a.birth_date||'',a.entry_weight??'',a.lot||'',parent(a,'father',map),parent(a,'mother',map)]);
  }else if(type==='baixas'){
   headers=['Número','Nome','Categoria','Raça','Atividade','Tipo da baixa','Data da baixa','Valor','Observação'];
   rows=animals.filter(a=>alive(a)&&a.status!=='active'&&matches(a,filters)&&inPeriod(a.exit_date,filters)).map(a=>[a.number,a.name||'',a.category,a.breed||'',purposes[a.production_purpose]||'',a.exit_type||'',a.exit_date||'',a.exit_value??'',a.exit_notes||'']);
  }else if(type==='prontos_venda'){
   headers=['Número','Nome','Categoria','Raça','Atividade','Lote','Peso atual (kg)','Meta de peso (kg)','Acima da meta (kg)','GMD médio (kg/dia)'];
   rows=current.filter(a=>Number(a.target_weight)>0&&Number(a.current_weight??a.entry_weight??0)>=Number(a.target_weight)).map(a=>{const weight=Number(a.current_weight??a.entry_weight??0);return [a.number,a.name||'',a.category,a.breed||'',purposes[a.production_purpose]||'',a.lot||'',weight,a.target_weight,weight-Number(a.target_weight),Number.isFinite(a.gmd)?a.gmd:''];});
  }else if(type==='pesagens'){
   headers=['Data','Animal','Categoria','Peso (kg)','Lote atual','Observação'];
   rows=events.filter(e=>inPeriod(e.weighing_date,filters)&&eventMatches(e,map,filters)).map(e=>{const a=map.get(String(e.animal_id));return [e.weighing_date,label(a)||e.animal_number||e.animal_id,a?.category||'',e.weight,a?.lot||e.lot||'',e.notes||''];});
  }else if(type==='saude'){
   headers=['Data','Animal/Lote','Tipo','Produto','Próxima dose','Observação'];
   rows=events.filter(e=>inPeriod(e.event_date,filters)&&eventMatches(e,map,filters)).map(e=>[e.event_date,label(map.get(String(e.animal_id)))||(e.animal_number?'#'+e.animal_number:e.lot||'Geral'),e.event_type,e.product||'',e.next_due_date||'',e.notes||'']);
  }else if(type==='reproducao'){
   headers=['Data','Animal','Evento','Resultado','Data prevista','Observação'];
   rows=events.filter(e=>inPeriod(e.event_date,filters)&&eventMatches(e,map,filters)).map(e=>[e.event_date,label(map.get(String(e.animal_id)))||e.animal_number||e.animal_id||'',e.event_type,e.result||'',e.expected_date||'',e.notes||'']);
  }else if(type==='alimentacao'){
   headers=['Data','Lote','Alimento','Quantidade kg','Custo total','Custo/kg','Observação'];
   rows=events.filter(e=>inPeriod(e.entry_date,filters)&&matchValue(e.lot_name,filters.lot)).map(e=>{const q=Number(e.quantity_kg||0),c=Number(e.total_cost||0);return [e.entry_date,e.lot_name||'',e.feed_name||'',q,c,q?c/q:0,e.notes||''];});
  }else if(type==='gastos'){
   headers=['Data','Categoria','Descrição','Valor','Lote','Observação'];
   rows=events.filter(e=>inPeriod(e.expense_date,filters)&&matchValue(e.lot,filters.lot)).map(e=>[e.expense_date,e.category,e.description||'',e.amount,e.lot||'',e.notes||'']);
  }else if(type==='leite'){
   headers=['Data','Animal','Raça','Manhã L','Tarde L','Noite L','Total L','Descarte L','Observação'];
   rows=events.filter(e=>inPeriod(e.production_date,filters)&&eventMatches(e,map,filters)).map(e=>{const a=map.get(String(e.animal_id)),total=Number(e.morning_liters||0)+Number(e.afternoon_liters||0)+Number(e.evening_liters||0);return [e.production_date,label(a)||e.animal_id,a?.breed||'',e.morning_liters||0,e.afternoon_liters||0,e.evening_liters||0,total,e.discarded_liters||0,e.notes||''];});
  }else throw Error('Relatório não reconhecido.');
  return {headers,rows};
 }
 function filterSummary(type,f={}){
  const values=[],lotOnly=['alimentacao','gastos'].includes(type);
  if(!lotOnly&&f.activity)values.push('Atividade: '+(f.activity===missing?'Não informada':purposes[f.activity]||f.activity));
  if(!lotOnly&&f.breed)values.push('Raça: '+(f.breed===missing?'Não informada':f.breed));
  if(f.lot)values.push('Lote: '+(f.lot===missing?'Sem lote':f.lot));
  if(!lotOnly&&f.category)values.push('Categoria: '+f.category);
  const base=values.join(' · ')||'Sem filtros de animais';
  return type==='descendentes'?base+' · Filtros sobre o ascendente; período sobre o nascimento do descendente':base;
 }
 function columnGroups(headers,max=8){const all=headers.map((_,i)=>i);if(all.length<=max)return [all];const groups=[];for(let i=2;i<all.length;i+=max-2)groups.push([0,1,...all.slice(i,i+max-2)]);return groups;}
 function csvCell(value){let text=String(value??'');if(typeof value!=='number'&&/^[\s\u0000-\u001f]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
 const api={purposes,missing,validate,inPeriod,matches,eventMatches,label,parent,parentSource,build,filterSummary,columnGroups,csvCell};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MGAnimalReports=api;
})(typeof window==='undefined'?globalThis:window);
