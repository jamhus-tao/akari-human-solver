import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {validateReplay} from '../src/validation.mjs';
import {ExactCheck} from '../src/verify.mjs';
import {completion} from '../src/model.mjs';
const report=JSON.parse(fs.readFileSync(new URL('../../tests/fixtures/legacy-v6-daily.json',import.meta.url)));
const actions=(grid,steps,extra={})=>({format:'akari-replay',version:2,puzzle:{grid},steps,...extra});
test('live validation accepts daily proof with no minimum-cost test',()=>{const r=validateReplay(report);assert.equal(r.validation.status,'valid');assert.equal(r.events.length,26);assert.equal(r.validation.optimalityChecked,false);});
test('first invalid action truncates all later frames even if later corrected',()=>{const r=validateReplay(actions([[-1,-1],[-1,-1]],[{marks:{'(1,1)':'Lamp'}},{marks:{'(1,2)':'Lamp'}},{marks:{'(1,2)':null}}]));assert.equal(r.events.length,1);assert.equal(r.validation.error.step,2);assert.match(r.validation.error.message,/see each other/);});
test('invalid first frame retains initial board and no invalid actions',()=>{const r=validateReplay(actions([[0,-1]],[{marks:{'(1,2)':'Lamp'}}]));assert.equal(r.events.length,0);assert.equal(r.validation.status,'invalid');assert.deepEqual(r.initialMarks,{});});
test('local unreachable lighting and impossible clues are rejected',()=>{const r=validateReplay(actions([[-1,-1]],[{marks:{'(1,1)':'Mark'}},{marks:{'(1,2)':'Mark'}}]));assert.equal(r.events.length,1);assert.match(r.validation.error.message,/illuminated/);});
test('malformed later record keeps prefix',()=>{const r=validateReplay(actions([[-1,-1],[-1,-1]],[{marks:{'(1,1)':'Lamp'}},{marks:{'(0,1)':'Mark'}}]));assert.equal(r.events.length,1);assert.equal(r.validation.error.step,2);});
test('missing all optional proof metadata and evidence details still works',()=>{const p=structuredClone(report);delete p.statistics;delete p.inference_model;delete p.grouping;delete p.complete;delete p.status;
 for(const e of p.history){for(const k of ['before','after','step','cost','conclusions','facts_before','facts_after','verification','board_after','search'])delete e[k];
  for(const c of e.components||[e])for(const k of ['before','facts_before','candidate_counts','branch_proof','cost','conclusions','verification','compatible_combinations'])delete c[k];}
 const r=validateReplay(p);assert.equal(r.validation.status,'valid');assert.equal(r.events.length,26);assert.equal(r.events[0].hasProof,true);
});
test('missing centers/candidates degrades display but still checks forced marks',()=>{const p=structuredClone(report);delete p.history[0].components;const r=validateReplay(p);assert.equal(r.validation.status,'valid');assert.equal(r.events[0].hasProof,false);assert.match(r.warnings[0],/missing/);});
test('fabricated incomplete domain rejected even if selected move is a solution',()=>{const p={schema_version:6,puzzle:{grid:[[-1,-1]]},history:[{type:'brain',new_marks:{'(1,1)':'Lamp'},centers:['empty@(1,1)'],candidates:[[{ '(1,1)':'Lamp'}]]}]};const r=validateReplay(p);assert.equal(r.events.length,0);assert.match(r.validation.error.message,/candidates/);});
test('strict claim without proof cannot disguise a guess',()=>{const p={schema_version:6,puzzle:{grid:[[-1,-1]]},history:[{type:'brain',new_marks:{'(1,1)':'Lamp'}}]};const r=validateReplay(p);assert.equal(r.events.length,0);assert.match(r.validation.error.message,/not forced/);});
test('wrong branch verdict keeps preceding valid proof frames',()=>{const p=structuredClone(report);p.history[5].branch_proof[0].status='compatible';const r=validateReplay(p);assert.equal(r.events.length,5);assert.match(r.validation.error.message,/verdict/);});
test('completion failure rejects last incomplete frame but partial file is allowed',()=>{const steps=[{marks:{'(1,1)':'Lamp'}}];assert.equal(validateReplay(actions([[-1,-1],[-1,-1]],steps)).events.length,1);assert.equal(validateReplay(actions([[-1,-1],[-1,-1]],steps,{complete:true})).events.length,0);});
test('snapshot-only action and no notes derive before/actions correctly',()=>{const r=validateReplay(actions([[-1,-1],[-1,-1]],[{after:{'(1,1)':'Lamp'}},{after:{'(1,1)':'Lamp','(2,2)':'Lamp'}}]));assert.equal(r.validation.status,'valid');assert.equal(r.completion.solved,true);});
test('budget exhaustion is not labeled invalid or silently accepted',()=>{const r=validateReplay(report,null,{maxWork:1});assert.equal(r.validation.status,'unverified');assert.equal(r.events.length,0);});
test('independent exact solver agrees with exhaustive small-board lamp assignments',()=>{
 for(const grid of [[[-1,-1],[-1,-1]],[[0,-1],[-1,-1]],[[-1,1,-1],[-1,-1,-1]]]){
 const check=new ExactCheck(grid),cells=[...check.ids.keys()];let count=0;
 for(let bits=0;bits<2**cells.length;bits++){const marks=Object.fromEntries(cells.map((k,i)=>[k,bits&(1<<i)?'Lamp':'Mark']));const result=check.solution(marks);assert.equal(Boolean(result),completion(grid,marks).solved);if(result)count++;}
 assert.ok(count>0);
 }
});
test('global contradiction without immediate rule conflict is detected',()=>{const r=validateReplay(actions([[-1,-1,-1],[1,-1,-1],[-1,-1,0]],[]));assert.equal(r.validation.error.step,0);assert.match(r.validation.error.message,/no legal complete solution/);});
test('missing branch multiplicity, status and direct effects are derived',()=>{const p=structuredClone(report);for(const e of p.history)for(const c of e.components||[e])for(const b of c.branch_proof){delete b.status;delete b.multiplicity;delete b.direct_effects;}const r=validateReplay(p);assert.equal(r.validation.status,'valid');});
test('incorrect initial coordinates cannot leak into display',()=>{const r=validateReplay(actions([[-1]],[],{initial_marks:{'(2,1)':'Lamp'}}));assert.equal(r.validation.status,'invalid');assert.deepEqual(r.initialMarks,{});});
test('annotation-only frames and explicit no-op frames remain playable',()=>{const r=validateReplay(actions([[-1,-1]], [{note:'Before placing anything'},{marks:{}},{marks:{'(1,1)':'Lamp'}}]));assert.equal(r.validation.status,'valid');assert.equal(r.events.length,3);});
test('diagnostic terminal preserves attempted bad state separately from valid prefix',()=>{const r=validateReplay(actions([[-1,-1],[-1,-1]],[{marks:{'(1,1)':'Lamp'}},{marks:{'(1,2)':'Lamp'}},{marks:{'(1,2)':null}}]));assert.equal(r.events.length,1);assert.equal(r.failureFrame.step,2);assert.equal(r.failureFrame.type,'error');assert.equal(r.failureFrame.after['(1,2)'],'Lamp');assert.equal(r.events[0].after['(1,2)'],undefined);assert.ok(r.failureFrame.diagnostic.conflict_cells.includes('(1,1)'));});
test('invalid coordinates are omitted in diagnostic preview with explicit disclosure',()=>{const r=validateReplay(actions([[-1]],[{marks:{'(2,1)':'Lamp','(1,1)':'Lamp'}}]));assert.equal(r.failureFrame.diagnostic.previewPartial,true);assert.deepEqual(r.failureFrame.after,{'(1,1)':'Lamp'});assert.ok(r.failureFrame.diagnostic.omittedMarks.includes('(2,1)'));});
test('initial failure and validation limit produce different diagnostic types',()=>{const bad=validateReplay(actions([[-1]],[],{initial_marks:{'(2,1)':'Lamp'}}));assert.equal(bad.failureFrame.step,1);assert.equal(bad.failureFrame.source_step,0);assert.equal(bad.failureFrame.type,'error');const limit=validateReplay(report,null,{maxWork:1});assert.equal(limit.failureFrame.type,'unverified');});
test('previous action input upgrades before live validation, including Mark centers in full proof',()=>{
 const convert=v=>Array.isArray(v)?v.map(convert):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,convert(x)])):v==='Lamp'?String.fromCharCode(79):v==='Mark'?String.fromCharCode(88):typeof v==='string'?v.replace(/^mark@/,'x@'):v;
 const old=convert(structuredClone(report));old.schema_version=5;
 const checked=validateReplay(old);assert.equal(checked.validation.status,'valid');assert.equal(checked.report.schema_version,6);assert.equal(checked.events[0].new_marks['(2,9)'],'Lamp');
});
