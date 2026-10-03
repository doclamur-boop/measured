'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const makeContext=()=>({
  console,
  navigator:{standalone:false},
  matchMedia:()=>({matches:false}),
  document:{documentElement:{classList:{toggle(){}}}},
  crypto:{randomUUID:null},
  window:{},
  setTimeout,clearTimeout,setInterval,clearInterval,
  Date,Math,Number,String,Array,Map,Object
});
const context=makeContext();
vm.createContext(context);
vm.runInContext(source.slice(0,source.indexOf('function renderToday')),context);

const at=(y,m,d,h=0,mi=0)=>new Date(y,m-1,d,h,mi).getTime();
const event=(t,date)=>({t,localDate:date});
const now=at(2026,10,4,12);

test('新用户没有虚假连续无烟时间或累计避免量',()=>{
  assert.equal(context.getCurrentStreak([],now),0);
  assert.equal(context.getCumulativeAvoided([],now),0);
  assert.equal(context.getLongestStreak([],now),0);
});

test('完整日按5支基准、当前日按已过去时间比例计算',()=>{
  const events=[
    event(at(2026,10,1,8),'2026-10-01'),
    event(at(2026,10,2,9),'2026-10-02'),
    event(at(2026,10,2,10),'2026-10-02'),
    ...Array.from({length:8},(_,i)=>event(at(2026,10,3,8+i),'2026-10-03'))
  ];
  assert.equal(context.getCumulativeAvoided(events,now),9.5);
  assert.equal(context.getExposureEstimate(9.5).tar,104.5);
  assert.ok(Math.abs(context.getExposureEstimate(9.5).nicotine-10.45)<1e-9);
  assert.equal(context.getExposureEstimate(9.5).co,123.5);
  assert.equal(context.getExposureEstimate(9.5).saved,9.5);
});

test('连续10个完整零吸烟日约等于避免50支',()=>{
  const anchor=Array.from({length:5},(_,i)=>event(at(2026,10,1,8+i),'2026-10-01'));
  assert.equal(context.getCumulativeAvoided(anchor,at(2026,10,12,0)),50);
});

test('累计成果以2026年10月1日为固定首个计算日',()=>{
  const anchor=Array.from({length:5},(_,i)=>event(at(2026,9,30,8+i),'2026-09-30'));
  assert.equal(context.getCumulativeAvoided(anchor,at(2026,10,2,12)),7.5);
});

test('超过5支的自然日不产生负数，未来记录不进入统计',()=>{
  const base=[event(at(2026,10,1,8),'2026-10-01'),...Array.from({length:8},(_,i)=>event(at(2026,10,3,8+i),'2026-10-03'))];
  const withFuture=base.concat(event(at(2026,10,5,8),'2026-10-05'));
  assert.equal(context.getCumulativeAvoided(withFuture,now),context.getCumulativeAvoided(base,now));
  assert.ok(context.getCumulativeAvoided(base,now)>0);
});

test('复吸只重置当前连续时间，最长纪录和累计成果仍可重算',()=>{
  const first=event(at(2026,9,1,9),'2026-09-01');
  const relapse=event(at(2026,10,3,9),'2026-10-03');
  const before=context.getCumulativeAvoided([first],relapse.t);
  const after=context.getCumulativeAvoided([first,relapse],relapse.t);
  assert.equal(context.getCurrentStreak([first,relapse],relapse.t),0);
  assert.ok(context.getLongestStreak([first,relapse],relapse.t)>=31);
  assert.ok(after>0);
  assert.ok(after<=before);
  const restored=context.getCumulativeAvoided([first],relapse.t);
  assert.equal(restored,before);
});

test('跨午夜按事件时间计算连续间隔，避免把日期标签当作时间差',()=>{
  const a=event(at(2026,10,1,23,59),'2026-10-01');
  const b=event(at(2026,10,2,0,1),'2026-10-02');
  assert.equal(context.getLongestStreak([a,b],b.t),0);
});

test('恢复时间线输出时间进度而非个人风险百分比',()=>{
  const state=context.getRecoveryState(25*60e3);
  assert.equal(state.current.label,'20分钟');
  assert.equal(state.next.label,'24小时');
  assert.ok(state.progress>=0&&state.progress<100);
});

test('导出JSON往返保留事件与固定参数',()=>{
  const exportContext=makeContext();
  vm.createContext(exportContext);
  vm.runInContext(source.slice(0,source.indexOf('async function init')),exportContext);
  const payload={
    app:'smoke-trace',version:5,
    prefs:{limit:{on:true,days:1,cigs:5},limitTouched:true},
    events:[event(at(2026,10,1,8),'2026-10-01'),event(at(2026,10,2,9),'2026-10-02')]
  };
  vm.runInContext(`events=${JSON.stringify(payload.events)};prefs=${JSON.stringify(payload.prefs)};`,exportContext);
  const roundTrip=vm.runInContext('JSON.parse(buildExport())',exportContext);
  assert.equal(JSON.stringify(roundTrip.events),JSON.stringify(payload.events));
  assert.equal(JSON.stringify(roundTrip.prefs),JSON.stringify(payload.prefs));
});
