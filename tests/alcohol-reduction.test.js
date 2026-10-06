'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const indexSource=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const makeContext=()=>({console,navigator:{standalone:false},matchMedia:()=>({matches:false}),document:{documentElement:{classList:{toggle(){}}}},crypto:{randomUUID:null},window:{},setTimeout,clearTimeout,setInterval,clearInterval,Date,Math,Number,String,Array,Map,Object});
const context=makeContext();
vm.createContext(context);
vm.runInContext(source.slice(0,source.indexOf('function renderToday')),context);
const at=(y,m,d,h=0,mi=0)=>new Date(y,m-1,d,h,mi).getTime();
const event=(t,date,abv=40,volumeMl=250)=>({t,localDate:date,abv,volumeMl});
const DAY=864e5;

test('累计减少基准为5540.75g/年和约15.18g/天',()=>{
  const year=vm.runInContext('ALCOHOL_BASELINE_YEAR_G',context),day=vm.runInContext('ALCOHOL_BASELINE_DAY_G',context);
  assert.equal(year,5540.75);
  assert.ok(Math.abs(day-5540.75/365)<1e-12);
});

test('完整一年不饮酒可按公式换算约5540.75g、26.5斤和298.8罐',()=>{
  const start=at(2025,10,5),now=start+365*DAY,stats=context.getAlcoholReductionStats([],now,start);
  assert.equal(stats.tracking,true);
  assert.ok(Math.abs(stats.baselineExpectedG-5540.75)<1e-9);
  assert.equal(stats.actualG,0);
  assert.ok(Math.abs(stats.deltaG-5540.75)<1e-9);
  assert.ok(Math.abs(stats.baijiu53Jin-5540.75/209.085)<1e-9);
  assert.ok(Math.abs(stats.beer47Cans-5540.75/18.5415)<1e-9);
  assert.equal(stats.baijiu53Jin.toFixed(1),'26.5');
  assert.equal(stats.beer47Cans.toFixed(1),'298.8');
});

test('啤酒每罐500mL，累计成果按罐渲染并保留白酒斤数',()=>{
  const perCan=vm.runInContext('BEER_47_G_PER_CAN',context);
  assert.ok(Math.abs(perCan-500*.047*.789)<1e-12);
  assert.ok(Math.abs(perCan-18.5415)<1e-9);
  const elements=Object.fromEntries(['alcoholReductionTitle','alcoholReductionSummary','alcoholReductionEquivalent'].map(id=>['#'+id,{}]));
  context.document.querySelector=selector=>elements[selector];
  const start=at(2025,10,5),stats=context.getAlcoholReductionStats([],start+365*DAY,start);
  context.renderAlcoholReduction(stats);
  assert.equal(elements['#alcoholReductionTitle'].textContent,'累计少喝 5.54kg 纯酒精');
  assert.equal(elements['#alcoholReductionEquivalent'].innerHTML,'<span>≈ 26.5斤 53度白酒</span><span>或约 298.8罐 4.7度啤酒</span>');
});

test('部分减少与超过历史基准均不伪装成少喝0g',()=>{
  const start=at(2026,10,1),elapsed=1000/(5540.75/365)*DAY,now=start+elapsed,actual=event(start+DAY,'2026-10-02',10,3800),partial=context.getAlcoholReductionStats([actual],now,start);
  assert.ok(Math.abs(partial.deltaG-(1000-299.82))<1e-6);
  const overNow=start+500/(5540.75/365)*DAY,over=context.getAlcoholReductionStats(Array.from({length:7},(_,i)=>event(start+(i+1)*DAY,`2026-10-${String(2+i).padStart(2,'0')}`,40,250)),overNow,start);
  assert.ok(over.deltaG<0);
});

test('起算前事件不计入，起算后补记计入，删除后可重算',()=>{
  const start=at(2026,10,4),now=at(2026,10,10,12),before=event(at(2026,10,1),'2026-10-01'),after=event(at(2026,10,5),'2026-10-05'),withAfter=context.getAlcoholReductionStats([before,after],now,start),withoutAfter=context.getAlcoholReductionStats([before],now,start);
  assert.equal(withAfter.actualG,78.9);
  assert.equal(withoutAfter.actualG,0);
  assert.ok(withoutAfter.deltaG>withAfter.deltaG);
});

test('未开始追踪时不显示虚假的累计减少成果',()=>{
  const stats=context.getAlcoholReductionStats([],Date.now(),null);
  assert.equal(stats.tracking,false);
  assert.equal(stats.deltaG,0);
});

test('模块位于饮酒操作之后且不引入禁止文案',()=>{
  assert.ok(indexSource.indexOf('id="alcoholRecord"')<indexSource.indexOf('class="alcohol-reduction"'));
  assert.match(indexSource,/<section class="alcohol-reduction"><header><div><span class="card-kicker">累计成果<\/span>/);
  assert.match(indexSource,/此前估算年均约5.54kg纯酒精（约15.18g\/天，等价约26.5斤53度白酒）/);
  assert.doesNotMatch(indexSource,/安全饮酒量|允许饮酒量|今天还能喝|剩余额度|身体少吸收|健康收益|已恢复\d+%/);
});

test('版本统一为v22.7且不残留旧基准',()=>{
  const swSource=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');
  assert.match(indexSource,/styles\.css\?v=22\.7/);
  assert.match(indexSource,/db\.js\?v=22\.7/);
  assert.match(indexSource,/charts\.js\?v=22\.7/);
  assert.match(indexSource,/app\.js\?v=22\.7/);
  assert.match(indexSource,/节度 · Measured · v22\.7/);
  assert.match(source,/sw\.js\?v=22\.7/);
  assert.match(swSource,/measured-v22\.7/);
  assert.match(swSource,/styles\.css\?v=22\.7/);
  assert.match(swSource,/db\.js\?v=22\.7/);
  assert.match(swSource,/charts\.js\?v=22\.7/);
  assert.match(swSource,/app\.js\?v=22\.7/);
  assert.doesNotMatch(indexSource,/10\.1kg|27\.7g/);
});
