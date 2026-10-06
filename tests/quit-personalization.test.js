'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const appSource=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const indexSource=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const stylesSource=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
const makeContext=()=>({console,navigator:{standalone:false},matchMedia:()=>({matches:false}),document:{documentElement:{classList:{toggle(){}}}},crypto:{randomUUID:null},window:{},setTimeout,clearTimeout,setInterval,clearInterval,Date,Math,Number,String,Array,Map,Object});
const context=makeContext();
vm.createContext(context);
vm.runInContext(appSource.slice(0,appSource.indexOf('function renderToday')),context);
const DAY=864e5;

test('个人背景文案与累计成果基准均保留',()=>{
  assert.match(indexSource,/约4年/);
  assert.match(indexSource,/约5–10支\/天/);
  assert.match(indexSource,/约8,000–12,000支/);
  assert.match(indexSource,/约29岁/);
  assert.doesNotMatch(indexSource,/包年/);
  assert.match(indexSource,/5支\/天/);
  assert.match(indexSource,/累计避免吸烟·支/);


});

test('当前恢复阶段按无烟时长切换且不计算恢复百分比',()=>{
  assert.equal(context.getQuitPhase(0).title,'急性烟草暴露退出期');
  assert.equal(context.getQuitPhase(3*DAY).title,'早期恢复期');
  assert.equal(context.getQuitPhase(90*DAY).title,'呼吸与循环恢复期');
  assert.equal(context.getQuitPhase(365*DAY).title,'中期风险下降期');
  assert.equal(context.getQuitPhase(2*365*DAY+1).title,'长期风险下降期');
  assert.match(indexSource,/不是医学诊断，也不代表个人恢复百分比/);
  assert.doesNotMatch(indexSource,/恢复\d+%/);
});

test('长期风险模块使用总体人群相对继续吸烟的限定文案',()=>{
  assert.match(indexSource,/长期疾病风险下降/);
  assert.match(indexSource,/相对于继续吸烟的人群统计变化/);
  assert.match(indexSource,/冠心病.*3–6年/s);
  assert.match(indexSource,/口腔 \/ 咽喉 \/ 喉癌.*5–10年/s);
  assert.match(indexSource,/肺癌.*10–15年/s);
  const coronaryCard=indexSource.match(/<article><div><b>冠心病<\/b><\/div><div class="quit-risk-multi">[\s\S]*?<\/article>/)?.[0];
  assert.ok(coronaryCard);
  assert.match(coronaryCard,/3–6年[\s\S]*额外风险约↓50%/);
  assert.match(coronaryCard,/约15年[\s\S]*接近不吸烟者/);
  const legacyRiskClass=['risk','double'].join('-');
  assert.doesNotMatch(indexSource,new RegExp(legacyRiskClass));
  assert.match(indexSource,/↓约50%/g);
  assert.match(indexSource,/约29岁、累计约8,000–12,000支时停止继续吸烟/);
  assert.doesNotMatch(indexSource,/个人绝对肺癌概率|永久损伤概率|个人总发病概率减半/);
});

test('戒烟页核心模块仍存在且移动布局保留响应式约束',()=>{
  ['quitDays','breathStart','quitAvoided','quitLongest','quitTar','quitNicotine','quitCo'].forEach(id=>assert.match(indexSource,new RegExp(`id="${id}"`)));
  assert.match(indexSource,/id="quitPhaseTitle"/);
  assert.match(indexSource,/id="quitPhaseCopy"/);
  assert.match(stylesSource,/@media\(max-width:430px\)/);
  assert.match(indexSource,/class="quit-long-risk"/);
});

test('戒烟页顺序与呼吸标题去重符合当前版本',()=>{
  const order=['quit-hero','quit-results','breath-card','quit-background','quit-phase','quit-long-risk'].map(token=>indexSource.indexOf(token));
  assert.ok(order.every((pos,i)=>pos>=0&&(i===0||pos>order[i-1])));
  assert.doesNotMatch(indexSource,/recovery-card|recoveryTitle|近期身体恢复/);
  assert.doesNotMatch(indexSource,/应对烟瘾/);
  assert.equal((indexSource.match(/4-7-8呼吸法/g)||[]).length,1);
  assert.doesNotMatch(indexSource,/4-7-8 呼吸法/);
});

test('累计成果只显示避免支数和最长天数，详细烟气数据保留且渲染无缺失DOM',()=>{
  const card=indexSource.slice(indexSource.indexOf('<section class="quit-results">'),indexSource.indexOf('<section class="breath-card">'));
  const metrics=card.slice(card.indexOf('<div class="quit-metrics">'),card.indexOf('<details'));
  assert.deepEqual(Array.from(metrics.matchAll(/id="([^"]+)"/g),m=>m[1]),['quitAvoided','quitLongest']);
  assert.match(metrics,/累计避免吸烟·支/);
  assert.match(metrics,/最长连续无烟·天/);
  assert.match(card,/详细数据 · 标称烟气释放量估算/);
  ['焦油·mg','烟碱·mg','一氧化碳·mg'].forEach(label=>assert.ok(card.includes(label)));
  const elements=Object.fromEntries(Array.from(indexSource.matchAll(/id="([^"]+)"/g),m=>['#'+m[1],{style:{}}]));
  context.document.querySelector=selector=>{assert.ok(elements[selector],`render references absent DOM: ${selector}`);return elements[selector];};
  context.renderQuit();
  assert.equal(elements['#quitAvoided'].textContent,'0');
  assert.equal(elements['#quitLongest'].textContent,0);
  ['#quitTar','#quitNicotine','#quitCo'].forEach(selector=>assert.equal(elements[selector].textContent,'0'));
});
