import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const apiSource=html.slice(html.indexOf('async function api('),html.indexOf('function setMessage('));
function register(response){
 const context=vm.createContext({mgSb:{auth:{signUp:async()=>response}},Error,JSON});
 vm.runInContext(apiSource,context);
 return context.api('/api/register',{body:JSON.stringify({email:'test@example.invalid',password:'unused'})});
}
test('existing confirmed email with obfuscated response stops registration',async()=>{
 await assert.rejects(register({data:{user:{identities:[]},session:null},error:null}),/e-mail já está cadastrado/);
});
test('explicit existing email errors give recovery instructions',async()=>{
 for(const code of ['user_already_exists','email_exists'])await assert.rejects(register({error:{code,message:'existing user'}}),/Esqueci minha senha/);
});
test('new unconfirmed email still receives confirmation flow',async()=>{
 const result=await register({data:{user:{identities:[{provider:'email'}]},session:null},error:null});
 assert.equal(result.needs_confirmation,true);
});
test('immediate session continues to onboarding',async()=>{
 const result=await register({data:{user:{identities:[{provider:'email'}]},session:{access_token:'fixture'}},error:null});
 assert.equal(result.needs_confirmation,false);assert.equal(result.needs_onboarding,true);
});
test('captcha failure remains distinct from duplicate email',async()=>{
 await assert.rejects(register({error:{code:'captcha_failed'}}),/verificação de segurança/);
});
test('confirmation notice survives changing tabs',async()=>{
 const start=html.indexOf('async function doRegister()');
 const source=html.slice(start,html.indexOf('async function setupAdmin()',start));
 const fields={regPassword:{value:'Password!123'},regPasswordConfirm:{value:'Password!123'},regName:{value:'Test'},regDoc:{value:'98765432101'},regEmail:{value:'test@example.invalid'},regPhone:{value:'31999999999'},legalAcceptance:{checked:true},loginEmail:{value:''}};
 let message='';
 const context=vm.createContext({document:{getElementById:id=>fields[id]},setMessage:text=>{message=text},switchTab:()=>{message=''},mgRequireCaptcha:()=> 'fixture',mgResetCaptcha:()=>{},validateStrongPassword:()=>'',api:async()=>({needs_confirmation:true}),Date,JSON,Error});
 vm.runInContext(source,context);await context.doRegister();
 assert.match(message,/confirmar seu e-mail/);assert.equal(fields.loginEmail.value,'test@example.invalid');
});
