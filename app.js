'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let model=null,selected=0,game=1,detailed=false,query='',focused=-1,dragCount=0,toastTimer,rawLines=[],view='report';
function notify(text,error=false){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.toggle('error',error);$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,error?9500:3200);}
function gameTurns(){return model.turns.filter(t=>t.game===game);}
function isShown(e){return Replay.visible(e,detailed)&&(!query||`${e.text} ${e.raw.message||''} ${e.kind}`.toLowerCase().includes(query));}
function loadModel(next){
  if(!next||next.version!==1||!Array.isArray(next.turns)||!Array.isArray(next.states)||!next.header?.players)throw Error('战报数据格式不兼容。');
  model=next;game=model.turns[0]?.game||1;selected=model.turns[0]?.id??0;focused=-1;query='';$('search').value='';rawLines=[];$('raw-search').value='';$('raw-kind').value='';$('raw-text').value='';
  $('landing').hidden=true;$('workspace').hidden=false;
  const h=model.header;const players=h.players||[];
  $('match-title').innerHTML=players.map(p=>esc(p.name)).join('<span class="versus">vs.</span>');
  const recorded=new Date(h.recordedAt);const date=Number.isNaN(recorded.getTime())?'时间未记录':recorded.toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'});
  $('match-meta').textContent=`MATCH ARCHIVE / ${h.formatId||'UNKNOWN'} / ${date}`;
  $('match-sub').textContent=`录制视角 ${players.find(p=>p.seat===h.seat)?.name??'未知'}  ·  ${Replay.clock(model.duration)}  ·  ${model.eventCount} 条事件${h.complete?'':'  ·  未完成'}`;
  $('score').innerHTML=model.finalScore.length?model.finalScore.map(esc).join('<span class="score-colon">:</span>'):'—';
  $('warnings').textContent=model.warnings.join('\n');$('warnings').hidden=!model.warnings.length;
  renderGames();render();switchView('report');document.title=`${players.map(p=>p.name).join(' vs ')} · Endstep 对局档案`;
}
function switchView(next){
  view=next;const raw=next==='jsonl';
  $('report-view').hidden=raw;$('report-toolbar').hidden=raw;$('jsonl-view').hidden=!raw;
  for(const [id,active] of [['view-report',!raw],['view-jsonl',raw]]){$(id).classList.toggle('active',active);$(id).setAttribute('aria-pressed',String(active));}
  if(raw)renderRaw();
}
function renderRaw(){
  if(!model)return;
  if(!model.sourceText){$('raw-text').value='这份旧版战报没有内嵌原始 JSONL，请重新导入 .esreplay 文件。';$('save-jsonl').disabled=true;return;}
  $('save-jsonl').disabled=false;
  if(!rawLines.length)rawLines=model.sourceText.replace(/^\uFEFF/,'').split(/\r?\n/).filter(s=>s.trim()).map(line=>{let k='';try{k=JSON.parse(line).k||'header';}catch{k='unknown';}return {line,k};});
  const kind=$('raw-kind').value,q=$('raw-search').value.toLowerCase();
  const rows=rawLines.filter(r=>(!kind||r.k===kind)&&(!q||r.line.toLowerCase().includes(q)));
  $('raw-text').value=!kind&&!q?model.sourceText:rows.map(r=>r.line).join('\n');
  $('raw-count').textContent=`${rows.length.toLocaleString()} / ${rawLines.length.toLocaleString()} 行`;
}
async function openFile(file){
  if(!file)return;
  if(file.size>40*1024*1024){notify('文件超过 40 MB，请使用较小的单场回放。',true);return;}
  document.body.classList.add('busy');notify('正在恢复回合与局面…');
  try{
    await new Promise(r=>setTimeout(r,30));
    const signature=new Uint8Array(await file.slice(0,2).arrayBuffer());let text;
    if(signature[0]===0x1f&&signature[1]===0x8b){
      if(typeof DecompressionStream==='undefined')throw Error('当前浏览器不支持 Gzip 解压，请使用较新版 Edge、Chrome 或 Firefox。');
      const reader=file.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
      const chunks=[];let length=0;
      while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>128*1024*1024){await reader.cancel();throw Error('解压后文件超过 128 MB。');}chunks.push(value);}
      text=await new Blob(chunks).text();
    }else text=await file.text();
    loadModel(Replay.parse(text,file.name));notify(`已整理 ${new Set(model.turns.map(t=>t.game)).size} 局对局，${model.eventCount} 条事件。`);
  }catch(error){notify(`无法读取：${error.message||'文件损坏或格式不支持'}`,true);}
  finally{document.body.classList.remove('busy');$('file').value='';}
}
function renderGames(){
  $('games').innerHTML=[...new Set(model.turns.map(t=>t.game))].map(n=>{
    const result=model.turns.filter(t=>t.game===n).find(t=>t.winner);
    const mine=model.header.players.find(p=>p.seat===model.header.seat)?.name;
    return `<button class="game-tab ${n===game?'active':''}" data-game="${n}" aria-pressed="${n===game}">第 ${String(n).padStart(2,'0')} 局 <span>${result?(result.winner===mine?'胜':'负'):'进行中'}</span></button>`;
  }).join('');
}
function render(){if(!model)return;renderTurns();renderReading();renderBoard();}
function renderTurns(){
  const turns=gameTurns();$('turn-count').textContent=`${turns.filter(t=>t.number).length} TURNS`;
  $('turns').innerHTML=turns.map(t=>`<button class="turn-button ${t.id===selected?'active':''} ${query&&t.entries.some(isShown)?'matching':''}" data-turn="${t.id}" ${t.id===selected?'aria-current="true"':''}><span class="turn-n">${t.number?String(t.personal).padStart(2,'0'):'—'}</span><span class="turn-person">${esc(t.number?t.player:'开局与调度')}<small>${t.number?`T${t.number} · `:''}${Replay.clock(t.t)}</small></span></button>`).join('');
}
function renderReading(){
  const turn=model.turns[selected];if(!turn)return;
  $('turn-kicker').textContent=`GAME ${String(game).padStart(2,'0')} / ${turn.number?'GLOBAL TURN '+String(turn.number).padStart(2,'0'):'OPENING HAND'} / ${Replay.clock(turn.t)}`;
  $('turn-title').textContent=turn.number?`${turn.player} 的第 ${turn.personal} 回合`:'开局与调度';
  const ids=gameTurns().map(t=>t.id),pos=ids.indexOf(selected);$('prev').disabled=pos<=0;$('next').disabled=pos>=ids.length-1;
  $('search-note').hidden=!query;
  const matches=model.turns.filter(t=>t.game===game).reduce((n,t)=>n+t.entries.filter(isShown).length,0);
  $('search-note').textContent=query?`本局找到 ${matches} 条匹配记录。左侧标点的回合包含结果。`:'';
  let last='',html='',count=0;
  turn.entries.forEach((e,i)=>{
    if(!isShown(e))return;count++;
    if(e.phase!==last){last=e.phase;html+=`<div class="phase-label">${esc(last)}</div>`;}
    const parts=e.text.split('\n记录原文：');
    html+=`<button class="event ${i===focused?'selected':''}" data-entry="${i}" data-type="${esc(e.type)}" aria-label="${esc(parts[0])}，查看此前快照"><time>${Replay.clock(e.t)}</time><div><span class="event-kind">${esc(e.kind)}</span><div class="event-text">${esc(parts[0])}</div>${parts[1]?`<div class="event-raw-text">${esc(parts[1])}</div>`:''}</div></button>`;
    if(i===focused)html+=`<details class="raw-inspector"><summary>查看这条事件的原始记录</summary><pre>${esc(e.rawRecord||JSON.stringify(e.raw,null,2))}</pre></details>`;
  });
  if(!count)html=`<p class="empty">${query?'本回合没有匹配记录。可选择左侧标点的回合，或清空搜索。':'本回合没有精简事件。切换「完整记录」可查看阶段与底层日志。'}</p>`;
  $('events').innerHTML=html;
}
function cardRows(cards){
  const groups=[];const keys=new Map();
  for(const c of cards){const flags=[c.tapped?'横置':'',c.attacking?'攻击':'',c.blocking?'阻挡':'',c.transformed?'已转化':'',...Object.entries(c.counters||{}).filter(([,v])=>v).map(([k,v])=>`${k} ${v}`),c.damage?`伤害 ${c.damage}`:''].filter(Boolean).join(' · ');
    const pt=c.types?.includes('Creature')?`${c.power}/${c.toughness}`:'';const key=[c.name,flags,pt].join('|');
    if(keys.has(key))groups[keys.get(key)].count++;else{keys.set(key,groups.length);groups.push({c,flags,pt,count:1});}
  }
  return groups.map(({c,flags,pt,count})=>`<div class="card-row ${c.tapped?'tapped':''}"><span class="card-qty">${count>1?count+'×':'·'}</span>${c.hidden?'<span>未知牌</span>':`<button data-card="${esc(c.name)}">${esc(c.name)}</button>`}<span class="card-flags">${esc([pt,flags].filter(Boolean).join(' · '))}</span></div>`).join('');
}
function renderBoard(){
  const turn=model.turns[selected],entry=focused>=0?turn.entries[focused]:null;
  const state=model.states[entry?entry.stateIndex:turn.stateIndex];
  $('reset-state').hidden=!entry;
  if(!state){$('snapshot-caption').textContent='此处没有可恢复的局面快照。';$('board-state').innerHTML='<p class="empty">请参考事件记录。</p>';return;}
  $('snapshot-caption').textContent=`${entry?'事件前最近快照':'回合末最近快照'} · ${Replay.clock(state.t)}\n${state.phase} · 点击事件可切换观察时点`;
  let html='';
  if(state.stack.length)html+=`<div class="stack-note"><div class="zone-heading">快照中的堆叠 · 文件顺序</div>${state.stack.map(s=>`<div>${esc(s.name)}${s.ability?'〔'+(s.trigger?'触发':'起动')+'异能〕':''}</div>`).join('')}</div>`;
  for(const p of state.players){
    const unknown=p.hand.filter(c=>c.hidden).length;const hand=p.hand.filter(c=>!c.hidden);
    html+=`<section class="player-block"><div class="player-head"><b>${esc(p.name)}</b><span class="life">${esc(p.life)}<small>LIFE</small></span></div><div class="player-meta">手牌 ${esc(p.handSize)} · 牌库 ${esc(p.librarySize)}${p.monarch?' · 君主':''}${p.initiative?' · 先制':''}${p.poison?' · 中毒 '+p.poison:''}</div><div class="zone-heading"><span>战场</span><span>${p.battlefield.length}</span></div>${cardRows(p.battlefield)||'<div class="unknown-hand">空战场</div>'}<div class="zone-heading"><span>手牌</span><span>${esc(p.handSize)}</span></div>${cardRows(hand)}${unknown?`<div class="unknown-hand">${unknown} 张未知牌 · 对录制视角隐藏</div>`:''}${!p.hand.length?'<div class="unknown-hand">无已记录手牌</div>':''}`;
    for(const [z,label] of [['graveyard','坟墓场'],['exile','放逐区']])html+=`<details class="zone-details"><summary>${label} · ${p[z].length}</summary>${cardRows(p[z])||'<p class="unknown-hand">空</p>'}</details>`;
    html+='</section>';
  }
  $('board-state').innerHTML=html;
}
function chooseTurn(id){selected=id;focused=-1;render();}
function moveTurn(offset){const turns=gameTurns(),pos=turns.findIndex(t=>t.id===selected),next=turns[pos+offset];if(next)chooseTurn(next.id);}
function download(content,type,extension){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=(model.filename||'endstep').replace(/\.(esreplay|jsonl|ndjson)$/i,'')+(extension==='jsonl'?'-原始.':'-战报.')+extension;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
async function exportFile(kind){
  if(!model)return;
  try{
    if(kind==='jsonl'){
      if(!model.sourceText)throw Error('这份旧版战报未包含原始 JSONL，请重新导入原文件。');
      download(model.sourceText,'application/x-ndjson;charset=utf-8','jsonl');
    }
    else if(kind==='json')download(JSON.stringify(model,null,2),'application/json;charset=utf-8','json');
    else if(kind==='html'){
      // Export from the pristine shell, with serialized data escaped out of HTML's script context.
      const template=document.documentElement.cloneNode(true);
      template.querySelector('#workspace').hidden=true;template.querySelector('#landing').hidden=false;
      for(const id of ['events','turns','games','board-state','warnings'])template.querySelector('#'+id).innerHTML='';
      for(const dialog of template.querySelectorAll('dialog'))dialog.removeAttribute('open');
      template.querySelector('#toast').hidden=true;template.querySelector('#drop').hidden=true;
      template.querySelector('#search').value='';template.querySelector('#export-menu').hidden=true;
      template.querySelector('#raw-text').value='';template.querySelector('#raw-text').textContent='';
      template.querySelector('#export').setAttribute('aria-expanded','false');
      template.querySelector('body').classList.remove('busy');
      template.querySelector('#embedded-replay')?.remove();
      const data=document.createElement('script');data.id='embedded-replay';data.type='application/json';data.textContent=JSON.stringify(model).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
      template.querySelector('body').prepend(data);
      // The distributable has all assets inline. Source development files are inlined when exporting too.
      for(const script of [...template.querySelectorAll('script[src]')]){const text=await fetch(script.getAttribute('src')).then(r=>{if(!r.ok)throw Error('导出资源读取失败');return r.text();});script.removeAttribute('src');script.textContent=text;}
      for(const link of [...template.querySelectorAll('link[rel="stylesheet"]')]){const style=document.createElement('style');style.textContent=await fetch(link.getAttribute('href')).then(r=>r.text());link.replaceWith(style);}
      download('<!doctype html>\n'+template.outerHTML,'text/html;charset=utf-8','html');
    }else download(Replay.markdown(model,detailed),'text/plain;charset=utf-8',kind);
    notify('战报已导出。');
  }catch(error){notify('导出失败：'+error.message,true);}
  $('export-menu').hidden=true;$('export').setAttribute('aria-expanded','false');
}
function showCard(name){
  const c=model.cards[name];if(!c)return;
  $('card-title').textContent=c.name;$('card-meta').textContent=[c.manaCost,(c.types||[]).join(' / ')].filter(Boolean).join(' · ');
  $('card-oracle').textContent=c.oracleText||'此回放中未记录此牌的牌面文字。';$('card-dialog').showModal();
}
$('open').onclick=$('landing-open').onclick=()=>$('file').click();
$('view-report').onclick=()=>switchView('report');$('view-jsonl').onclick=()=>switchView('jsonl');
$('raw-kind').onchange=$('raw-search').oninput=renderRaw;$('save-jsonl').onclick=()=>exportFile('jsonl');
$('file').onchange=e=>openFile(e.target.files[0]);
$('home').onclick=e=>{e.preventDefault();if(model){$('landing').hidden=!$('landing').hidden;$('workspace').hidden=!$('landing').hidden;}};
$('help').onclick=()=>$('help-dialog').showModal();
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('games').onclick=e=>{const b=e.target.closest('[data-game]');if(b){game=Number(b.dataset.game);selected=gameTurns()[0].id;focused=-1;renderGames();render();}};
$('turns').onclick=e=>{const b=e.target.closest('[data-turn]');if(b)chooseTurn(Number(b.dataset.turn));};
$('events').onclick=e=>{const b=e.target.closest('[data-entry]');if(b){focused=Number(b.dataset.entry);renderReading();renderBoard();}};
$('board-state').onclick=e=>{const b=e.target.closest('[data-card]');if(b)showCard(b.dataset.card);};
$('reset-state').onclick=()=>{focused=-1;renderReading();renderBoard();};
$('prev').onclick=()=>moveTurn(-1);$('next').onclick=()=>moveTurn(1);
$('detail').onclick=()=>{detailed=!detailed;$('detail').textContent=detailed?'完整记录':'精简记录';$('detail').setAttribute('aria-pressed',String(detailed));render();};
$('search').oninput=e=>{query=e.target.value.trim().toLowerCase();focused=-1;if(query){const turns=gameTurns();if(!model.turns[selected].entries.some(isShown)){const match=turns.find(t=>t.entries.some(isShown));if(match)selected=match.id;}}render();};
$('export').onclick=()=>{const v=!$('export-menu').hidden;$('export-menu').hidden=v;$('export').setAttribute('aria-expanded',String(!v));};
$('export-menu').onclick=e=>{const b=e.target.closest('[data-export]');if(b)exportFile(b.dataset.export);};
document.addEventListener('click',e=>{if(!e.target.closest('.export-wrap')){$('export-menu').hidden=true;$('export').setAttribute('aria-expanded','false');}});
document.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]'))return;if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&model){e.preventDefault();$(view==='jsonl'?'raw-search':'search').focus();}if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;if(view==='report'&&model&&e.key==='ArrowLeft')moveTurn(-1);if(view==='report'&&model&&e.key==='ArrowRight')moveTurn(1);});
document.addEventListener('dragenter',e=>{if([...e.dataTransfer.types].includes('Files')){e.preventDefault();dragCount++;$('drop').hidden=false;}});
document.addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('Files'))e.preventDefault();});
document.addEventListener('dragleave',()=>{dragCount=Math.max(0,dragCount-1);if(!dragCount)$('drop').hidden=true;});
document.addEventListener('drop',e=>{e.preventDefault();dragCount=0;$('drop').hidden=true;if(e.dataTransfer.files.length)openFile(e.dataTransfer.files[0]);});
if($('embedded-replay'))try{loadModel(JSON.parse($('embedded-replay').textContent));}catch(error){notify('内嵌战报读取失败：'+error.message,true);}
