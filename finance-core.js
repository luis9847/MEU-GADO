(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MGFinanceCore=api;})(globalThis,function(){
 const monthFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'});
 const cents=v=>{const n=Number(v);if(!Number.isFinite(n)||n<0)throw Error('Valor financeiro inválido.');return Math.round(n*100);};
 function month(value){if(!value||!Number.isFinite(Date.parse(value)))return null;const p=monthFormat.formatToParts(new Date(value));return p.find(x=>x.type==='year').value+'-'+p.find(x=>x.type==='month').value;}
 function shift(value,by){const [y,m]=value.split('-').map(Number),d=new Date(Date.UTC(y,m-1+by,1));return d.toISOString().slice(0,7);}
 const pending=new Set(['pending','in_process','authorized','in_mediation']);
 const labels={approved:'Aprovado',pending:'Pendente',in_process:'Em processamento',authorized:'Em autorização',in_mediation:'Em contestação',rejected:'Recusado',cancelled:'Cancelado',canceled:'Cancelado',refunded:'Estornado',charged_back:'Chargeback'};
 function build(data,selected,now=new Date()){
  const current=month(now.toISOString());selected=selected||current;if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(selected))throw Error('Mês inválido.');
  const contracts=new Map(data.contracts.map(x=>[String(x.id),x])),farms=new Map(data.farms.map(x=>[String(x.id),x.name]));
  const seen=new Set(),rows=[];
  for(const p of data.payments){
   if(seen.has(String(p.payment_id)))throw Error('Pagamento duplicado. Atualize o financeiro.');seen.add(String(p.payment_id));
   const c=contracts.get(String(p.contract_id));if(!c)throw Error('Pagamento sem assinatura. Atualize o financeiro.');
   const amount=cents(p.amount),refund=cents(p.refunded_amount??0);if(refund>amount)throw Error('Estorno incompatível com o pagamento.');
   const approved=!!p.approved_at,wasPaid=approved&&['approved','refunded','charged_back'].includes(p.status);
   const gross=wasPaid?amount:0,adjustment=wasPaid?(['refunded','charged_back'].includes(p.status)?amount:refund):0;
   const group=p.status==='approved'?(refund?'adjusted':'paid'):['refunded','charged_back'].includes(p.status)?'adjusted':pending.has(p.status)?'pending':'other';
   const stamp=p.approved_at||p.observed_at;
   if(!month(stamp))throw Error('Pagamento sem data válida.');
   rows.push({...p,farm:farms.get(String(c.farm_id))||'Fazenda '+c.farm_id,plan:c.plan,period:c.billing_period,month:month(stamp),stamp,amount,gross,adjustment,retained:gross-adjustment,group,label:p.status==='approved'&&refund?'Aprovado · estorno parcial':labels[p.status]||'Outra situação'});
  }
  rows.sort((a,b)=>Date.parse(b.stamp)-Date.parse(a.stamp)||String(b.payment_id).localeCompare(String(a.payment_id)));
  const selectedRows=rows.filter(x=>x.month===selected),sum=(rs,key)=>rs.reduce((n,r)=>n+r[key],0);
  const forecast=data.contracts.filter(c=>c.status==='authorized'&&!c.review_reason&&Date.parse(c.paid_until)>now.getTime()&&Date.parse(c.paid_until)<=now.getTime()+30*86400000).map(c=>({...c,farm:farms.get(String(c.farm_id))||'Fazenda '+c.farm_id,forecast_amount:cents(c.amount)})).sort((a,b)=>Date.parse(a.paid_until)-Date.parse(b.paid_until));
  const attention=data.contracts.filter(c=>c.review_reason||['creating','creation_unknown','pending','paused'].includes(c.status)||(c.status==='authorized'&&(!c.paid_until||Date.parse(c.paid_until)<=now.getTime()))).map(c=>({...c,farm:farms.get(String(c.farm_id))||'Fazenda '+c.farm_id,label:c.review_reason?'Exige conferência':c.status==='paused'?'Renovação pausada':c.status==='authorized'?'Sem período pago vigente':c.status==='pending'?'Checkout aguardando autorização':'Criação aguardando confirmação'}));
  const history=Array.from({length:12},(_,i)=>{const m=shift(selected,-i),rs=rows.filter(x=>x.month===m);return {month:m,gross:sum(rs,'gross'),adjustment:sum(rs,'adjustment'),retained:sum(rs,'retained'),count:rs.filter(x=>x.gross>0).length};});
  const months=[...new Set([current,selected,...rows.map(r=>r.month),...Array.from({length:12},(_,i)=>shift(current,-i))])].sort().reverse();
  return {rows,selectedRows,history,months,forecast,attention,summary:{gross:sum(selectedRows,'gross'),adjustment:sum(selectedRows,'adjustment'),retained:sum(selectedRows,'retained'),paidCount:selectedRows.filter(x=>x.retained>0).length,pending:sum(selectedRows.filter(x=>x.group==='pending'),'amount'),pendingCount:selectedRows.filter(x=>x.group==='pending').length,forecast:sum(forecast,'forecast_amount')}};
 }
 function csv(rows){const cell=v=>'"'+String(typeof v==='string'&&/^[\s]*[=+@\-\t\r]/.test(v)?"'"+v:v??'').replace(/"/g,'""')+'"';const money=c=>(c/100).toFixed(2).replace('.',',');return '\ufeff'+[['Data de aprovação ou registro (São Paulo)','Fazenda','Plano','Período','Pagamento','Situação','Valor','Aprovado bruto','Estornos e chargebacks','Após estornos (antes das taxas)'],...rows.map(r=>[new Date(r.stamp).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),r.farm,r.plan==='complete'?'Completo':'Essencial',r.period==='annual'?'Anual':'Mensal',String(r.payment_id),r.label,money(r.amount),money(r.gross),money(r.adjustment),money(r.retained)])].map(r=>r.map(cell).join(';')).join('\r\n');}
 return {build,month,shift,csv};
});
