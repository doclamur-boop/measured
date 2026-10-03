'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const appSource=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const chartSource=fs.readFileSync(path.join(__dirname,'..','charts.js'),'utf8');
const at=(y,m,d,h=0,mi=0)=>new Date(y,m-1,d,h,mi).getTime();
const event=(t,date,abv=40,volumeMl=250)=>({t,localDate:date,abv,volumeMl});
const makeContext=(DateCtor=Date)=>({console,navigator:{standalone:false},matchMedia:()=>({matches:false}),document:{documentElement:{classList:{toggle(){}}}},crypto:{randomUUID:null},window:{},setTimeout,clearTimeout,setInterval,clearInterval,Date:DateCtor,Math,Number,String,Array,Map,Object,devicePixelRatio:1});

test('跨年事件按实际时间排序，日趋势保持逐日分桶',()=>{
  const now=at(2027,1,2,12);
  class FrozenDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const c=makeContext(FrozenDate);
  vm.createContext(c);
  vm.runInContext(appSource.slice(0,appSource.indexOf('function renderStats')),c);
  const events=[
    event(at(2027,1,2,8),'2027-01-02'),
    event(at(2026,12,31,20),'2026-12-31'),
    event(at(2027,1,1,9),'2027-01-01'),
    event(at(2027,1,1,10),'2027-01-01'),
    event(at(2027,1,2,9),'2027-01-02'),
    event(at(2027,1,2,10),'2027-01-02')
  ];
  vm.runInContext(`events=${JSON.stringify(events)};statsRange=Infinity;`,c);
  assert.deepEqual(Array.from(vm.runInContext('validSmokeEvents(events).map(e=>e.t)',c)),events.slice().sort((a,b)=>a.t-b.t).map(e=>e.t));
  assert.deepEqual(Array.from(vm.runInContext('buildTrend().data.map(p=>localDateKey(p.day))',c)),['2026-12-31','2027-01-01','2027-01-02']);
  assert.deepEqual(Array.from(vm.runInContext('buildTrend().data.map(p=>p.c)',c)),[1,2,3]);
});

test('跨年历史日期在非当前年份显示年份',()=>{
  const c=makeContext();
  vm.createContext(c);
  vm.runInContext(appSource.slice(0,appSource.indexOf('function renderToday')),c);
  assert.equal(vm.runInContext(`historyDateLabel(new Date(${at(2026,12,31)}),${at(2027,1,2,12)})`,c),'2026年12月31日');
  assert.equal(vm.runInContext(`historyDateLabel(new Date(${at(2027,1,2)}),${at(2027,1,2,12)})`,c),'一月二日');
});

test('跨年30日窗口与饮酒月历按完整日期继续计算',()=>{
  const c=makeContext();
  vm.createContext(c);
  vm.runInContext(appSource.slice(0,appSource.indexOf('function renderToday')),c);
  const start=at(2026,12,31,21),now=at(2027,1,2,12),list=[event(start,'2026-12-31'),event(at(2027,1,1,9),'2027-01-01'),event(at(2027,1,2,9),'2027-01-02')];
  const summary=vm.runInContext(`getAlcoholSummary(${JSON.stringify(list)},${now},${start})`,c);
  assert.equal(summary.denominator,3);
  assert.equal(summary.drinkingDays,3);
  assert.equal(summary.freeRate,0);
  assert.ok(Math.abs(summary.totalG-78.9*3)<1e-9);
  const dec=vm.runInContext(`alcoholMonthCells(${JSON.stringify(list)},2026,12,${now},${start})`,c).filter(Boolean);
  const jan=vm.runInContext(`alcoholMonthCells(${JSON.stringify(list)},2027,1,${now},${start})`,c).filter(Boolean);
  assert.equal(dec.find(c=>c.key==='2026-12-31').count,1);
  assert.equal(jan.find(c=>c.key==='2027-01-01').count,1);
  assert.equal(jan.find(c=>c.key==='2027-01-02').count,1);
  assert.equal(jan.find(c=>c.key==='2027-01-03').state,'future');
});

test('跨年趋势标签在首点、年份切换点和末点标明年份',()=>{
  const c=makeContext();
  vm.createContext(c);
  vm.runInContext(chartSource,c);
  const data=[{day:at(2026,12,31),c:1},{day:at(2027,1,1),c:2},{day:at(2027,1,2),c:3}];
  assert.equal(vm.runInContext(`ChartUI.chartDateLabel(${JSON.stringify(data)},0)`,c),'2026/12/31');
  assert.equal(vm.runInContext(`ChartUI.chartDateLabel(${JSON.stringify(data)},1)`,c),'2027/1/1');
  assert.equal(vm.runInContext(`ChartUI.chartDateLabel(${JSON.stringify(data)},2)`,c),'2027/1/2');
});
