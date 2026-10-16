import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeReport,parsePuzzlink,readPuzzle,components,branch,tupleAt,boardText,same} from '../src/model.mjs';
const report=JSON.parse(fs.readFileSync(new URL('../../tests/fixtures/legacy-v6-daily.json',import.meta.url)));
test('validates schema 6 and replays every recorded board',()=>{const d=normalizeReport(report);assert.equal(d.events.length,26);for(const e of d.events)assert.equal(boardText(d.grid,e.after),e.board_after);});
test('reconstructs every branch without hidden propagation',()=>{const d=normalizeReport(report);for(const e of d.events)for(const p of components(e)){for(let i=0;i<p.cost;i++){const b=branch(d.grid,e.before,p,tupleAt(i,p.candidate_counts));assert.ok(b.record);assert.equal(b.conflicts.size>0,b.record.status==='conflict');if(!b.conflicts.size)assert.ok(same(b.constraintEffects,b.record.direct_effects));}}});
test('original puzzle parsing and mismatch rejection',()=>{assert.deepEqual(readPuzzle('. # 2\n. . .'),[[-1,-2,2],[-1,-1,-1]]);assert.deepEqual(readPuzzle(JSON.stringify(report.puzzle)),parsePuzzlink(report.puzzle.puzzlink));assert.throws(()=>normalizeReport(report,[[-1]]),/different puzzles/);});
test('rejects wrong schema, changed pre-state, bad marks and candidate costs',()=>{for(const mutate of [r=>r.schema_version=4,r=>r.history[1].before={},r=>r.history[0].after['(1,1)']='Lamp',r=>r.history[5].candidate_counts[0]=3]){const r=structuredClone(report);mutate(r);assert.throws(()=>normalizeReport(r));}});
test('fast components share a state and duplicate-only proof remains inspectable',()=>{const d=normalizeReport(report);const e=d.events[6];assert.equal(e.components.length,3);assert.deepEqual(e.components[1].new_marks,{});for(const p of e.components){assert.ok(same(p.before,e.before));const b=branch(d.grid,e.before,p,[0]);assert.equal(b.assumed['(1,8)'],'Lamp');assert.equal(b.conflicts.size,0);}});
test('step 6 has three conflicting combinations and one surviving lamp',()=>{const d=normalizeReport(report),e=d.events[5];const b=[0,1,2,3].map(i=>branch(d.grid,e.before,e,tupleAt(i,[2,2])));assert.deepEqual(b.map(x=>x.conflicts.size>0),[true,true,true,false]);assert.equal(b[3].assumed['(2,6)'],'Lamp');assert.equal(b[3].assumed['(1,8)'],undefined);});
test('rejects overlapping proof prefixes even when total multiplicity matches',()=>{const r=structuredClone(report);r.history[5].branch_proof[1]=structuredClone(r.history[5].branch_proof[0]);assert.throws(()=>normalizeReport(r),/Overlapping/);});
import {completion,registerReplayAdapter} from '../src/model.mjs';
import {normalizeCatalog,localURL} from '../src/catalog.mjs';
const generic=(steps=[],extra={})=>({format:'akari-replay',version:2,puzzle:{grid:[[-1,-1],[-1,-1]]},steps,...extra});
test('generic actions normalize changes, corrections and narrative steps without invented proof',()=>{
 const r=normalizeReport(generic([{marks:{'(1,1)':'Lamp'}},{marks:{'(1,1)':null},note:'Undo a guess'},{marks:{'(1,2)':'Lamp','(2,1)':'Lamp'}},{note:'Done'}]));
 assert.equal(r.events.length,4);assert.equal(r.completion.solved,true);assert.equal(r.events[1].after['(1,1)'],undefined);
 assert.equal(r.events[1].removed_marks['(1,1)'],'Lamp');assert.equal(r.events[0].cost,null);assert.ok(r.events.every(e=>!e.hasProof));
 assert.deepEqual(r.events[3].changes,{});
});
test('external geometry, initial state and no-step replay are supported',()=>{
 const r=normalizeReport({format:'akari-replay',version:2,initial_marks:{'(1,1)':'Lamp'},steps:[]},[[-1]]);
 assert.equal(r.events.length,0);assert.equal(r.completion.solved,true);
 assert.throws(()=>normalizeReport({format:'akari-replay',version:2,steps:[]}),/original board/);
 assert.throws(()=>normalizeReport(generic([]),[[-1]]),/different puzzles/);
 const strict=structuredClone(report);strict.history=[{type:'search_limit',reason:'limit before first step'}];strict.complete=false;
 assert.equal(normalizeReport(strict).events.length,0);
});
test('generic replay validates marks, geometry, version and supplied transitions',()=>{
 for(const r of [generic([{marks:{'(0,1)':'Lamp'}}]),generic([{marks:{'(1,1)':'Z'}}]),generic([{marks:{'(3,1)':'Lamp'}}]),generic([{marks:{'(1,1)':'Lamp'},after:{}}]),generic([{marks:{}}]),generic([],{version:99})])assert.throws(()=>normalizeReport(r));
 assert.throws(()=>normalizeReport({format:'unknown'}),/Unsupported input/);
});
test('final coordinates adapter shows one move rather than inventing a reasoning chain',()=>{
 const r=normalizeReport({format:'akari-solution',version:2,puzzle:{grid:[[-1,-1],[-1,-1]]},lamps:[[1,1],[2,2],[1,1]],complete:true});
 assert.equal(r.events.length,1);assert.equal(Object.keys(r.events[0].new_marks).length,2);assert.equal(r.events[0].hasProof,false);assert.equal(r.completion.solved,true);
 assert.throws(()=>normalizeReport({format:'akari-solution',version:2,lamps:[[0,0]]}),/one-based/);
});
test('completion is computed independently of imported claim',()=>{
 const r=normalizeReport(generic([{marks:{'(1,1)':'Lamp','(1,2)':'Lamp'}}],{complete:true}));
 assert.equal(r.completion.solved,false);assert.equal(r.warnings.length,1);
 assert.equal(completion([[1,-1]],{'(1,2)':'Lamp'}).solved,true);
 assert.equal(completion([[0,-1]],{'(1,2)':'Lamp'}).solved,false);
});
test('optional strict proof is reused and matched to generic transitions',()=>{
 const e=report.history[0];
 const r=normalizeReport(generic([{marks:e.new_marks,proof:{format:'strict-local-v6',event:e}}],{puzzle:report.puzzle}));
 assert.equal(r.events[0].hasProof,true);assert.equal(r.events[0].components.length,5);
 const wrong=structuredClone(e);wrong.after={};
 assert.throws(()=>normalizeReport(generic([{marks:e.new_marks,proof:{format:'strict-local-v6',event:wrong}}],{puzzle:report.puzzle})),/proof does not match/);
});
test('application can register a trusted conversion adapter',()=>{
 registerReplayAdapter('test-third-party',r=>r.format==='test-third-party',(r,g)=>normalizeReport(generic(r.moves),g));
 assert.equal(normalizeReport({format:'test-third-party',moves:[{marks:{'(1,1)':'Lamp'}}]}).events.length,1);
 assert.throws(()=>registerReplayAdapter('test-third-party',()=>true,()=>{}),/duplicate/);
});
test('catalog resolves configurable defaults and same-puzzle alternatives safely',()=>{
 const base='http://127.0.0.1:8765/web/replays.json';
 const c=normalizeCatalog({version:1,defaultReplay:'b',replays:[{id:'a',title:'A',solution:'../results/a.json',puzzle:'../data/a.txt'},{id:'b',title:'B',solution:'./b.json'}]},base);
 assert.equal(c.defaultReplay,'b');assert.equal(c.replays[0].solution,'http://127.0.0.1:8765/results/a.json');
 for(const path of ['https://evil.example/x','javascript:alert(1)','//evil.example/x'])assert.throws(()=>localURL(path,base));
 assert.throws(()=>normalizeCatalog({version:1,replays:[{id:'mark',title:'Mark',solution:'mark'},{id:'mark',title:'Y',solution:'y'}]},base),/unique/);
 assert.throws(()=>normalizeCatalog({version:1,defaultReplay:'missing',replays:[{id:'mark',title:'Mark',solution:'mark'}]},base),/defaultReplay/);
});
import {clueState,cellStates} from '../src/model.mjs';
import {upgradeInput} from '../src/terminology.mjs';
test('Clue remaining values derive from adjacent Lamps without mutating original geometry',()=>{
 const grid=[[-1,-1,-1],[-1,2,-1],[-1,-1,-1]],original=JSON.stringify(grid);
 assert.deepEqual(clueState(grid,{},1,1),{kind:'Clue',original:2,remaining:2,satisfied:false});
 assert.equal(clueState(grid,{'(1,2)':'Lamp','(1,1)':'Mark'},1,1).remaining,1);
 assert.equal(clueState(grid,{'(1,2)':'Lamp','(2,1)':'Lamp'},1,1).satisfied,true);
 assert.equal(clueState(grid,{'(1,2)':'Lamp','(2,1)':'Lamp','(3,2)':'Lamp'},1,1).remaining,-1);
 assert.equal(JSON.stringify(grid),original);
});
test('Python and browser structured states match on every committed daily step',()=>{
 const d=normalizeReport(report);for(const e of report.history)assert.deepEqual(cellStates(d.grid,e.after),e.cell_states_after);
});
test('previous input versions upgrade only action values and Mark centers, exports remain canonical',()=>{
 const old=structuredClone(report);old.schema_version=5;
 const transform=v=>Array.isArray(v)?v.map(transform):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,transform(x)])):v==='Lamp'?String.fromCharCode(79):v==='Mark'?String.fromCharCode(88):typeof v==='string'?v.replace(/^mark@/,'x@'):v;
 const legacy=transform(old),d=normalizeReport(legacy);assert.equal(d.report.schema_version,6);assert.equal(d.events[0].after['(2,9)'],'Lamp');assert.ok(d.events[6].centers.every(c=>!c.startsWith('x@')));
 const basic=upgradeInput({format:'akari-replay',version:1,puzzle:{grid:[[-1]]},steps:[{marks:{'(1,1)':String.fromCharCode(79)}}]});
 assert.equal(basic.version,2);assert.equal(basic.steps[0].marks['(1,1)'],'Lamp');
});
test('Lit is not a submitted action',()=>{
 assert.throws(()=>normalizeReport({format:'akari-replay',version:2,puzzle:{grid:[[-1]]},steps:[{marks:{'(1,1)':'Lit'}}]}),/illegal mark/);
});

