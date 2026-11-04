const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../animal-breeding.js');
test('older payloads do not clear registry, role or parentage fields',()=>assert.deepEqual(C.patch({number:'12',name:'Animal'}),{}));
test('optional registry values trim, clear and retain independent identities',()=>assert.deepEqual(C.patch({registry_series:' MG ',registry_birth:' 001 ',registry_definitive:'',registry_association:null}),{registry_series:'MG',registry_birth:'001',registry_definitive:null,registry_association:null}));
test('identifiers, text types, enum values and Unicode lengths are checked',()=>{
 for(const data of [{father_id:true},{father_id:-1},{mother_id:'1.2'},{father_id:'1e30'},{registry_birth:{}},{registry_association:'a'.repeat(81)},{male_condition:'other'},{reproductive_role:'other'}])assert.throws(()=>C.patch(data));
 assert.equal(C.patch({father_external_name:'Á'.repeat(120),father_id:'12'}).father_id,12);assert.throws(()=>C.patch({father_external_name:'Á'.repeat(121)}));
});
test('sex and castration agree with reproductive roles',()=>{
 for(const category of ['Vaca','Novilha','Bezerra']){assert.doesNotThrow(()=>C.validateClassification({category,reproductive_role:'matriz'}));assert.throws(()=>C.validateClassification({category,male_condition:'inteiro'}));assert.throws(()=>C.validateClassification({category,reproductive_role:'reprodutor'}));}
 assert.doesNotThrow(()=>C.validateClassification({category:'Touro',male_condition:'inteiro',reproductive_role:'reprodutor'}));
 assert.throws(()=>C.validateClassification({category:'Touro',male_condition:'castrado'}));assert.throws(()=>C.validateClassification({category:'Boi',male_condition:'castrado',reproductive_role:'rufiao'}));
 assert.doesNotThrow(()=>C.validateClassification({category:'Boi',male_condition:'castrado'}));assert.throws(()=>C.validateClassification({category:null,reproductive_role:'reprodutor'}));
});
test('registry identifiers become searchable without creating animals',()=>assert.equal(C.search({registry_series:'MG',registry_birth:'001',registry_definitive:'002'}),'MG 001 002'));
