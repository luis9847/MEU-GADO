const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../animal-birth-checklist.js');
test('birth care has four independent items and only calf categories start the form',()=>{
 assert.equal(C.isCalf('Bezerro'),true);assert.equal(C.isCalf('Bezerra'),true);assert.equal(C.isCalf('Novilha'),false);
 assert.deepEqual(C.progress(null),{done:0,total:4});assert.deepEqual(C.progress({colostro:true,umbigo:true,brinco:false,peso:false}),{done:2,total:4});
});
test('old clients preserve stored care; an explicit uncheck is persisted',()=>{
 assert.deepEqual(C.patch({notes:'changed'}),{});
 assert.deepEqual(C.patch({birth_checklist:{colostro:true,peso:false}}),{birth_checklist:{colostro:true,peso:false}});
 assert.deepEqual(C.patch({birth_checklist:null}),{birth_checklist:null});
});
test('invalid values and matrix-only items never enter the calf checklist',()=>{
 for(const value of [true,[],42,'true',{colostro:'true'},{peso:1},{vaca:true},{sem_cria_viva:true}])assert.throws(()=>C.patch({birth_checklist:value}),/inválido/);
});
