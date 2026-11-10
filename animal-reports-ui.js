/* Report filter options are loaded through the existing account-scoped API/cache. */
function mgReportFilters(){return {start:document.getElementById('reportStartDate')?.value||'',end:document.getElementById('reportEndDate')?.value||'',activity:document.getElementById('reportActivity')?.value||'',breed:document.getElementById('reportBreed')?.value||'',lot:document.getElementById('reportLot')?.value||'',category:document.getElementById('reportCategory')?.value||''};}
function mgClearAnimalReportFilters(){for(const id of ['reportActivity','reportBreed','reportLot','reportCategory'])document.getElementById(id).value='';}
function mgFillReportBreedFilter(rows){
 const select=document.getElementById('reportBreed'),previous=select.value;
 // Use the registration catalog directly, excluding temporary options for an edited animal.
 const catalog=new Map(Array.from(document.getElementById('abreed').options).filter(o=>o.value&&!o.hasAttribute('data-saved-breed')).map(o=>[o.value,o.text]));
 const saved=[...new Set(rows.map(a=>a.breed).filter(value=>value&&!catalog.has(value)))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 select.replaceChildren(new Option('Todas as raças',''),new Option('Raça não informada',MGAnimalReports.missing));
 for(const [value,label] of [...catalog].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')))select.add(new Option(label,value));
 if(saved.length){
  const group=document.createElement('optgroup');group.label='Raças cadastradas fora da lista padrão';
  for(const value of saved)group.append(new Option(value,value));
  select.append(group);
 }
 select.value=Array.from(select.options).some(o=>o.value===previous)?previous:'';
}
async function mgInitReportFilters(){
 const note=document.getElementById('reportFiltersStatus');if(!note)return;
 note.textContent='Carregando opções de filtros…';
 try{
  const rows=(await api('/api/animals/report-context')).filter(a=>!a.deleted_at);
  mgFillReportBreedFilter(rows);
  for(const [id,key,empty,missing] of [['reportLot','lot','Todos os lotes','Sem lote'],['reportCategory','category','Todas as categorias',null]]){
   const select=document.getElementById(id),value=select.value,values=[...new Set(rows.map(a=>a[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
   select.replaceChildren(new Option(empty,''));if(missing)select.add(new Option(missing,MGAnimalReports.missing));
   for(const item of values)select.add(new Option(item,item));
   if(value&&!Array.from(select.options).some(o=>o.value===value))select.add(new Option(value,value));select.value=value;
  }
  note.textContent=navigator.onLine?'Opções atualizadas.':'Usando as opções carregadas anteriormente neste aparelho.';
 }catch{note.textContent='Não foi possível atualizar as opções. Conecte-se e clique em Atualizar filtros.';}
}
