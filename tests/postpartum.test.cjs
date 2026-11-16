const {test}=require('node:test'),assert=require('node:assert/strict');
const {progress,birthAlerts}=require('../postpartum.js');
test('new partos have six checks; a birth without a live calf only requires matrix checks',()=>{
 assert.deepEqual(progress(null),{done:0,total:6});
 assert.deepEqual(progress({vaca:true,colostro:true}),{done:2,total:6});
 assert.deepEqual(progress({vaca:true,placenta:true,sem_cria_viva:true}),{done:2,total:2});
});
test('only recent and active incomplete partos produce a checklist notification',()=>{
 const birth={event_type:'Parto',event_date:'2026-11-13',animal_id:1};
 const events=[{...birth,id:2},{...birth,id:3,event_date:'2026-11-01'},{...birth,id:4,event_type:'Aborto'},
 {...birth,id:5,postpartum_checklist:{vaca:true,placenta:true,sem_cria_viva:true}},{...birth,id:6,animal_id:2},{...birth,id:7,deleted_at:'2026-11-14'},
 {...birth,id:8,event_date:'2026-11-20'}];
 assert.deepEqual(birthAlerts(events,[{id:1,number:'321'}],'2026-11-16').map(a=>[a.id,a.repro_event_id]),[['postpartum-2',2]]);
});
