import {exploreCandidates,exploreBranch} from './pool.mjs?v=754b0258aff5fda6';
import {illuminationCounts,illuminationStrengths,puzzleCellColor} from './rendering.mjs?v=754b0258aff5fda6';
import {normalizeCatalog,originalBoardURL} from './catalog.mjs?v=754b0258aff5fda6';
import {key,coord,parsePuzzlink,readPuzzle,normalizeReport,centerInfo,components,visible,light,boardText,clueState,positionState} from './model.mjs?v=754b0258aff5fda6';
const $=id=>document.getElementById(id), NS='http://www.w3.org/2000/svg';
let data=null,position=0,phase='before',component=-1,candidateIndex=0,selectedCenter=null,selectedCell=null,proofPage=0,timer=null,imageURL=null;
let catalog=null,activeReplay=null,loadVersion=0;
const CANDIDATES_PER_PAGE=4;
const SATISFIED_IMAGE='./assets/clue-satisfied.webp';
const COLORS={mint:'#48c78e',pink:'#ffccff',blue:'#00cfff',lit:'#23adea',red:'#ff737d'};
const EXPLORE_FRAME={x:5,y:5,width:30,height:30,fill:'none',stroke:COLORS.lit,'stroke-width':1.7,'stroke-dasharray':'5 2',rx:3};
const text=(id,value)=>{$(id).textContent=value;};
function el(tag,attrs={},content=null){const n=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='class')n.className=v;else n.setAttribute(k,v);}if(content!==null)n.textContent=content;return n;}
function svgEl(tag,attrs={},content=null){const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(content!==null)n.textContent=content;return n;}
function button(label,fn,cls=''){const n=el('button',{type:'button',class:cls},label);n.onclick=fn;return n;}
const hasFinish=()=>Boolean(data?.events.length&&data.validation?.status==='valid'&&data.completion.solved&&!data.failureFrame);
const stepNumber=n=>String(n).padStart(String(data.events.length).length,'0');
const lastPosition=()=>data.events.length+(hasFinish()?1:0);
const atFinish=()=>hasFinish()&&position===lastPosition();
const event=()=>position?data.events[position-1]:null;
const finalMarks=()=>data.validEvents.at(-1)?.after||data.initialMarks;
const displayedMarks=()=>atFinish()?finalMarks():event()?(phase==='after'?event().after:event().before):data.initialMarks;
const part=()=>{const e=event();return e?components(e)[Math.max(component,0)]:null;};
const centerLabel=label=>{const c=centerInfo(label);return `${c.kind==='number'?'Number':c.kind==='mark'?'Mark':'Blank'} ${c.cell}`;};
const actionLabel=(cell,value)=>`${value} ${cell}`;
const defaultPhase=e=>e?.hasProof?'conclusion':'after';
const candidateViews=new WeakMap();
function candidatesFor(p=part()){
 if(!p?.hasProof&&!p?.branch_proof)return [];
 if(!candidateViews.has(p))candidateViews.set(p,[...exploreCandidates(data.grid,event().before,p)]
  .sort((a,b)=>(a.status==='conflict')-(b.status==='conflict')));
 return candidateViews.get(p);
}
function currentBranch(){const p=part();return exploreBranch(data.grid,event().before,p,candidatesFor(p)[candidateIndex]);}
function resetPart(){candidateIndex=0;proofPage=0;selectedCenter=null;}
function promptShowEach(){const control=$('all-components');control.textContent='Click Show each';control.classList.remove('attention');void control.offsetWidth;control.classList.add('attention');control.onanimationend=()=>{control.classList.remove('attention');if(phase!=='branch')control.textContent='Show each';control.onanimationend=null;};}
function stop(){if(timer)clearInterval(timer);timer=null;text('play','▶');$('play').setAttribute('aria-label','Play steps');}
function go(n,newPhase=null){stop();position=Math.max(0,Math.min(lastPosition(),n));phase=position?(newPhase||defaultPhase(event())):'before';component=-1;selectedCell=null;resetPart();render();}
function setPhase(next){if(!event()||(!event().hasProof&&['branch','conclusion'].includes(next)))return;stop();phase=next;if(next==='branch'&&component<0)component=0;else if(next!=='branch')component=-1;resetPart();render();}
function selectCandidate(index){stop();candidateIndex=index;proofPage=Math.floor(index/CANDIDATES_PER_PAGE);phase='branch';if(component<0)component=0;render();}
function changeBranch(delta){const n=candidatesFor().length;selectCandidate((candidateIndex+delta+n)%n);}
const BOARD_LAYERS=['cells','outline','numbers','marked','proven','explored','selection','centers','conflicts','interaction'];
function markerBadge(group,label,color,kind){
 group.append(svgEl('rect',{class:`overlay ${kind}-frame`,x:1.8,y:1.8,width:36.4,height:36.4,fill:'none',stroke:color,'stroke-width':2,rx:4}));
 group.append(svgEl('rect',{class:`overlay ${kind}-badge`,x:0,y:0,width:11,height:11,fill:color,rx:2}));
 group.append(svgEl('text',{class:`overlay ${kind}-label`,x:5.5,y:8.5,fill:'#221425','font-size':7,'text-anchor':'middle'},label));
}
function markSymbol(group,color){
 group.append(svgEl('path',{class:'mark-symbol',d:'M 16 16 L 24 24 M 24 16 L 16 24',stroke:color,'stroke-width':1.7,'stroke-linecap':'round'}));
}
function lampSymbol(group,explored=false){
 group.append(svgEl('circle',{class:'lamp-symbol',cx:20,cy:20,r:6.2,fill:explored?'none':'#fff',stroke:explored?COLORS.mint:'#ffffffbb','stroke-width':explored?1.7:1}));
}
function svgBoard(target,grid,marks,{centers=[],newMarks={},assumed={},conflicts=new Set(),scope=[],hypothesisLit=new Set(),lightingMarks=marks,stateMarks=marks,markedMarks=marks,selected=null,conclusions={},interactive=true,originalOnly=false,unorderedCenters=false}={}){
 target.replaceChildren();const rows=grid.length,cols=grid[0].length,S=40,M=23;
 target.setAttribute('viewBox',`0 0 ${cols*S+M*2} ${rows*S+M*2}`);
 for(let c=0;c<cols;c++)target.append(svgEl('text',{x:M+c*S+20,y:13,fill:'#737d89','font-size':8,'text-anchor':'middle'},c+1));
 for(let r=0;r<rows;r++)target.append(svgEl('text',{x:9,y:M+r*S+23,fill:'#737d89','font-size':8,'text-anchor':'middle'},r+1));
 const states=positionState(grid,stateMarks),markedStates=positionState(grid,markedMarks);
 const lighting=illuminationCounts(grid,lightingMarks),lightStrengths=illuminationStrengths(grid,lightingMarks),centerCells=new Map(centers.map((c,i)=>[centerInfo(c).cell,unorderedCenters?-1:i]));
 target.append(svgEl('rect',{x:M-1,y:M-1,width:cols*S+2,height:rows*S+2,fill:'#000'}));
 const layers=Object.fromEntries(BOARD_LAYERS.map(name=>[name,svgEl('g',{'data-layer':name,...(name==='interaction'?{}:{class:'overlay'})})]));
 target.append(...Object.values(layers));
 layers.outline.append(svgEl('rect',{x:M,y:M,width:cols*S,height:rows*S,fill:'none',stroke:'#fff','stroke-width':1.5}));
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
  const k=key(r,c),v=grid[r][c],x=M+c*S,y=M+r*S,mark=marks[k],state=states[k];
  const clue=v>=0?(originalOnly?{original:v,remaining:v,satisfied:false}:clueState(grid,marks,r,c)):null;
  const groups={};
  const layer=name=>{
   if(!groups[name]){groups[name]=svgEl('g',{'data-render-cell':k,transform:`translate(${x},${y})`});layers[name].append(groups[name]);}
   return groups[name];
  };
  const bg=svgEl('g',{class:'cell-background','data-background-cell':k,transform:`translate(${x},${y})`,'data-light-count':lighting.get(k)||0});
  bg.append(svgEl('rect',{class:'cell-bg',x:0,y:0,width:40,height:40,fill:v!==-1?'#000':puzzleCellColor(lightStrengths.get(k)||[],Boolean((r+c)%2)),rx:0,'shape-rendering':'crispEdges'}));
  layers.cells.append(bg);
  const hit=svgEl('g',{class:'cell-hit','data-cell':k,transform:`translate(${x},${y})`,'data-light-count':lighting.get(k)||0});
  // Interaction owns transparent hit targets only, never foreground artwork.
  hit.append(svgEl('rect',{class:'cell-hit-target',x:0,y:0,width:40,height:40,fill:'#0000'}));
  if(interactive){
   hit.setAttribute('tabindex','0');hit.setAttribute('role','button');
   hit.setAttribute('aria-label',`${k} ${v>=0?`Number remaining ${clue.remaining}, original ${v}${clue.satisfied?', satisfied':''}`:v===-2?'Wall':mark==='Lamp'?'Lamp':state==='Lit'?(hypothesisLit.has(k)?'Hypothetically Lit':'Lit'):state==='Mark'?'Mark':'Blank'}`);
   hit.onclick=()=>{selectedCell=k;const cc=centers.find(label=>centerInfo(label).cell===k);if(cc)selectedCenter=selectedCenter===cc?null:cc;renderBoard();};
   hit.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();hit.onclick();}};
   let hover=false,focus=false,highlight=null;
   const refreshHighlight=()=>{
    highlight?.remove();highlight=null;
    if(hover||focus){highlight=svgEl('rect',{class:'overlay interaction-highlight',x:1,y:1,width:38,height:38,fill:'none',stroke:focus?COLORS.blue:'#a9b2bc','stroke-width':focus?2:1.5,rx:3});layer('selection').append(highlight);}
   };
   hit.onmouseenter=()=>{hover=true;refreshHighlight();};hit.onmouseleave=()=>{hover=false;refreshHighlight();};
   hit.onfocus=()=>{focus=true;refreshHighlight();};hit.onblur=()=>{focus=false;refreshHighlight();};
  }
  layers.interaction.append(hit);
  if(v>=0){
   hit.setAttribute('data-remaining',clue.remaining);hit.setAttribute('data-original',v);
   const group=layer('numbers');
   if(clue.satisfied)group.append(svgEl('image',{class:'clue-satisfied',href:SATISFIED_IMAGE,x:4,y:4,width:32,height:32,'aria-label':'Satisfied clue'}));
   else group.append(svgEl('text',{class:'clue-remaining',x:20,y:27,fill:clue.remaining<0?COLORS.red:'#e3e5e8','font-size':25,'text-anchor':'middle'},clue.remaining));
   if(clue.remaining!==v)group.append(svgEl('text',{class:'clue-original',x:36,y:37,fill:'#c5ced6','font-size':9,'text-anchor':'end'},v));
  }else if(v===-1){
   if(markedMarks[k]==='Lamp')lampSymbol(layer('marked'));
   else if(markedMarks[k]==='Mark'&&markedStates[k]==='Mark')markSymbol(layer('marked'),'#bfc8d0');
  }
  if(conclusions[k])layer('proven').append(svgEl('text',{class:'overlay',x:31,y:12,fill:COLORS.mint,'font-size':7,'text-anchor':'end','font-weight':'bold'},conclusions[k]));
  if(newMarks[k])layer('proven').append(svgEl('rect',{class:'overlay',x:3,y:3,width:34,height:34,fill:'none',stroke:COLORS.mint,'stroke-width':2,rx:3}));
  if(hypothesisLit.has(k))layer('explored').append(svgEl('rect',{...EXPLORE_FRAME,class:'overlay hypothesis-lit'}));
  if(assumed[k]==='Lamp'){
   lampSymbol(layer('explored'),true);
   layer('explored').append(svgEl('rect',{...EXPLORE_FRAME,stroke:COLORS.mint,class:'overlay hypothesis-selection'}));
  }else if(assumed[k]==='Mark'&&state==='Mark')markSymbol(layer('explored'),COLORS.mint);
  if(scope.includes(k))layer('selection').append(svgEl('rect',{class:'overlay',x:3,y:3,width:34,height:34,fill:'none',stroke:COLORS.pink,'stroke-width':1,'stroke-dasharray':'2 3',rx:2}));
  if(selected===k)layer('selection').append(svgEl('rect',{class:'overlay',x:1,y:1,width:38,height:38,fill:'none',stroke:'#fff','stroke-width':2,rx:3}));
  if(centerCells.has(k))markerBadge(layer('centers'),centerCells.get(k)+1,COLORS.pink,'center');
  if(conflicts.has(k)||clue?.remaining<0)markerBadge(layer('conflicts'),'!',COLORS.red,'conflict');
 }
}
function renderBoard(){
 if(!data)return;
 const e=event(),p=part();let marks={...displayedMarks()},lightingMarks=marks,assumed={},conflicts=new Set(),newMarks={},conclusions={},hypothesisLit=new Set(),stateMarks=marks,markedMarks=marks;
 let centers=e?.hasProof?(component<0?e.centers:p.centers):[];
 if(e?.isDiagnostic){conflicts=new Set(e.diagnostic.conflict_cells);}
 if(e?.hasProof&&phase==='branch'){
  const b=currentBranch();assumed=b.assumed;conflicts=b.conflicts;
  // Show original marks, local assumptions, and lamps only; direct exclusions
  // are overlays, never silently converted into actual Mark actions.
  marks={...e.before,...assumed};
  lightingMarks=e.before;
  markedMarks=e.before;
  stateMarks=marks;
  const committedLit=light(data.grid,e.before);
  hypothesisLit=new Set(Object.entries(b.state).filter(([k,v])=>v==='Lit'&&!committedLit.has(k)).map(([k])=>k));
 }else if(e?.hasProof&&phase==='conclusion'){
  const proven=component<0?e.new_marks:Object.fromEntries(Object.entries(e.new_marks).filter(([k,v])=>p.conclusions[k]===v));
  stateMarks=e.after;
  conclusions=proven;
  newMarks=proven;
 }
 else if(e&&phase==='after')newMarks={...e.removed_marks,...e.new_marks};
 let scope=[];
 if(selectedCenter){const {kind,cell,position:[r,c]}=centerInfo(selectedCenter);scope=kind==='number'?[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].filter(([rr,cc])=>data.grid[rr]?.[cc]===-1).map(([rr,cc])=>key(rr,cc)):visible(data.grid,cell).filter(k=>kind!=='mark'||k!==cell);}
 svgBoard($('board'),data.grid,marks,{centers,newMarks,conclusions,assumed,conflicts,scope,hypothesisLit,lightingMarks,stateMarks,markedMarks,selected:selectedCell,unorderedCenters:e?.type==='fast_mark'});
 const states=positionState(data.grid,stateMarks);let info='Click a cell to inspect its state and visible lamp positions.';
 if(selectedCell){const[r,c]=coord(selectedCell),v=data.grid[r]?.[c];info=`${selectedCell} · ${v>=0?`Number: remaining ${clueState(data.grid,marks,r,c).remaining}, original ${v}`:v===-2?'Wall':marks[selectedCell]==='Lamp'?'Lamp'+(assumed[selectedCell]?' (hypothesis)':''):states[selectedCell]==='Lit'?(hypothesisLit.has(selectedCell)?'Hypothetically Lit':'Lit'):states[selectedCell]==='Mark'?'Mark':'Blank'}`;
  if(v===-1){const sources=visible(data.grid,selectedCell).filter(k=>lightingMarks[k]==='Lamp');info+=sources.length?` · Lit by ${sources.join(', ')}`:` · Visible white positions: ${visible(data.grid,selectedCell).length}`;}
  if(conclusions[selectedCell])info+=` · ${phase==='branch'?'Direct branch effect':'Recorded conclusion'}: ${conclusions[selectedCell]}`;
  if(conflicts.has(selectedCell))info+=' · CONFLICT: incompatible assumptions or mutually visible lamps';
 }
 text('cell-inspector',info);
 text('state-pill',atFinish()?'Completed':e?.isDiagnostic?(e.type==='error'?'ERROR · not committed':'UNVERIFIED · not committed'):!e?'Initial state':phase==='branch'?(conflicts.size?'Conflicting hypothesis':'Hypothesis · not committed'):phase==='conclusion'?'Proven · not committed':phase==='before'?'Before commit':'Committed');
 $('state-pill').className='state-pill'+(e?.isDiagnostic?(e.type==='error'?' conflict':' hypothesis'):phase==='branch'?(conflicts.size?' conflict':' hypothesis'):'');
}
function renderProof(){
 const e=event(),p=part();$('initial-content').hidden=!!e||atFinish();$('finish-content').hidden=!atFinish();$('step-content').hidden=!e?.hasProof;$('action-content').hidden=!e||e.hasProof||e.isDiagnostic;$('failure-content').hidden=!e?.isDiagnostic;
 $('step-note').hidden=!e?.note||!e?.hasProof;text('step-note',e?.note||'');
 text('rule-note',e&&!e.hasProof?'This is action playback only. No inferred centers, branch costs, or verification certificates are fabricated. The final layout is checked against basic Akari rules.':'Only selected centers and direct lamp rays are used. Imported verification is recorded evidence, with live state and forced-mark checks; minimality is not checked.');
 if(atFinish()){
  text('proof-title','Every light in place.');text('cost-value','—');
  text('proof-intro','The puzzle is complete. Every white cell is illuminated.');
  const marks=finalMarks(),lamps=Object.values(marks).filter(v=>v==='Lamp').length;
  text('finish-summary',`${data.validEvents.length} steps · ${lamps} lamps · ${data.completion.lit} / ${data.completion.whiteCount} white cells lit`);
  text('rule-note','Final board checked: all white cells are illuminated, lamps do not see each other, and every Number is satisfied.');
  return;
 }
 if(!e){text('proof-title','Start with a blank board.');text('proof-intro','Replay recorded actions. Enumeration tools appear only where proof data is supplied.');text('cost-value','—');return;}
 if(e.isDiagnostic){
  text('proof-title',e.type==='error'?'This replay contains an error.':'Verification could not finish.');text('cost-value','—');
  text('proof-intro','Playback ends on this diagnostic frame. Later input has not been accepted.');
  text('failure-source',e.source_step===0?'INVALID / UNVERIFIED INITIAL STATE':`INPUT STEP ${e.source_step}`);
  text('failure-reason',e.diagnostic.message);text('failure-preview-note',e.diagnostic.previewNote);
  text('rule-note',e.type==='error'?'This is the rejected state, not a valid commit. The red replay warning remains visible even while viewing earlier frames.':'Validation limits do not prove the input wrong. This frame is unverified, and no later frames are accepted.');
  $('failure-actions').replaceChildren();text('failure-action-count',Object.keys(e.changes).length);
  for(const[k,v]of Object.entries(e.changes))$('failure-actions').append(button(`${v===null?'Remove':v==='Lamp'?'Lamp':'Mark'} ${k}`,()=>{selectedCell=k;renderBoard();},'mark-chip'));
  text('failure-input',e.diagnostic.rawInput);return;
 }
 if(!e.hasProof){
  text('proof-title',e.title||'A recorded move.');text('cost-value','—');
  text('proof-intro','Action-only replay · no proof supplied');
  text('action-note',e.note||'Inspect the board before and after this recorded action.');
  $('action-list').replaceChildren();const changes=e.changes||e.new_marks;
  text('action-count',`${Object.keys(changes).length} changes`);
  for(const[k,v]of Object.entries(changes))$('action-list').append(button(`${v===null?'Remove':v==='Lamp'?'Lamp':'Mark'} ${k}`,()=>{selectedCell=k;renderBoard();},'mark-chip'));
  return;
 }
 text('proof-title',e.type==='fast_mark'?'Independent. Then together.':'A fact in every possibility.');text('cost-value',e.cost);
 text('proof-intro',e.type==='fast_mark'?`${e.component_count} independent result${e.component_count===1?'':'s'}, each cost 1, evaluated against the same before-state. Duplicate actions are removed before one batch commit.`:`${p.centers.length} enumeration center${p.centers.length===1?'':'s'}. Only local candidates and direct lamp rays are considered. No hidden follow-up deduction.`);
 const exploring=phase==='branch';
 $('component-section').hidden=e.type!=='fast_mark';$('component-list').replaceChildren();
 if(e.type==='fast_mark')components(e).forEach((c,i)=>{$('component-list').append(button(`${i+1} · ${c.centers.map(centerLabel).join(' + ')}`,()=>{if(!exploring){promptShowEach();return;}stop();component=i;resetPart();render();},component===i&&exploring?'active':''));});
 text('all-components',exploring?'Show batch':'Show each');
 $('all-components').classList.toggle('active',exploring?component<0:false);
 $('branch-section').hidden=!exploring;
 $('result-section').hidden=exploring;
 $('center-list').replaceChildren();
 const shown=component<0&&e.type==='fast_mark'?components(e):[p];
 shown.forEach((q,qi)=>q.centers.forEach((c,i)=>{
  const b=button('',()=>{if(e.type==='fast_mark'&&component<0){component=qi;resetPart();}selectedCenter=selectedCenter===c?null:c;render();},'center-card'+(selectedCenter===c?' active':''));
  b.append(el('span',{class:'center-id'},e.type==='fast_mark'?0:component<0?shown.slice(0,qi).reduce((n,c)=>n+c.centers.length,0)+i+1:i+1));const desc=el('span');desc.append(el('strong',{},centerLabel(c)),el('small',{},centerInfo(c).kind==='number'?'Adjacent white cells only':'Unobstructed row and column only'));b.append(desc,el('span',{class:'count'},`${q.candidate_counts[i]} option${q.candidate_counts[i]===1?'':'s'}`));$('center-list').append(b);
 }));
 const costExpression=(component<0?e:p).cost_expression;
 text('cost-formula',costExpression??'');$('cost-formula').hidden=!costExpression;
 const records=candidatesFor(p),count=records.length,compatible=records.filter(r=>r.status==='compatible').length;
 const pool=p.candidate_pool||[...new Set(records.flatMap(r=>Object.keys(r.assumptions)))];
 text('candidate-summary',`${pool.length} positions · ${count} candidates · ${compatible} compatible · Brain cost ${p.cost}`);
 text('branch-position',`${candidateIndex+1} / ${count}`);
 const b=currentBranch(),bad=b.conflicts.size>0;
 $('candidate-controls').replaceChildren();
 for(const cell of pool){
  const value=b.assumed[cell];
  const chip=button(value?actionLabel(cell,value):`Blank ${cell}`,()=>{selectedCell=cell;renderBoard();},'pool-cell');
  chip.setAttribute('data-pool-cell',cell);$('candidate-controls').append(chip);
 }
 text('branch-verdict',bad?'× Direct conflict':'✓ Compatible local assumptions');$('branch-verdict').className=bad?'bad':'good';
 text('branch-reason',bad?`Conflict at ${[...b.conflicts].join(', ')}. These assignments cannot coexist.`:'Satisfies the selected local constraints. Other constraints are not used to filter these candidates.');
 $('branch-prev').disabled=count<=1;$('branch-next').disabled=count<=1;
 const pageSize=CANDIDATES_PER_PAGE,pageCount=Math.max(1,Math.ceil(count/pageSize));proofPage=Math.max(0,Math.min(proofPage,pageCount-1));$('branch-list').replaceChildren();
 records.slice(proofPage*pageSize,(proofPage+1)*pageSize).forEach((record,j)=>{
  const index=proofPage*pageSize+j,valid=record.status==='compatible';
  const btn=button('',()=>selectCandidate(index),'branch-record'+(valid?'':' rejected')+(candidateIndex===index?' selected':''));
  btn.dataset.candidateIndex=index;btn.dataset.status=record.status;btn.setAttribute('aria-pressed',String(candidateIndex===index));
  btn.append(el('strong',{},`${valid?'✓':'×'} Candidate ${index+1}`),el('span',{},Object.entries(record.assumptions).map(([k,v])=>actionLabel(k,v)).join(', ')));
  $('branch-list').append(btn);
 });
 $('proof-prev').disabled=proofPage===0;$('proof-next').disabled=proofPage>=pageCount-1;text('proof-page',`${proofPage+1} / ${pageCount} candidate pages`);
 const groupView=component<0, display=groupView?e.new_marks:Object.fromEntries(Object.entries(e.new_marks).filter(([k,v])=>p.conclusions[k]===v));text('marks-heading',groupView?'Marks to commit':'This result proposes');text('mark-count',`${Object.keys(display).length} action${Object.keys(display).length===1?'':'s'}`);$('mark-list').replaceChildren();
 for(const[k,v]of Object.entries(display)){$('mark-list').append(button(actionLabel(k,v),()=>{selectedCell=k;renderBoard();},'mark-chip'));}
 let note='Lighting is automatic; lit cells hide the Mark symbol.';
 if(!groupView&&e.type==='fast_mark'){const d=Object.keys(p.duplicate_marks||{}),r=Object.keys(p.redundant_marks||{});note=`Unique contribution: ${Object.keys(p.new_marks).length}. ${d.length?`Duplicate actions: ${d.join(', ')}. `:''}${r.length?`Omitted marks lit by this batch: ${r.join(', ')}.`:''}`;}
 text('dedup-note',note);text('audit-summary',`Live validation: ${e.live_verification?.mode||'not checked'}; no optimality test. Recorded verifier: ${e.verification?.method||'not provided'}. Checked actions: ${e.verification?.checked_actions??'unknown'}. Live checks validate necessity and supplied proof; they do not test minimal cost.`);
 text('audit-json',JSON.stringify({centers:p.centers,candidate_counts:p.candidate_counts,cost:p.cost,selected_proof:b.record,proof_intersection:p.conclusions,...(e.type==='fast_mark'?{duplicate_marks:p.duplicate_marks,redundant_marks:p.redundant_marks}:{})},null,2));
}
function render(){
 if(!data)return;const e=event();text('board-kicker',atFinish()?'REPLAY COMPLETE':e?`STEP ${stepNumber(position)} / ${data.events.length}`:'ORIGINAL PUZZLE');text('board-title',atFinish()?'Puzzle complete':e?(e.type==='fast_mark'?'Fast mark':e.hasProof?'Brain step':e.title||'Action step'):'Before the first mark');
 document.querySelectorAll('[data-phase]').forEach(b=>{b.disabled=!e||e.isDiagnostic||(!e.hasProof&&['branch','conclusion'].includes(b.dataset.phase));b.classList.toggle('active',b.dataset.phase===phase);b.setAttribute('aria-pressed',String(b.dataset.phase===phase));});
 $('play').disabled=!data.events.length;$('start').disabled=!data.events.length;$('first').disabled=position===0;$('prev').disabled=position===0;$('next').disabled=position===lastPosition();text('step-counter',atFinish()?'Done':`${stepNumber(position)} / ${data.events.length}`);$('scrubber').max=lastPosition();$('scrubber').value=position;
 const actual=displayedMarks();
 text('progress-label',`${Object.values(actual).filter(v=>v==='Lamp').length} lamps · ${Object.values(actual).filter(v=>v==='Mark').length} marks · ${light(data.grid,actual).size} lit`);
 for(const b of $('timeline').children){const i=+b.dataset.index;b.classList.toggle('active',i===position);b.classList.toggle('past',i<position);b.setAttribute('aria-current',i===position?'step':'false');}
 renderProof();renderBoard();
}
function mount(parsed, reference=null){
 stop();data={...parsed,validEvents:parsed.events,events:[...parsed.events,...(parsed.failureFrame?[parsed.failureFrame]:[])]};position=parsed.failureFrame&&!parsed.events.length?1:0;phase=position?defaultPhase(data.events[position-1]):'before';component=-1;selectedCell=null;selectedCenter=null;proofPage=0;resetPart();$('error').hidden=true;
 const validation=data.validation;document.body.classList.toggle('invalid-replay',validation?.status==='invalid');document.body.classList.toggle('unverified-replay',validation?.status==='unverified');
 $('validation-banner')?.remove();
 if(validation&&validation.status!=='valid'){
  const banner=el('section',{id:'validation-banner',role:'status'});
  banner.append(el('strong',{id:'validation-status'},validation.status==='unverified'?'Verification incomplete':'Invalid solution / record'));
  banner.append(el('p',{id:'validation-message'},validation.error?`${validation.error.step===0?'Initial state':'Step '+validation.error.step}: ${validation.error.message} Last valid frame: ${validation.lastValidStep}.`:'Verification has not completed.'));
  const actions=el('div',{class:'validation-actions'});
  const last=button('Go to last valid frame',()=>go(data.validation.lastValidStep),'outlined');last.id='last-valid';actions.append(last);
  if(data.failureFrame){const failure=button(validation.status==='unverified'?'Show unverified frame':'Show error frame',()=>go(data.events.length),'outlined');failure.id='show-failure';actions.append(failure);}
  banner.append(actions);document.querySelector('.workspace').before(banner);
 }

 const p=data.report.puzzle||{};text('format-label',data.format==='strict-local-v8'?'PROOF V8':data.format==='strict-local-v7'?'PROOF V7 (legacy)':data.format==='strict-local-v6'?'PROOF V6 (legacy)':'ACTION V2');$('export-actions').disabled=false;text('puzzle-meta',`${p.dailyNumber!=null?'No. '+p.dailyNumber:data.report.title||p.title||'Imported puzzle'}  ·  ${p.dateKey||'Local replay'}  ·  ${data.grid[0].length} × ${data.grid.length}  ·  ${data.events.length} steps${p.author?'  ·  by '+p.author:''}`);
 $('timeline').replaceChildren(button('0',()=>go(0),'active'));$('timeline').firstChild.dataset.index=0;
 data.events.forEach((e,i)=>{const b=button('',()=>go(i+1),e.isDiagnostic?(e.type==='error'?'error-frame':'unverified-frame'):e.type==='fast_mark'?'fast':'');b.dataset.index=i+1;b.setAttribute('aria-label',`Step ${i+1}, ${e.isDiagnostic?(e.type==='error'?'error frame':'unverified frame'):e.type==='fast_mark'?'fast mark':e.hasProof?'brain cost '+e.cost:'action'}`);b.append(el('strong',{},e.isDiagnostic?'!':e.type==='fast_mark'?'ϟ':e.hasProof?e.cost:'·'),el('span',{},stepNumber(i+1)));$('timeline').append(b);});
 if(hasFinish()){
  const finish=button('',()=>go(lastPosition()),'finish-frame');finish.dataset.index=lastPosition();finish.setAttribute('aria-label','Show completed puzzle');finish.append(el('strong',{},'✓'),el('span',{},'End'));$('timeline').append(finish);
 }
 text('terminal-note',[...data.warnings,data.terminal?`Replay ends: ${data.terminal.type} — ${data.terminal.reason||''}`:data.completion.solved?'Final layout satisfies Akari rules. This does not certify each action as logically forced.':'Partial or invalid final layout: not all Akari rules are satisfied.'].join(' '));
 if(imageURL)URL.revokeObjectURL(imageURL);imageURL=reference?URL.createObjectURL(reference):null;
 $('original-board').href=originalBoardURL(data.grid);
 $('original-board').hidden=false;
 $('reference-image-link').hidden=!imageURL;
 if(imageURL)$('reference-image-link').href=imageURL;
 else $('reference-image-link').removeAttribute('href');
 render();
}
function validateInput(report,grid=null){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./validation-worker.mjs?v=754b0258aff5fda6',import.meta.url),{type:'module'});
  const timeout=setTimeout(()=>{worker.terminate();reject(new Error('Validation worker timed out; no unverified replay was loaded.'));},15000);
  const done=()=>{clearTimeout(timeout);worker.terminate();};
  worker.onmessage=({data})=>{done();if(data.error)reject(new Error(data.error));else resolve(data.result);};
  worker.onerror=()=>{done();reject(new Error('Replay validation worker failed.'));};
  worker.postMessage({report,grid});
 });
}
async function resource(url,limit=25*1024*1024){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(url,{cache:'no-cache',signal:controller.signal});
  if(!response.ok)throw new Error(`Cannot load ${new URL(url).pathname}: HTTP ${response.status}`);
  if(+response.headers.get('content-length')>limit)throw new Error('Configured file exceeds size limit.');
  const blob=await response.blob();if(blob.size>limit)throw new Error('Configured file exceeds size limit.');return blob;
 }catch(error){
  if(controller.signal.aborted)throw new Error(`Loading ${new URL(url).pathname} timed out. Reload catalog to retry.`);
  throw error;
 }finally{clearTimeout(timeout);}
}
async function referenceFile(file){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Reference must be PNG/JPEG/WebP.');
 if(file.size>20*1024*1024)throw new Error('Reference image exceeds 20 MB.');
 const bitmap=await createImageBitmap(file);const pixels=bitmap.width*bitmap.height;bitmap.close();
 if(pixels>40000000)throw new Error('Reference image exceeds 40 megapixels.');return file;
}
async function loadReplay(id){
 const entry=catalog?.replays.find(e=>e.id===id);if(!entry)throw new Error('Unknown replay ID.');
 const version=++loadVersion;stop();text('catalog-status',`Loading ${entry.title}...`);
 try{
  const [file,puzzle,image]=await Promise.all([resource(entry.solution),entry.puzzle?resource(entry.puzzle,20*1024*1024):null,entry.reference?resource(entry.reference,20*1024*1024):null]);
  const parsed=await validateInput(JSON.parse(await file.text()),puzzle?readPuzzle(await puzzle.text()):null);
  const ref=image?await referenceFile(image):null;if(version!==loadVersion)return;
  mount(parsed,ref);activeReplay=id;$('replay-select').value=id;text('catalog-status',`${entry.puzzleTitle?entry.puzzleTitle+' / ':''}${entry.title}`);
  const url=new URL(location.href);url.searchParams.set('replay',id);history.replaceState(null,'',url);
 }catch(e){if(version!==loadVersion)return;$('replay-select').value=activeReplay||'';text('catalog-status',e.message);throw e;}
}
async function loadCatalog(){
 const baseURL=new URL('./replays.json',location.href).href;
 const next=normalizeCatalog(JSON.parse(await (await resource(baseURL,1024*1024)).text()),baseURL);
 catalog=next;$('replay-select').replaceChildren();
 for(const entry of catalog.replays)$('replay-select').append(el('option',{value:entry.id},`${entry.puzzleTitle?entry.puzzleTitle+' / ':''}${entry.title}`));
 $('replay-select').disabled=false;
 const requested=new URL(location.href).searchParams.get('replay');
 const chosen=catalog.replays.some(e=>e.id===requested)?requested:catalog.defaultReplay;
 await loadReplay(chosen);
}
async function example(){if(!catalog)await loadCatalog();else await loadReplay(catalog.defaultReplay);}
$('replay-select').onchange=()=>loadReplay($('replay-select').value).catch(()=>{});
$('catalog-reload').onclick=()=>loadCatalog().catch(e=>text('catalog-status',e.message));
$('export-actions').onclick=()=>{
 const {puzzlink,grid,...metadata}=data.report.puzzle||{};
 const output={format:'akari-replay',version:2,puzzle:{...metadata,grid:data.grid},complete:data.completion.solved,steps:data.validEvents.map(e=>{
  const marks={};for(const k of Object.keys(e.before))if(!(k in e.after))marks[k]=null;
  for(const[k,v]of Object.entries(e.after))if(e.before[k]!==v)marks[k]=v;
  return {marks,...(e.title?{title:e.title}:{}),...(e.note?{note:e.note}:{})};
 })};
 if(data.report.title)output.title=data.report.title;
 if(Object.keys(data.initialMarks).length)output.initial_marks=data.initialMarks;
 const url=URL.createObjectURL(new Blob([JSON.stringify(output,null,2)],{type:'application/json'}));
 const a=el('a',{href:url,download:'akari-actions.json'});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('failure-back').onclick=()=>go(data.validation.lastValidStep);
$('restart').onclick=()=>go(0);
$('first').onclick=()=>go(0);$('prev').onclick=()=>go(position-1);$('next').onclick=()=>go(position+1);$('start').onclick=()=>go(1);$('scrubber').oninput=()=>go(+$('scrubber').value);
$('play').onclick=()=>{if(!data?.events.length)return;if(timer){stop();return;}if(position===lastPosition())go(0);text('play','Ⅱ');$('play').setAttribute('aria-label','Pause playback');timer=setInterval(()=>{if(position===lastPosition()){stop();return;}position++;phase=defaultPhase(event());component=-1;selectedCell=null;resetPart();render();if(position===lastPosition())stop();},+$('speed').value);};$('speed').onchange=stop;
document.querySelectorAll('[data-phase]').forEach(b=>b.onclick=()=>setPhase(b.dataset.phase));
$('all-components').onclick=()=>{stop();if(phase==='branch'){component=-1;phase='conclusion';}else{component=0;phase='branch';}resetPart();render();};$('branch-prev').onclick=()=>changeBranch(-1);$('branch-next').onclick=()=>changeBranch(1);$('proof-prev').onclick=()=>{proofPage--;renderProof();};$('proof-next').onclick=()=>{proofPage++;renderProof();};
$('clear-cell').onclick=()=>{selectedCell=null;selectedCenter=null;render();};
$('original-board').onclick=stop;
$('reference-image-link').onclick=stop;

$('import-open').onclick=()=>{stop();text('import-error','');$('import-dialog').showModal();};$('import-close').onclick=()=>$('import-dialog').close();$('help-open').onclick=()=>{stop();$('help-dialog').showModal();};$('help-close').onclick=()=>$('help-dialog').close();
$('load-example').onclick=async()=>{try{await example();$('import-dialog').close();}catch(e){text('import-error',e.message);}};
$('import-form').onsubmit=async ev=>{ev.preventDefault();text('import-error','');const submit=ev.submitter;if(submit)submit.disabled=true;try{
 const file=$('report-file').files[0],original=$('puzzle-file').files[0];if(!file)throw new Error('Choose a solver JSON file.');if(file.size>25*1024*1024||original?.size>20*1024*1024)throw new Error('Files too large (report: 25 MB, original: 20 MB).');
 const report=JSON.parse(await file.text());let grid=null,image=null;
 if(original){if(['image/png','image/jpeg','image/webp'].includes(original.type)){const bitmap=await createImageBitmap(original);if(bitmap.width*bitmap.height>40000000){bitmap.close();throw new Error('Reference image exceeds 40 megapixels.');}bitmap.close();image=original;}else if(/\.(json|txt)$/i.test(original.name))grid=readPuzzle(await original.text());else throw new Error('Original file must be JSON/text or PNG/JPEG/WebP. SVG uploads are not executed.');}
 text('import-error','Validating replay...');const parsed=await validateInput(report,grid);loadVersion++;mount(parsed,image);activeReplay=null;$('replay-select').value='';text('catalog-status','Local file import (not saved to catalog)');history.replaceState(null,'',location.pathname);$('import-dialog').close();
 }catch(e){text('import-error',e.message);}finally{if(submit)submit.disabled=false;}};
document.addEventListener('keydown',e=>{if(!data||document.querySelector('dialog[open]')||e.target.closest('input,select,textarea,button,[role="button"]'))return;if(e.key==='ArrowRight'){e.preventDefault();go(position+1);}else if(e.key==='ArrowLeft'){e.preventDefault();go(position-1);}else if(e.code==='Space'){e.preventDefault();$('play').click();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
await loadCatalog().catch(e=>{text('catalog-status',e.message);if(!catalog)$('replay-select').replaceChildren(el('option',{},'Loading failed'));text('error',e.message);$('error').hidden=false;$('import-dialog').showModal();});
