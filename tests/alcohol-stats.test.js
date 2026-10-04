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
const freshAlcoholContext=()=>{
  const c=makeContext();
  vm.createContext(c);
  vm.runInContext(source.slice(0,source.indexOf('function renderToday')),c);
  const writes={events:[],prefs:[]};
  c.DB={
    setPref:async(k,v)=>writes.prefs.push({k,v}),
    putAlcoholEvent:async e=>writes.events.push(e)
  };
  vm.runInContext("prefs={limit:{on:false,days:1,cigs:10},limitTouched:false,alcoholTrackingStart:null,alcoholTodayConfirmedKey:null};alcoholEvents=[];",c);
  c.__writes=writes;
  return c;
};
const state=c=>vm.runInContext('({start:prefs.alcoholTrackingStart,count:alcoholEvents.length})',c);

test('纯酒精公式正确',()=>{
  assert.ok(Math.abs(context.getPureAlcoholG(250,40)-78.9)<1e-9);
});

test('无追踪起点时不产生虚假无酒率或连续无酒时间',()=>{
  const history=[event(at(2026,9,20,20),'2026-09-20')],now=at(2026,10,4,12),summary=context.getAlcoholSummary(history,now,null);
  assert.equal(summary.tracking,false);
  assert.equal(summary.freeRate,null);
  assert.equal(context.getCurrentAlcoholFreeStreak(history,now,null),0);
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

test('未来饮酒事件不进入统计，当前连续无酒按真实时间推进',()=>{
  const start=at(2026,10,1),now=at(2026,10,2,13),future=event(at(2026,10,3,20),'2026-10-03');
  const summary=context.getAlcoholSummary([future],now,start);
  assert.equal(summary.drinkingDays,0);
  assert.equal(context.getCurrentAlcoholFreeStreak([future],now,start),now-start);
});

test('日历分级边界为0、20、40克',()=>{
  const now=at(2026,10,4,12),list=[event(at(2026,10,1,19),'2026-10-01',0,100),event(at(2026,10,2,19),'2026-10-02',20,100),event(at(2026,10,3,19),'2026-10-03',50,100)];
  const cells=context.alcoholMonthCells(list,2026,10,now,at(2026,10,1)).filter(Boolean),by=new Map(cells.map(c=>[c.key,c.level]));
  assert.equal(by.get('2026-10-01'),0);
  assert.equal(by.get('2026-10-02'),1);
  assert.equal(by.get('2026-10-03'),2);
});

test('首次确认今天没喝酒从当天本地零点开始',async()=>{
  const c=freshAlcoholContext(),now=at(2026,10,4,21,15);
  await vm.runInContext(`ensureAlcoholTrackingStart(${now},'confirm')`,c);
  assert.equal(state(c).start,at(2026,10,4));
});

test('新用户首次进入戒酒页自动从当天零点开始',async()=>{
  const c=freshAlcoholContext(),now=at(2026,10,4,21,15);
  await vm.runInContext(`ensureAlcoholPageStart(${now})`,c);
  assert.equal(state(c).start,at(2026,10,4));
  assert.equal(state(c).count,0);
});

test('首次实时饮酒以实际事件时间作为正式起点',async()=>{
  const c=freshAlcoholContext(),ts=at(2026,10,4,20,30);
  await vm.runInContext(`addAlcoholEvent(${ts},40,250,true)`,c);
  assert.equal(state(c).start,ts);
  assert.equal(state(c).count,1);
});

test('首次历史补记建立实际发生时间起点且更早补记不前移',async()=>{
  const c=freshAlcoholContext(),first=at(2026,10,3,21),earlier=at(2026,10,1,20),now=at(2026,10,4,9);
  await vm.runInContext(`addAlcoholEvent(${first},40,250)`,c);
  assert.equal(state(c).start,first);
  assert.equal(vm.runInContext(`getCurrentAlcoholFreeStreak(alcoholEvents,${now},prefs.alcoholTrackingStart)`,c),now-first);
  await vm.runInContext(`addAlcoholEvent(${earlier},40,250)`,c);
  assert.equal(state(c).start,first);
  assert.equal(state(c).count,2);
  assert.equal(vm.runInContext(`getCurrentAlcoholFreeStreak(alcoholEvents,${now},prefs.alcoholTrackingStart)`,c),now-first);
});

test('正式起点建立后补记更早事件不能移动起点',async()=>{
  const c=freshAlcoholContext(),start=at(2026,10,4,20,30),earlier=at(2026,10,1,20);
  await vm.runInContext(`ensureAlcoholTrackingStart(${start},'realtime')`,c);
  await vm.runInContext(`addAlcoholEvent(${earlier},40,250,false)`,c);
  assert.equal(state(c).start,start);
  assert.equal(state(c).count,1);
});

test('开始后七天没有事件时打开页面仍按真实时间自动延续',()=>{
  const start=at(2026,10,1,20),now=at(2026,10,8,20);
  assert.equal(context.getCurrentAlcoholFreeStreak([],now,start),7*864e5);
});

test('不再点击今天没喝酒时无酒率仍按无事件自然日累计',()=>{
  const start=at(2026,10,1,20),now=at(2026,10,4,12),summary=context.getAlcoholSummary([],now,start);
  assert.equal(summary.denominator,4);
  assert.equal(summary.freeRate,1);
});

test('确认键跨日不会改变当前连续无酒时间',()=>{
  const start=at(2026,10,1,20),now=at(2026,10,4,12),list=[event(at(2026,10,2,8),'2026-10-02')];
  vm.runInContext("prefs.alcoholTodayConfirmedKey='2026-10-02'",context);
  const withKey=context.getCurrentAlcoholFreeStreak(list,now,start);
  vm.runInContext("prefs.alcoholTodayConfirmedKey=null",context);
  const withoutKey=context.getCurrentAlcoholFreeStreak(list,now,start);
  assert.equal(withKey,withoutKey);
});

test('正式追踪期内补记事件会立即重算当前连续无酒',()=>{
  const start=at(2026,10,1),backfill=at(2026,10,6,21),now=at(2026,10,9,12);
  assert.equal(context.getCurrentAlcoholFreeStreak([event(backfill,'2026-10-06')],now,start),now-backfill);
});

test('删除补记后当前与最长无酒纪录由剩余事件恢复',()=>{
  const start=at(2026,10,1,8),first=event(at(2026,10,2,9),'2026-10-02'),second=event(at(2026,10,4,9),'2026-10-04'),now=at(2026,10,5,9);
  assert.equal(context.getCurrentAlcoholFreeStreak([first,second],now,start),864e5);
  assert.equal(context.getLongestAlcoholFreeStreak([first,second],now,start),2);
  assert.equal(context.getCurrentAlcoholFreeStreak([first],now,start),3*864e5);
  assert.equal(context.getLongestAlcoholFreeStreak([first],now,start),3);
});

test('起算前事件只在历史存在，不进入30日正式统计',()=>{
  const start=at(2026,10,2,10),list=[event(at(2026,10,1,9),'2026-10-01'),event(at(2026,10,3,9),'2026-10-03')],summary=context.getAlcoholSummary(list,at(2026,10,4,12),start);
  assert.equal(summary.drinkingDays,1);
  assert.ok(Math.abs(summary.totalG-78.9)<1e-9);
});

test('月历把起算前日期显示为未追踪，未来日期保持中性',()=>{
  const start=at(2026,10,2,10),now=at(2026,10,4,12),list=[event(at(2026,10,1,9),'2026-10-01'),event(at(2026,10,2,12),'2026-10-02')];
  const cells=context.alcoholMonthCells(list,2026,10,now,start).filter(Boolean),by=new Map(cells.map(c=>[c.key,c]));
  assert.equal(by.get('2026-10-01').state,'untracked');
  assert.equal(by.get('2026-10-02').state,'tracked');
  assert.equal(by.get('2026-10-05').state,'future');
  assert.equal(by.get('2026-10-01').g,0);
});

test('多次饮酒由追踪期内最新事件决定当前连续无酒',()=>{
  const start=at(2026,10,1),list=[event(at(2026,10,2,9),'2026-10-02'),event(at(2026,10,3,9),'2026-10-03')],now=at(2026,10,4,12);
  assert.equal(context.getCurrentAlcoholFreeStreak(list,now,start),now-at(2026,10,3,9));
});

test('30日分母从起算点所在自然日开始而不是起算时刻开始',()=>{
  const start=at(2026,10,1,20,30),now=at(2026,10,2,12),summary=context.getAlcoholSummary([event(start,'2026-10-01')],now,start);
  assert.equal(summary.denominator,2);
  assert.equal(summary.drinkingDays,1);
  assert.equal(summary.freeRate,.5);
});

test('导入含起点备份时保留已有起点，未开始时才恢复备份起点',()=>{
  const current=at(2026,10,4),older=at(2026,10,1),kept=context.mergeImportedPrefs({alcoholTrackingStart:current},{alcoholTrackingStart:older}),restored=context.mergeImportedPrefs({alcoholTrackingStart:null},{alcoholTrackingStart:older});
  assert.equal(kept.alcoholTrackingStart,current);
  assert.equal(restored.alcoholTrackingStart,older);
});

test('历史入口统一为补记而饮酒Sheet保留明确标题',()=>{
  assert.match(source,/\$\('#btnBackfill'\)\.textContent='＋ 补记'/);
  assert.match(source,/backfill\?'补记一次饮酒':'记录一次饮酒'/);
});

test('只有追踪偏好没有事件时仍允许清空正式起点',()=>{
  const c=makeContext();
  vm.createContext(c);
  vm.runInContext(source.slice(0,source.indexOf('async function init')),c);
  vm.runInContext("events=[];alcoholEvents=[];prefs={limit:{on:false,days:1,cigs:10},limitTouched:false,alcoholTrackingStart:null,alcoholTodayConfirmedKey:null};",c);
  assert.equal(vm.runInContext('hasClearableData()',c),false);
  vm.runInContext(`prefs.alcoholTrackingStart=${at(2026,10,1)}`,c);
  assert.equal(vm.runInContext('hasClearableData()',c),true);
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
