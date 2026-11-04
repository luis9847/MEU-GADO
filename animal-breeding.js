/* Optional identification and direct parentage. No genetic evaluation or registry verification. */
(function(root){
 'use strict';
 const textFields={registry_association:80,registry_series:30,registry_birth:40,registry_definitive:40,registry_category:40,father_external_name:120,father_external_registry:80,mother_external_name:120,mother_external_registry:80};
 const roles={reprodutor:'Reprodutor',rufiao:'Rufião',matriz:'Matriz',doadora:'Doadora',receptora:'Receptora'};
 const conditions={inteiro:'Inteiro',castrado:'Castrado'};
 const female=category=>['Vaca','Novilha','Bezerra'].includes(category);
 function patch(data){
  const out={},has=key=>Object.prototype.hasOwnProperty.call(data,key);
  for(const [key,max] of Object.entries(textFields))if(has(key)){
   const value=data[key];if(value!=null&&typeof value!=='string')throw Error('Informe textos válidos nos dados de registro e filiação.');
   const text=value?.trim()||null;if(text&&Array.from(text).length>max)throw Error(`Um campo de registro ou filiação excede o limite de ${max} caracteres.`);out[key]=text;
  }
  for(const key of ['father_id','mother_id'])if(has(key)){
   const value=data[key];if(value==null||value==='')out[key]=null;
   else{if(!['number','string'].includes(typeof value))throw Error('Selecione um ascendente válido.');const id=Number(value);if(!Number.isSafeInteger(id)||id<=0)throw Error('Selecione um ascendente válido.');out[key]=id;}
  }
  for(const [key,values] of [['reproductive_role',roles],['male_condition',conditions]])if(has(key)){
   const value=data[key]||null;if(value&&!Object.prototype.hasOwnProperty.call(values,value))throw Error('Selecione uma classificação reprodutiva válida.');out[key]=value;
  }
  return out;
 }
 function validateClassification(animal){
  const isFemale=female(animal.category),role=animal.reproductive_role,condition=animal.male_condition;
  if((role||condition)&&!['Boi','Touro','Novilho','Bezerro','Vaca','Novilha','Bezerra'].includes(animal.category))throw Error('Selecione a categoria do animal antes da classificação reprodutiva.');
  if(isFemale&&condition)throw Error('A condição inteiro/castrado se aplica somente a machos.');
  if(role&&((['matriz','doadora','receptora'].includes(role))!==isFemale))throw Error('A função reprodutiva deve corresponder ao sexo do animal.');
  if(condition==='castrado'&&(animal.category==='Touro'||['reprodutor','rufiao'].includes(role)))throw Error('Um macho castrado não pode ser classificado como touro, reprodutor ou rufião.');
 }
 function search(animal){return [animal.registry_association,animal.registry_series,animal.registry_birth,animal.registry_definitive].filter(Boolean).join(' ');}
 const api={textFields,roles,conditions,female,patch,validateClassification,search};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MGAnimalBreeding=api;
})(typeof window==='undefined'?globalThis:window);
