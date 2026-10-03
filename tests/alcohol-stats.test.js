'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const makeContext=()=>({console,navigator:{standalone:false},matchMedia:()=>({matches:false}),document:{documentElement:{classList:{toggle(){}}}},crypto:{randomUUID:null},window:{},setTimeout,clearTimeout,setInterval,clearInterval,Date,Math,Number,String,Array,Map,Object});
const context=makeContext();
vm.createContext(context);
vm.runInContext(source.slice(0,source.indexOf('function renderToday')),context);

const at=(y,m,d,h=0,mi=0)=>new Date(y,m-1,d,h,mi).getTime();
const event=(t,date,abv=40,volumeMl=250)=>({t,localDate:date,abv,volumeMl});

test('纯酒精公式正确',()=>{
  assert.ok(Math.abs(context.getPureAlcoholG(250,40)-78.9)<1e-9);
});

test('无追踪起点时不产生虚假无酒率',()=>{
  const summary=context.getAlcoholSummary([],at(2026,10,4,12),null);
  assert.equal(summary.tracking,false);
  assert.equal(summary.freeRate,null);
});

test('同日多次饮酒合并为饮酒日并累计纯酒精',()=>{
  const start=at(2026,10,1),list=[event(at(2026,10,2,19),'2026-10-02',40,250),event(at(2026,10,2,21),'2026-10-02',12,500)];
  const summary=context.getAlcoholSummary(list,at(2026,10,4,12),start);
  assert.equal(summary.drinkingDays,1);
  assert.ok(Math.abs(summary.totalG-(78.9+47.34))<1e-9);
});

test('当前无酒间隔与最长无酒纪录分离',()=>{
  const start=at(2026,10,1),list=[event(at(2026,10,1,20),'2026-10-01'),event(at(2026,10,3,20),'2026-10-03')],now=at(2026,10,4,20);
  assert.equal(context.getCurrentAlcoholFreeStreak(list,now,start),864e5);
  assert.equal(context.getLongestAlcoholFreeStreak(list,now,start),2);
});

test('未来饮酒事件不进入统计，恢复里程碑按当前无酒时间推进',()=>{
  const start=at(2026,10,1),now=at(2026,10,2,13),future=event(at(2026,10,3,20),'2026-10-03');
  const summary=context.getAlcoholSummary([future],now,start);
  assert.equal(summary.drinkingDays,0);
  assert.equal(context.getCurrentAlcoholFreeStreak([future],now,start),now-start);
  const recovery=context.getAlcoholRecoveryState(13*36e5);
  assert.equal(recovery.current.label,'12小时');
  assert.equal(recovery.next.label,'24小时');
});

test('日历分级边界为0、20、40克',()=>{
  const now=at(2026,10,4,12),list=[event(at(2026,10,1,19),'2026-10-01',0,100),event(at(2026,10,2,19),'2026-10-02',20,100),event(at(2026,10,3,19),'2026-10-03',50,100)];
  const cells=context.alcoholMonthCells(list,2026,10,now).filter(Boolean),by=new Map(cells.map(c=>[c.key,c.level]));
  assert.equal(by.get('2026-10-01'),0);
  assert.equal(by.get('2026-10-02'),1);
  assert.equal(by.get('2026-10-03'),2);
});

test('v6备份包含酒精事件并保留旧吸烟字段',()=>{
  const exportContext=makeContext();
  vm.createContext(exportContext);
  vm.runInContext(source.slice(0,source.indexOf('async function init')),exportContext);
  const smoke=event(at(2026,10,1,8),'2026-10-01');
  const drink=event(at(2026,10,2,20),'2026-10-02',40,250);
  vm.runInContext(`events=${JSON.stringify([smoke])};alcoholEvents=${JSON.stringify([drink])};prefs={limit:{on:false,days:1,cigs:10},limitTouched:false,alcoholTrackingStart:${at(2026,10,1)}};`,exportContext);
  const result=vm.runInContext('JSON.parse(buildExport())',exportContext);
  assert.equal(result.app,'measured');
  assert.equal(result.version,6);
  assert.equal(result.events.length,1);
  assert.equal(result.alcoholEvents.length,1);
});
