/* Optional animal form sections, backed by server-validated animal columns. */
const mgBreedingIds={registry_association:'aregAssociation',registry_series:'aregSeries',registry_birth:'aregBirth',registry_definitive:'aregDefinitive',registry_category:'aregCategory',reproductive_role:'areproRole',male_condition:'amaleCondition',father_id:'afatherId',mother_id:'amotherId',father_external_name:'afatherName',father_external_registry:'afatherRegistry',mother_external_name:'amotherName',mother_external_registry:'amotherRegistry'};
function mgParentSourceChange(parent){
 const mode=document.getElementById('a'+parent+'Source').value;
 document.getElementById('a'+parent+'Herd').hidden=mode!=='herd';
 document.getElementById('a'+parent+'External').hidden=mode!=='external';
}
function mgSyncBreedingClassification(){
 const female=MGAnimalBreeding.female(document.getElementById('acat').value),condition=document.getElementById('amaleCondition'),role=document.getElementById('areproRole');
 if(!condition||!role)return;
 condition.disabled=female;if(female)condition.value='';
 for(const option of role.options){option.disabled=!!option.value&&((['matriz','doadora','receptora'].includes(option.value)!==female)||(!female&&condition.value==='castrado'));}
 if(role.selectedOptions[0]?.disabled)role.value='';
}
async function mgFillBreedingForm(animal={}){
 for(const [key,id] of Object.entries(mgBreedingIds)){const el=document.getElementById(id);if(el)el.value=animal[key]??'';}
 let parents=[],unavailable=false;
 try{parents=await api('/api/animals/parents');}catch{unavailable=true;}
 const note=document.getElementById('mgParentsNotice');
 note.textContent=unavailable?'Não foi possível carregar os ascendentes da fazenda. Conecte-se e reabra o cadastro para atualizar a lista. Vínculos existentes serão preservados.':'';
 for(const parent of ['father','mother']){
  const key=parent+'_id',select=document.getElementById(mgBreedingIds[key]),isMother=parent==='mother';
  const eligible=parents.filter(a=>Number(a.id)!==Number(animal.id)&&MGAnimalBreeding.female(a.category)===isMother);
  select.replaceChildren(new Option('Selecione o animal…',''));
  for(const a of eligible)select.add(new Option(mgAnimalLabel(a)+(a.status!=='active'?' · Baixado':''),String(a.id)));
  if(animal[key]&&!eligible.some(a=>Number(a.id)===Number(animal[key])))select.add(new Option('Vínculo existente · animal #'+animal[key],String(animal[key])));
  select.value=animal[key]??'';
  document.getElementById('a'+parent+'Source').value=animal[key]?'herd':animal[parent+'_external_name']||animal[parent+'_external_registry']?'external':'';
  mgParentSourceChange(parent);
 }
 mgSyncBreedingClassification();
 document.getElementById('mgAnimalRegistration').open=Object.keys(MGAnimalBreeding.textFields).some(k=>k.startsWith('registry_')&&animal[k]);
 document.getElementById('mgAnimalClassification').open=!!(animal.reproductive_role||animal.male_condition);
 document.getElementById('mgAnimalParentage').open=!!(animal.father_id||animal.mother_id||animal.father_external_name||animal.father_external_registry||animal.mother_external_name||animal.mother_external_registry);
}
function mgReadBreedingForm(){
 const data={};for(const [key,id] of Object.entries(mgBreedingIds))data[key]=document.getElementById(id).value;
 for(const parent of ['father','mother']){
  const mode=document.getElementById('a'+parent+'Source').value;
  if(mode==='herd'){
   if(!data[parent+'_id'])throw Error('Selecione '+(parent==='father'?'o pai':'a mãe')+' da fazenda.');
   data[parent+'_external_name']=null;data[parent+'_external_registry']=null;
  }else{
   data[parent+'_id']=null;
   if(mode==='external'){
    if(!data[parent+'_external_name'].trim()&&!data[parent+'_external_registry'].trim())throw Error('Informe o nome ou registro '+(parent==='father'?'do pai externo.':'da mãe externa.'));
   }else{data[parent+'_external_name']=null;data[parent+'_external_registry']=null;}
  }
 }
 const patch=MGAnimalBreeding.patch(data);MGAnimalBreeding.validateClassification({category:document.getElementById('acat').value,...patch});return patch;
}
function mgParentProfileHtml(animal,parent,linked){
 const externalName=animal[parent+'_external_name'],externalRegistry=animal[parent+'_external_registry'];
 if(linked){return `<button type="button" class="mg-parent-link" onclick="openAnimalProfile(${Number(linked.id)})">${mgEsc(mgAnimalLabel(linked))}</button>`;}
 if(animal[parent+'_id'])return 'Animal #'+Number(animal[parent+'_id']);
 if(externalName||externalRegistry)return mgEsc([externalName,externalRegistry?'Registro: '+externalRegistry:''].filter(Boolean).join(' · '))+' <small>(externo)</small>';
 return 'Não informado';
}
function mgRegistrationProfileHtml(animal){
 const labels={registry_association:'Associação',registry_series:'Série do criador',registry_birth:'RGN',registry_definitive:'RGD',registry_category:'Categoria do registro'};
 if(!Object.keys(labels).some(k=>animal[k]))return '';
 return `<div class="ap8-card mg-breeding-profile"><h4>Registro na associação</h4>${Object.entries(labels).map(([key,label])=>`<div class="ap8-row"><span>${label}</span><b>${mgEsc(animal[key]||'Não informado')}</b></div>`).join('')}<p class="mg-parent-notice">Dados informados pelo criador. Confirme a situação do registro na associação.</p></div>`;
}
