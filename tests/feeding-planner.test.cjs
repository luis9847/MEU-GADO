const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../feeding-planner-core.js');
test('daily ration scales to lot, equal meals and month without changing per-head amount',()=>{
 const r=C.calculate([{kg_head_day:15,price_kg:.3,dry_matter_pct:35},{kg_head_day:3,price_kg:2,dry_matter_pct:90}],10,2);
 assert.equal(r.kg_day,180);assert.equal(r.lines[0].kg_meal,75);assert.equal(r.lines[1].kg_period,900);assert.equal(r.cost_day,105);assert.equal(r.cost_period,3150);assert.equal(r.dm_head,7.95);
});
test('missing price/composition remains unknown rather than zero',()=>{
 const r=C.calculate([{kg_head_day:1,price_kg:null,dry_matter_pct:null}],8,3);
 assert.equal(r.cost_day,null);assert.equal(r.cost_head,null);assert.equal(r.dm_head,null);
 assert.equal(C.calculate([{kg_head_day:1,price_kg:0}],8,3).cost_day,0);
});
test('lot excludes inactive/deleted animals and distinguishes unknown weights',()=>{
 const s=C.lotSummary([{status:'active',lot:'A',current_weight:400,last_weighing_date:'2026-10-01'},{status:'active',lot:'A',current_weight:null},{status:'sold',lot:'A',current_weight:500},{status:'active',lot:'B',current_weight:300},{status:'active',lot:'A',current_weight:300,deleted_at:'2026-10-02'}],'A');
 assert.deepEqual(s,{heads:2,weighed:1,avg_weight:400,oldest_date:'2026-10-01'});
});
test('empty lot, finite stock projection and validity boundaries',()=>{
 assert.equal(C.calculate([{kg_head_day:2,price_kg:1}],0,2).kg_day,0);
 assert.equal(C.stockDays(100,20),5);assert.equal(C.stockDays(null,20),null);assert.equal(C.stockDays(0,20),0);assert.equal(C.stockDays(10,0),null);
 const p={start_date:'2026-10-17',end_date:'2026-10-20',archived:false};
 assert.equal(C.activeOn(p,'2026-10-17'),true);assert.equal(C.activeOn(p,'2026-10-21'),false);assert.equal(C.activeOn({...p,archived:true},'2026-10-17'),false);
});
test('reject invalid quantities and treat changed animal count dynamically',()=>{
 for(const qty of [0,-1,Infinity,NaN,1001])assert.throws(()=>C.calculate([{kg_head_day:qty}],10,2));
 assert.throws(()=>C.calculate([{kg_head_day:1}],10,0));assert.throws(()=>C.calculate([{kg_head_day:1}],-1,2));
 assert.equal(C.calculate([{kg_head_day:.125,price_kg:10}],12,3).kg_day,1.5);
 assert.equal(C.calculate([{kg_head_day:.125,price_kg:10}],20,3).kg_day,2.5);
});
