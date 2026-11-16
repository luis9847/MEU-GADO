const { chromium } = require('playwright');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

(async () => {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url,'http://local').pathname;
    const file = path.join(root, pathname === '/app' ? 'app.html' : pathname);
    try { res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(readFileSync(file)); }
    catch { res.statusCode=404; res.end(); }
  }).listen(0,'127.0.0.1');
  await new Promise(resolve => server.on('listening',resolve));
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader']});
  try {
    const page = await browser.newPage({viewport:{width:390,height:830},serviceWorkers:'block'});
    const errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',d=>d.accept());
    await page.route('https://**/*',r=>r.abort());
    await page.goto('http://127.0.0.1:'+server.address().port+'/app',{waitUntil:'load'});
    await page.waitForTimeout(1100);
    await page.evaluate(async()=>{
      mgFarmRole='owner';mgFarm={id:999,name:'Fazenda teste',city:'Varginha',state:'MG'};mgUser={id:'fixture-owner'};
      mgGetFarm=async()=>mgFarm;mgSession=async()=>mgUser;
      document.getElementById('mgTestLoginGate')?.remove();
      document.documentElement.classList.remove('mg-route-boot');
      const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const fixtures={
        farm_animal_sales:[{id:1,animal_number:'210',sale_date:now,amount:90,lot:'A'}],
        expenses:[{id:1,expense_date:now,amount:15,lot:'A'},{id:2,expense_date:'2024-06-01',amount:30,lot:'A'}],
        farm_management_tasks:[],animals:[{id:15,number:'321',name:'Estrela',category:'Vaca',lot:'A',status:'active'}],
        lots:[{id:7,name:'A',active:true}],health_events:[{id:9,animal_id:15,event_type:'Vacina',product:'Reforço',next_due_date:now}],reproductive_events:[]
      };
      mgSb.rpc=async()=>({data:{farm_id:999,plan:'complete',status:'active',server_now:new Date().toISOString(),features:{core:true,expenses:true,planning:true,performance:true,reports:true}},error:null});
      window.__weatherRequests=0;
      Object.defineProperty(mgSb,'functions',{value:{invoke:async()=>{window.__weatherRequests++;}}});
      mgReportRows=async (table,columns)=>{
        if(table==='health_events'&&columns.split(',').includes('lot'))throw Error('column health_events.lot does not exist');
        if(!Object.hasOwn(fixtures,table))throw Error('Unexpected dependency: '+table);
        return structuredClone(fixtures[table]);
      };
      mgSb.from=(table)=>{
        let write,insert=false,id;
        const q={update(p){write=p;return q},insert(p){write=p;insert=true;return q},eq(k,v){if(k==='id')id=v;return q},is(){return q},select(){return q},async maybeSingle(){
          if(insert)fixtures[table].push({...write,status:'pending'});
          else {const target=fixtures[table].find(x=>x.id===id);if(!target)return {data:null};Object.assign(target,write);}
          return {data:{id:id||write.id},error:null};
        }};
        return q;
      };
      api=async p=>p==='/api/expenses'?fixtures.expenses:[];
      loadAnimals=async()=>{animalsData=fixtures.animals;};
      loadLots=async()=>{lotsData=fixtures.lots;};
      await mgRefreshPlan(mgFarm,true);show('inicio');
    });
    assert.equal(await page.locator('#mgFarmWeather').count(),0);
    assert.equal(await page.evaluate(()=>window.__weatherRequests),0);
    await page.evaluate(()=>show('financeiroFazenda'));
    await page.locator('#mgFarmFinanceTotals').getByText('Resultado estimado').waitFor();
    assert.match(await page.locator('#mgFarmFinanceTotals').innerText(),/Resultado estimado\s+R\$\s*75,00/);
    await page.locator('#financeiroFazenda').getByRole('button',{name:'Vendas',exact:true}).click();
    await page.getByRole('button',{name:'Detalhar / receber'}).click();
    await page.locator('#mgFarmSaleForm input[name="buyer"]').fill('Comprador');
    await page.getByRole('button',{name:'Recebi hoje'}).click();
    await page.locator('#mgFarmSaleForm button[type="submit"]').click();
    await page.locator('#mgFarmFinanceRows').getByText('Recebida',{exact:true}).waitFor();
    await page.locator('#financeiroFazenda').getByRole('link',{name:'Gastos',exact:true}).click();
    await page.locator('#expenseRows').getByText(/15,00/).waitFor();
    assert.ok(await page.locator('#gastos #mgFarmExpenseStatus').isHidden());
    await page.locator('#gastos').getByRole('link',{name:'Resultado',exact:true}).click();
    await page.locator('#mgFarmFinanceTotals').getByText('Saldo de caixa').waitFor();
    assert.match(await page.locator('#mgFarmFinanceTotals').innerText(),/Saldo de caixa\s+R\$\s*75,00/);
    assert.equal(await page.locator('#mgFinanceHistoryRows tr').count(),2);
    assert.match(await page.locator('#mgFinanceHistoryRows').innerText(),/junho de 2024/);
    const cash=(row,i)=>row.locator('td').nth(i).innerText();
    assert.match(await cash(page.locator('#mgFinanceHistoryTotal'),2),/45,00/);
    assert.match(await cash(page.locator('#mgFinanceHistoryTotal'),4),/45,00/);
    await page.locator('#mgFinanceHistoryYear').selectOption('2024');
    assert.equal(await page.locator('#mgFinanceHistoryRows tr').count(),1);
    assert.match(await cash(page.locator('#mgFinanceHistoryTotal'),4),/-R\$\s*30,00/);
    assert.ok(await page.evaluate(()=>document.querySelector('.main').getBoundingClientRect().width<=window.innerWidth));
    await page.evaluate(()=>show('agendaManejo'));
    await page.locator('#agendaManejo').getByRole('link',{name:'Fornecimento'}).click();
    await page.locator('#nutricao.active').waitFor();
    await page.locator('#nutricao').getByRole('link',{name:'Agenda',exact:true}).click();
    await page.locator('#mgFarmAutoRows').getByText('Vacina · Reforço').waitFor();
    await page.getByRole('button',{name:'Nova tarefa'}).click();
    await page.locator('#mgFarmTaskForm [name="taskTitle"]').fill('Pesar Estrela');
    await page.locator('#mgFarmTaskForm [name="kind"]').selectOption('weight');
    await page.locator('#mgFarmTaskForm [name="animal"]').selectOption('15');
    await page.getByRole('button',{name:'Salvar tarefa'}).click();
    await page.locator('#mgFarmTaskRows').getByText('Pesar Estrela').waitFor();
    await page.getByRole('button',{name:'Abrir lançamento'}).click();
    await page.locator('#singleWeightModal.show').waitFor();
    assert.equal(await page.locator('#singleAnimal').inputValue(),'15');
    await page.evaluate(()=>closeModal('singleWeightModal'));
    await page.locator('#mgFarmTaskRows button[data-task-done]').click();
    await page.locator('#mgFarmTaskFilter').selectOption('done');
    await page.locator('#mgFarmTaskRows').getByText('Concluída',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log('PASS: mobile finance receipt and totals, reminders, new task with animal, prefilled weight, completed task, monthly history and year filter, weather disabled');
  } finally { await browser.close(); server.close(); }
})().catch(e=>{ console.error(e);process.exit(1); });
