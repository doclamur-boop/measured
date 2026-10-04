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
const event=(t,date,abv,volumeMl)=>({t,localDate:date,abv,volumeMl});
const start=at(2026,10,1);

test('常饮酒换算值符合现有纯酒精公式',()=>{
  assert.ok(Math.abs(context.getPureAlcoholG(500,4.7)-18.5415)<1e-9);
  assert.ok(Math.abs(context.getPureAlcoholG(250,40)-78.9)<1e-9);
  assert.ok(Math.abs(context.getPureAlcoholG(250,53)-104.5425)<1e-9);
});

test('今日控酒目标正确处理0g、20g和50g边界',()=>{
  const now=at(2026,10,4,22);
  const none=context.getAlcoholTodayReference([],now,start);
  const line=context.getAlcoholTodayReference([event(at(2026,10,4,20),'2026-10-04',4.7,500)],now,start);
  const over=context.getAlcoholTodayReference([event(at(2026,10,4,20),'2026-10-04',12,250)],now,start);
  const high=context.getAlcoholTodayReference([event(at(2026,10,4,20),'2026-10-04',40,250)],now,start);
  assert.equal(none.label,'无酒');
  assert.equal(line.label,'目标内');
  assert.ok(Math.abs(line.totalG-18.5415)<1e-9);
  assert.equal(context.getAlcoholDayStatus(20),'目标内');
  assert.equal(over.label,'超过目标');
  assert.equal(high.label,'大量饮酒警戒');
});

test('月度目标按自然月独立统计，不继承上月未使用部分',()=>{
  const list=[event(at(2026,10,31,20),'2026-10-31',40,250),event(at(2026,11,1,20),'2026-11-01',4.7,500)];
  const month=context.getAlcoholMonthStats(list,at(2026,11,2,12),start);
  assert.ok(Math.abs(month.totalG-18.5415)<1e-9);
  assert.equal(month.drinkingDays,1);
  assert.equal(month.freeDays,1);
  assert.ok(Math.abs(month.highestG-18.5415)<1e-9);
});

test('过去365天与前365天同比按累计纯酒精计算',()=>{
  const now=at(2026,10,4,12),list=[
    event(at(2025,9,10,20),'2025-09-10',40,250),
    event(at(2025,9,11,20),'2025-09-11',40,250),
    event(at(2026,10,1,20),'2026-10-01',40,250)
  ];
  const trend=context.getAlcoholYearTrend(list,now,at(2024,1,1));
  assert.ok(Math.abs(trend.current.totalG-78.9)<1e-9);
  assert.equal(trend.current.drinkingDays,1);
  assert.equal(trend.current.highestG,78.9);
  assert.ok(Math.abs(trend.previous.totalG-157.8)<1e-9);
  assert.equal(trend.comparePct,-50);
  assert.equal(context.getAlcoholYearTrend([list[2]],now,at(2024,1,1)).comparePct,null);
});

test('控酒参考文案不使用安全量、允许量或剩余额度措辞',()=>{
  assert.match(indexSource,/今日控酒目标/);
  assert.match(indexSource,/月度控酒目标/);
  assert.match(source,/大量饮酒警戒/);
  assert.doesNotMatch(indexSource,/安全饮酒量|允许饮酒量|今天还能喝|剩余额度/);
});

test('既有30日戒酒统计口径仍由原函数提供',()=>{
  const list=[event(at(2026,10,2,20),'2026-10-02',40,250)];
  const summary=context.getAlcoholSummary(list,at(2026,10,4,12),start);
  assert.equal(summary.drinkingDays,1);
  assert.equal(summary.denominator,4);
  assert.ok(Math.abs(summary.totalG-78.9)<1e-9);
});

test('自然日计数跨月跨年按本地日期递增，不依赖固定24小时差值',()=>{
  assert.equal(context.countLocalDays(at(2026,12,31),at(2027,1,3)),3);
  assert.equal(context.countLocalDays(at(2026,10,1),at(2026,10,4)),3);
});

test('v22.4戒酒页删除每日确认和恢复窗口，并保留月份选择器',()=>{
  assert.doesNotMatch(indexSource,/alcoholNoDrink|今天没喝酒|恢复窗口/);
  assert.match(indexSource,/id="alcoholMonthPrev"/);
  assert.match(indexSource,/id="alcoholMonthNext"/);
  assert.match(indexSource,/月度控酒成果/);
  assert.match(source,/function getAlcoholDayStatus/);
  assert.doesNotMatch(indexSource,/alcoholMonthStats/);
  assert.match(source,/if\(name==='alcohol'\)\{ensureAlcoholPageStart\(Date\.now\(\)\);renderAlcohol\(\);\}/);
  const calendarBlock=source.slice(source.indexOf('function renderAlcoholCalendar'),source.indexOf('function showAlcoholDay'));
  assert.doesNotMatch(calendarBlock,/ensureAlcoholPageStart/);
});
