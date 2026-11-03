/* Commercial access rules. Authoritative admission is enforced by Postgres. */
(function(root){
 'use strict';
 const plans={essential:{name:'Essencial',monthly:90,annual:900,limit:150},complete:{name:'Completo',monthly:130,annual:1440,limit:null}};
 const views={gastos:'expenses',planejamento:'planning',desempenho:'performance',relatorios:'reports',saleSimulator:'performance'};
 function writable(s,now=Date.now()){
  if(!s||!['active','trial','legacy'].includes(s.status))return false;
  return !s.expires_at||(Number.isFinite(Date.parse(s.expires_at))&&Date.parse(s.expires_at)>now);
 }
 function feature(s,key){return !!s?.features?.[key];}
 function label(s,now=Date.now()){
  if(!s)return 'Acesso não consultado';
  if(s.expires_at&&Date.parse(s.expires_at)<=now&&['active','trial'].includes(s.status))return 'Validade encerrada';
  return {pending:'Aguardando liberação',active:'Assinatura liberada',trial:'Teste gratuito',legacy:'Acesso anterior — configurar',suspended:'Acesso suspenso'}[s.status]||'Acesso não configurado';
 }
 function admission(s,heads,now=Date.now()){
  if(!writable(s,now))return 'Seu acesso precisa ser liberado ou renovado pelo administrador. Seus dados estão preservados.';
  if(s.plan==='essential'&&heads>=150)return 'O Essencial permite até 150 animais ativos. Solicite o plano Completo.';
  return '';
 }
 function localEndOfDay(value){
  if(!value)return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Data inválida.');
  const [y,m,d]=value.split('-').map(Number),date=new Date(y,m-1,d,23,59,59,999);
  if(date.getFullYear()!==y||date.getMonth()!==m-1||date.getDate()!==d)throw new Error('Data inválida.');
  return date.toISOString();
 }
 const api={plans,views,writable,feature,label,admission,localEndOfDay};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.MGPlansCore=api;
})(typeof window==='undefined'?globalThis:window);
