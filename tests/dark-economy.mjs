import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const read = file => readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const modules = new Map();
const fakeStorage = new Map();
const window = {localStorage:{getItem:key=>fakeStorage.get(key)??null,setItem:(key,value)=>fakeStorage.set(key,value)}};
const src = ts.transpileModule(read('src/storage/player-data.ts'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const output={exports:{}};
const importer = id => {
  if(id==='firebase/firestore')return {doc:()=>{},getDoc:()=>{},setDoc:()=>{},runTransaction:()=>{throw Error('Unexpected Firestore')}};
  if(id==='./firebase')return {isFirebaseConfigured:false,getFirebaseDb:()=>null};
  throw Error(`Unexpected import: ${id}`);
};
new Function('require','module','exports','window',src)(importer,output,output.exports,window);
const economy=output.exports;

test('earlier wallet survives additive economic schema',async()=>{
  const prior=economy.sanitizeVirtualWallet({balance:1888,transactions:[{id:'old',kind:'gift',amount:100,createdAt:1,label:'Кофе',characterId:'alexandra_v1'}]});
  assert.equal(prior.balance,1888);
  assert.deepEqual(prior.companions,{});
  assert.equal(prior.transactions.length,1);
});

test('player can top up prototype balance exactly once',async()=>{
  const id='topup_11111111-1111-4111-8111-111111111111';
  assert.equal((await economy.loadVirtualWallet(null)).balance,3000);
  assert.equal((await economy.addVirtualMoney(null,1000,id)).balance,4000);
  assert.equal((await economy.addVirtualMoney(null,1000,id)).balance,4000);
  await assert.rejects(()=>economy.addVirtualMoney(null,1000001,'topup_22222222-2222-4222-8222-222222222222'));
});

test('two salary-thousand-dollar transfer is significant, debits once and credits companion',async()=>{
  const event={id:'economy_33333333-3333-4333-8333-333333333333',kind:'transfer',characterId:'alexandra_v1',label:'Денежный перевод',amount:2000,createdAt:Date.UTC(2026,9,20)};
  const result=await economy.spendVirtualCurrency(null,event);
  assert.equal(result.balance,2000);
  assert.equal(result.companions.alexandra_v1.balance,2000);
  assert.equal(result.companions.alexandra_v1.receivedTotal,2000);
  assert.equal(result.companions.alexandra_v1.notableEvents.length,1);
  assert.equal((await economy.spendVirtualCurrency(null,event)).balance,2000);
  assert.equal(economy.economicSignificance(2000),'life_changing');
  assert.match(economy.encodeEconomyEvent(event),/^\[GAME2:ECONOMY:1\]/);
  assert.equal(economy.decodeEconomyEvent(economy.encodeEconomyEvent(event)).amount,2000);
  assert.equal(economy.decodeEconomyEvent('Я отправил тебе деньги'),null);
  assert.match(economy.economyEventContext(event),/Средняя месячная зарплата.*\$2,000/);
  assert.match(await economy.loadCompanionEconomicContext(null,'alexandra_v1'),/2,000/);
});

test('gifts do not add cash, and expenses are once daily and bounded',async()=>{
  const event={id:'economy_44444444-4444-4444-8444-444444444444',kind:'gift',characterId:'alexandra_v1',label:'Книга',amount:650,createdAt:Date.UTC(2026,9,20)};
  const afterGift=await economy.spendVirtualCurrency(null,event);
  assert.equal(afterGift.balance,1350);
  assert.equal(afterGift.companions.alexandra_v1.balance,2000);
  assert.equal(afterGift.companions.alexandra_v1.gifts.length,1);
  const next=await economy.advanceCompanionExpenses(null,'alexandra_v1',Date.UTC(2026,9,21));
  assert.ok(next.companions.alexandra_v1.balance<2000);
  assert.equal(next.companions.alexandra_v1.expenses.length,1);
  const again=await economy.advanceCompanionExpenses(null,'alexandra_v1',Date.UTC(2026,9,21,23));
  assert.equal(again.companions.alexandra_v1.balance,next.companions.alexandra_v1.balance);
  assert.equal(again.companions.alexandra_v1.expenses.length,1);
});

test('different characters have separate balances and significant memories',async()=>{
 const event={id:'economy_55555555-5555-4555-8555-555555555555',kind:'transfer',characterId:'new_character_v1',label:'Денежный перевод',amount:500,createdAt:Date.UTC(2026,9,21)};
 const next=await economy.spendVirtualCurrency(null,event);
 assert.equal(next.companions.new_character_v1.balance,500);
 assert.notEqual(next.companions.alexandra_v1.balance,500);
 assert.equal(next.companions.new_character_v1.notableEvents.length,1);
});

test('economic event UI does not present the technical content as normal bubble text',()=>{
 const app=read('src/App.tsx'),chat=read('src/ui/ChatScreen.tsx');
 assert.match(app,/sendEconomyEvent\(event\)/);
 assert.doesNotMatch(app,/я перевёл тебе.*игровых монет/u);
 assert.match(chat,/FinanceEventCard/);
 assert.match(read('src/ui/FinanceEventCard.tsx'),/game2-finance-illustration/);
 assert.match(read('src/alexandra.css'),/--dark-bg:#07080a/);
});

test('syntax parse entire TypeScript and TSX tree',()=>{
  const scan=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(i=>i.isDirectory()?scan(join(dir,i.name)):[join(dir,i.name)]);
  const files=scan(new URL('../src/',import.meta.url).pathname).filter(f=>/\.tsx?$/.test(f));
  for(const file of files){
   const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
   assert.deepEqual(source.parseDiagnostics.map(x=>ts.flattenDiagnosticMessageText(x.messageText,'\n')),[],file);
  }
  assert.ok(files.length>=60);
});
