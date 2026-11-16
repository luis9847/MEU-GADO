import {test} from 'node:test';
import assert from 'node:assert/strict';
import operations from '../farm-operations.js';
import {getForecast} from '../supabase/functions/farm-weather/forecast.mjs';

test('sale and receipt contribute to their respective periods, while canceled sales are excluded', () => {
  const sales = [
    {sale_date:'2026-10-12',received_on:'2026-11-03',amount:'1000.10',lot:'Lote A'},
    {sale_date:'2026-11-01',amount:'500.55',lot:'Lote A'},
    {sale_date:'2026-09-01',amount:'10.30',lot:''},
    {sale_date:'2026-11-01',amount:'999.99',cancelled_at:'2026-11-02'},
  ];
  const expenses = [{expense_date:'2026-11-03',amount:'100.99',lot:'Lote A'},{expense_date:'2026-11-03',amount:'30.10'}];
  const nov = operations.summarize(sales,expenses,'2026-11');
  assert.deepEqual(nov,{sold:50055,received:100010,spent:13109,pending:51085,result:36946,balance:86901,lots:[{label:'Lote A',sold:50055,received:100010,spent:10099},{label:'Sem lote',sold:0,received:0,spent:3010}]});
  assert.equal(operations.summarize(sales,expenses,'2026-10').received,0);
  assert.equal(operations.summarize(sales,expenses,'2026-10').sold,100010);
});

test('combined history sorts years and records sales and cash only in their own months', () => {
  const sales=[{sale_date:'2025-12-28',received_on:'2026-01-03',amount:'200.52'},
    {sale_date:'2026-01-02',amount:'50.15'}, {sale_date:'2024-10-21',amount:999,cancelled_at:'2024-10-22'}];
  const expenses=[{expense_date:'2025-12-30',amount:'30.99'},{expense_date:'2026-02-02',amount:'40.02'}];
  assert.deepEqual(operations.monthlyHistory(sales,expenses),[
    {month:'2026-02',sold:0,received:0,spent:4002,result:-4002,balance:-4002},
    {month:'2026-01',sold:5015,received:20052,spent:0,result:5015,balance:20052},
    {month:'2025-12',sold:20052,received:0,spent:3099,result:16953,balance:-3099}
  ]);
});

test('Climatempo uses the matching municipality and only publishes current sanitized forecast fields', async () => {
  const inputs = [];
  const result = await getForecast({city:'São Paulo',state:' sp ',token:'test-token',today:'2026-11-16',fetcher:async url=>{
    inputs.push(url);
    const day=(date,min,max,probability)=>({date,temperature:{min,max},rain:{probability}});
    return Response.json(inputs.length===1?[{id:99,name:'Sao Paulo',state:'RJ'},{id:3477,name:'São Paulo',state:'SP'}]:
      {id:3477,name:'São Paulo',state:'SP',meteogram:'private-with-token',data:[day('2026-11-15',20,30,45),day('2026-11-16',19,28,35),day('2026-11-17',30,20,5),day('2026-11-18',21,32,120)]});
  }});
  assert.equal(inputs[0].searchParams.get('name'),'São Paulo');
  assert.equal(inputs[1].pathname,'/api/v1/forecast/locale/3477/days/15');
  assert.deepEqual(result,{days:[{date:'2026-11-16',min:19,max:28,rain:35},{date:'2026-11-18',min:21,max:32,rain:null}]});
});

test('with no provider key or no exact match, the UI receives a real unavailable state', async () => {
  const fallback=await getForecast({city:'Varginha',state:'MG',fetcher:()=>assert.fail('no provider request without token')});
  assert.match(fallback.message,/não está disponível/);
  const missing=await getForecast({city:'Varginha',state:'MG',token:'dummy',fetcher:async()=>Response.json([{id:3,name:'Uberaba',state:'MG'}])});
  assert.match(missing.message,/não localizado/);
});

test('sale terms count calendar days across months and years without UTC or DST drift',()=>{
 assert.equal(operations.daysAfter('2026-12-20',15),'2027-01-04');
 assert.equal(operations.daysAfter('2028-02-20',10),'2028-03-01');
 assert.equal(operations.daysAfter('2026-11-16',0),'');
 assert.equal(operations.daysAfter('2026-11-16',1.5),'');
});
