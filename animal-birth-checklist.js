/* Birth care belongs to each calf; it does not mark the mother's postpartum event. */
(function(root){
 'use strict';
 const items={colostro:'Mamada do colostro confirmada',umbigo:'Cuidados com o umbigo registrados',brinco:'Brinco ou identificação registrados',peso:'Peso ao nascimento registrado'};
 const isCalf=category=>['Bezerro','Bezerra'].includes(category);
 function patch(data){
  if(!Object.hasOwn(data,'birth_checklist'))return {};
  const value=data.birth_checklist;
  if(value===null)return {birth_checklist:null};
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.entries(value).some(([k,v])=>!Object.hasOwn(items,k)||typeof v!=='boolean'))throw Error('Checklist de nascimento inválido.');
  return {birth_checklist:Object.fromEntries(Object.keys(items).filter(k=>Object.hasOwn(value,k)).map(k=>[k,value[k]]))};
 }
 const progress=value=>({done:Object.keys(items).filter(k=>value?.[k]===true).length,total:4});
 const core={items,isCalf,patch,progress};
 if(typeof module==='object'&&module.exports){module.exports=core;return;}
 root.MGBirthChecklist=core;
 let section=null,hasHistory=false;
 const byId=id=>document.getElementById(id);
 function ensure(){
  if(section)return;
  const anchor=byId('abirth')?.closest('label');if(!anchor)return;
  section=document.createElement('section');section.id='mgAnimalBirthChecklist';section.className='mg-birth-checklist';section.setAttribute('aria-labelledby','mgBirthTitle');
  section.innerHTML='<h4 id="mgBirthTitle">Checklist de nascimento <small>opcional</small></h4><p>Ao cadastrar um bezerro ou uma bezerra recém-nascidos, marque somente os cuidados já conferidos. Você pode completar depois em Editar animal.</p><div>'+Object.entries(items).map(([key,label])=>'<label><input id="mgBirth_'+key+'" type="checkbox"><span>'+label+'</span></label>').join('')+'</div><p id="mgBirthProgress" role="status"></p>';
  anchor.after(section);section.addEventListener('change',sync);
 }
 function sync(){
  ensure();if(!section)return;
  section.hidden=!isCalf(byId('acat')?.value)&&!hasHistory;
  const {done,total}=progress(Object.fromEntries(Object.keys(items).map(k=>[k,byId('mgBirth_'+k).checked])));
  byId('mgBirthProgress').textContent=done===total?'Checklist concluído':done+' de '+total+' cuidados conferidos';
 }
 function fill(animal={}){
  ensure();if(!section)return;
  hasHistory=animal.birth_checklist!=null;
  Object.keys(items).forEach(k=>{byId('mgBirth_'+k).checked=animal.birth_checklist?.[k]===true;});sync();
 }
 function read(){
  if(!section||section.hidden)return {};
  return patch({birth_checklist:Object.fromEntries(Object.keys(items).map(k=>[k,byId('mgBirth_'+k).checked]))});
 }
 function profile(animal){
  if(animal.birth_checklist==null)return '';
  const {done,total}=progress(animal.birth_checklist);
  return '<div class="ap8-row"><span>Checklist de nascimento</span><b>'+done+' de '+total+' cuidados conferidos</b></div>';
 }
 Object.assign(core,{fill,read,sync,profile});
})(typeof window==='undefined'?globalThis:window);