import {originalBoardURL} from '../src/catalog.mjs';
test('external original link preserves full geometry including numbers, walls and blank runs',()=>{
 for(const grid of [[[0,-1],[-2,4]],[[-1,-1,-1],[-1,-1,-1]],parsePuzzlink(report.puzzle.puzzlink)]){
  const url=originalBoardURL(grid);
  assert.match(url,/^https:\/\/puzz\.link\/p\?akari\//);
  assert.deepEqual(parsePuzzlink(url),grid);
 }
});

import {positionState} from '../src/model.mjs';
test('illumination overrides both historical and candidate Marks without changing actions',()=>{
 const grid=[[-1,-1,-1]],before={'(1,2)':'Mark'};
 const part={candidates:[[{ '(1,1)':'Lamp','(1,3)':'Mark'}]],branch_proof:[]};
 const b=branch(grid,before,part,[0]);
 assert.equal(b.conflicts.size,0);
 assert.deepEqual(b.state,{'(1,1)':'Lamp','(1,2)':'Lit','(1,3)':'Lit'});
 assert.deepEqual(b.effects,{'(1,1)':'Lamp','(1,3)':'Lit'});
 assert.deepEqual(b.constraintEffects,{'(1,1)':'Lamp','(1,3)':'Mark'});
 assert.deepEqual(before,{'(1,2)':'Mark'});
 assert.equal(positionState(grid,before)['(1,2)'],'Mark');
 assert.equal(cellStates(grid,{...before,'(1,1)':'Lamp'})[0][1].kind,'Lit');
 assert.equal(cellStates(grid,{...before,'(1,1)':'Lamp'})[0][1].action,'Mark');
});
