/* Report filter options are loaded through the existing account-scoped API/cache. */
function mgReportFilters(){return {start:document.getElementById('reportStartDate')?.value||'',end:document.getElementById('reportEndDate')?.value||'',activity:document.getElementById('reportActivity')?.value||'',breed:document.getElementById('reportBreed')?.value||'',lot:document.getElementById('reportLot')?.value||'',category:document.getElementById('reportCategory')?.value||''};}
function mgClearAnimalReportFilters(){for(const id of ['reportActivity','reportBreed','reportLot','reportCategory'])document.getElementById(id).value='';}
async function mgInitReportFilters(){
 const note=document.getElementById('reportFiltersStatus');if(!note)return;
 note.textContent='Carregando opções de filtros…';
 try{
  const rows=(await api('/api/animals/report-context')).filter(a=>!a.deleted_at);
  for(const [id,key,empty,missing] of [['reportBreed','breed','Todas as raças','Raça não informada'],['reportLot','lot','Todos os lotes','Sem lote'],['reportCategory','category','Todas as categorias',null]]){
   const select=document.getElementById(id),value=select.value,values=[...new Set(rows.map(a=>a[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
   select.replaceChildren(new Option(empty,''));if(missing)select.add(new Option(missing,MGAnimalReports.missing));
   for(const item of values)select.add(new Option(item,item));
   if(value&&!Array.from(select.options).some(o=>o.value===value))select.add(new Option(value,value));select.value=value;
  }
  note.textContent=navigator.onLine?'Opções atualizadas.':'Usando as opções carregadas anteriormente neste aparelho.';
 }catch{note.textContent='Não foi possível atualizar as opções. Conecte-se e clique em Atualizar filtros.';}
}
