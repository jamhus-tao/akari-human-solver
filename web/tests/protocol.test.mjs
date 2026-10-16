import {candidateBranch,pooledCandidates} from '../src/pool.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {validateReplay} from '../src/validation.mjs';
import {components,same} from '../src/model.mjs';
const root=new URL('../../',import.meta.url);
const read=name=>JSON.parse(fs.readFileSync(new URL(name,root)));
const simple=()=>({schema_version:7,puzzle:{grid:[[0,-1],[-1,-1]]},steps:[
 {actions:{'(1,2)':'Mark','(2,1)':'Mark'},proofs:[['(1,1)']]},
 {actions:{'(2,2)':'Lamp'},proofs:[['(1,2)'],['(2,1)'],['(2,2)']]}
]});

test('v8 replays both Python solver traces with identical actions, costs, candidate sets and completion',()=>{
 for(const date of ['2026-10-15','2026-10-16']){
  const report=read(`results/daily-${date}.json`),r=validateReplay(report);
  const trace=JSON.parse(execFileSync('python3',['-B','-c',
   `import json; from akari_solver import AkariHumanSolver,parse_puzzlink; d=json.load(open('data/daily-${date}.json')); s=AkariHumanSolver(parse_puzzlink(d['puzzlink'])); print(json.dumps(s.solve()))`],{cwd:root,encoding:'utf8'}));
  assert.equal(r.validation.status,'valid');assert.equal(r.completion.solved,true);
  assert.equal(r.format,'strict-local-v8');assert.equal(r.events.length,trace.length);
  for(const[i,e]of r.events.entries()){
   const python=trace[i];assert.equal(e.type,python.type);assert.equal(e.cost,python.cost);assert.equal(e.total_cost,python.total_cost);
   assert.ok(same(e.new_marks,report.steps[i].actions));assert.ok(same(e.after,python.after));
   for(const[j,part]of components(e).entries()){
    const other=components(python)[j];assert.deepEqual(part.centers,other.centers);
    assert.deepEqual(part.candidate_pool,other.candidate_pool);assert.equal(part.candidate_count,other.candidate_count);assert.ok(same(part.conclusions,other.conclusions));
    assert.deepEqual(part.new_marks,other.new_marks);
    assert.ok(part.candidate_count<=part.cost);
    assert.equal(new Set(part.branch_proof.map(p=>JSON.stringify(p.assumptions))).size,part.candidate_count);
    for(const record of part.branch_proof){
     const pythonRecord=other.branch_proof.find(p=>same(p.assumptions,record.assumptions));
     assert.ok(pythonRecord);assert.equal(record.status,pythonRecord.status);
     const b=candidateBranch(r.grid,e.before,record.assumptions);
     if(b.conflicts.size)continue;
     assert.deepEqual(b.effects,pythonRecord.direct_effects);
     assert.deepEqual(b.constraintEffects,pythonRecord.constraint_effects);
     for(const k of b.lit)if(!b.lamps.has(k)){
      assert.equal(b.state[k],'Lit');assert.notEqual(b.effects[k],'Mark');
     }
    }
   }
  }
 }
});

test('v7 has one action field and rejects alternative truths even if they agree',()=>{
 const r=simple();assert.equal(validateReplay(r).validation.status,'valid');
 for(const field of ['conclusions','new_marks','before','after','cost','type','candidates','step','component_count']){
  const bad=simple();bad.steps[0][field]={};const result=validateReplay(bad);
  assert.equal(result.validation.status,'invalid');assert.match(result.validation.error.message,/unexpected field/);assert.equal(result.events.length,0);
 }
 for(const field of ['history','complete','status','statistics','explicit_marks','logical_facts','final','inference_model']){
  assert.throws(()=>validateReplay({...r,[field]:{}}),/unexpected field/);
 }
 assert.throws(()=>validateReplay({...r,puzzle:{...r.puzzle,puzzlink:'akari/2/2/0i'}}),/exactly one/);
});

test('v7 enforces exact action equality, filters same-batch lit Marks and keeps a valid prefix',()=>{
 const lamp={schema_version:7,puzzle:{grid:[[0,-1,-1],[-2,-2,1]]},steps:[{actions:{'(1,3)':'Lamp'},proofs:[['(1,1)'],['(2,3)']]}]};
 assert.equal(validateReplay(lamp).validation.status,'valid');
 lamp.steps[0].actions['(1,2)']='Mark';assert.match(validateReplay(lamp).validation.error.message,/after removing lit Marks/);
 const missing=simple();delete missing.steps[0].actions['(1,2)'];assert.match(validateReplay(missing).validation.error.message,/no extra or missing/);
 const bad=simple();bad.steps[1].actions['(2,2)']='Mark';const out=validateReplay(bad);
 assert.equal(out.events.length,1);assert.equal(out.failureFrame.source_step,2);
 assert.deepEqual(out.failureFrame.after,{'(1,2)':'Mark','(2,1)':'Mark','(2,2)':'Mark'});
});

test('v7 proof grouping disallows duplicate, inactive, unproductive or dependent centers',()=>{
 const mutations=[
  r=>r.steps[0].proofs.push(['(1,1)']),
  r=>r.steps[0].proofs=[['(1,1)','(1,1)']],
  r=>r.steps[1].proofs=[['(1,1)']],
  r=>r.steps[0].proofs=[['(1,1)'],['(2,2)']],
  r=>r.steps[1].proofs=[['(1,2)','(2,1)']]
 ];
 for(const mutate of mutations){const r=simple();mutate(r);assert.equal(validateReplay(r).validation.status,'invalid');}
 const guessed={schema_version:7,puzzle:{grid:[[-1,-1]]},steps:[{actions:{'(1,1)':'Lamp'},proofs:[['(1,1)']]}]};
 assert.equal(validateReplay(guessed).validation.status,'invalid');
});

test('v7 stop and completion have one representation and limits never become a wrong-proof claim',()=>{
 const partial=simple();partial.steps.pop();partial.stop={kind:'partial',reason:'Demonstration prefix'};
 assert.equal(validateReplay(partial).validation.status,'valid');assert.equal(validateReplay(partial).completion.solved,false);
 delete partial.stop;assert.equal(validateReplay(partial).validation.status,'invalid');
 partial.steps.push({type:'stuck',reason:'Bypass'});assert.match(validateReplay(partial).validation.error.message,/unexpected field/);
 const initial={schema_version:7,puzzle:{grid:[[-1]]},initial_marks:{'(1,1)':'Lamp'},steps:[]};
 assert.equal(validateReplay(initial).completion.solved,true);
 assert.equal(validateReplay(simple(),null,{maxWork:1}).validation.status,'unverified');
 assert.throws(()=>validateReplay({...simple(),initial_marks:{}}),/Omit empty/);
});

test('pooled assignments deduplicate shared positions and keep OR coverage alternatives',()=>{
 const domains=[[{'(1,2)':'Lamp'},{'(1,2)':'Mark'}],[{'(1,2)':'Lamp'},{'(1,2)':'Mark'}]];
 assert.deepEqual(pooledCandidates(domains),{pool:['(1,2)'],candidates:[{'(1,2)':'Lamp'},{'(1,2)':'Mark'}]});
 const coverage=pooledCandidates([[{'(1,1)':'Lamp'},{'(1,2)':'Lamp'},{'(2,1)':'Lamp'}]]);
 assert.deepEqual(coverage.candidates,[{'(1,1)':'Lamp'},{'(1,2)':'Lamp'},{'(2,1)':'Lamp'}]);
 const choices=[{'(1,2)':'Lamp'},{'(2,1)':'Lamp'}];
 const combined=pooledCandidates([choices,[...choices].reverse()]);
 assert.equal(combined.candidates.length,3);
 assert.equal(combined.candidates.filter(a=>Object.keys(a).length===2).length,1);
 assert.deepEqual(new Set(combined.candidates.map(a=>JSON.stringify(a))),new Set(pooledCandidates([[...choices].reverse(),choices]).candidates.map(a=>JSON.stringify(a))));
 assert.throws(()=>pooledCandidates(domains,{tick(){throw new Error('budget');}}),/budget/);
});
test('v8 validates exact actions without serialized candidate pools and v7 remains input compatible',()=>{
 const r=simple();r.schema_version=8;assert.equal(validateReplay(r).validation.status,'valid');
 for(const field of ['candidate_pool','candidate_count','candidates']){
  const bad=structuredClone(r);bad.steps[0][field]=[];
  assert.equal(validateReplay(bad).validation.status,'invalid');
 }
 for(const day of ['2026-10-15','2026-10-16'])assert.equal(validateReplay(read(`tests/fixtures/v7-daily-${day}.json`)).validation.status,'valid');
});

import {proofCost} from '../src/cost.mjs';
test('experimental contribution cost matches Python and retains model and supplied expressions',()=>{
 const payload=JSON.parse(execFileSync('python3',['-B','-c',`
import json
from akari_solver import AkariHumanSolver,parse_puzzlink
from akari_solver.protocol import make_report
r=json.load(open('results/daily-2026-10-16.json'))
s=AkariHumanSolver(parse_puzzlink(r['puzzle']['puzzlink']),cost_model='overlap-experimental')
rows=[]
base={}
for step in r['steps']:
 ds=dict(s.centers(base))
 for labels in step['proofs']:
  selected=[(c,ds[c]) for label in labels for c in ds if c.label().split('@')[1]==label]
  rows.append({'domains':[{'label':c.label(),'candidates':[{f'({k[0]+1},{k[1]+1})':v for k,v in a.items()} for a in choices]} for c,choices in selected], 'cost':s.cost_details(selected)['cost']})
 for label,value in step['actions'].items():base[tuple(int(v)-1 for v in label.strip('()').split(','))]=value
small=AkariHumanSolver([[0,-1],[-1,-1]],cost_model='overlap-experimental')
print(json.dumps({'rows':rows,'report':make_report({'grid':small.grid},small.solve())}))
`],{cwd:root,encoding:'utf8'}));
 for(const row of payload.rows){
  assert.equal(proofCost(row.domains,'overlap-experimental'),row.cost);
  assert.equal(proofCost([...row.domains].reverse(),'overlap-experimental'),row.cost);
 }
 const output=validateReplay(payload.report);
 assert.equal(output.validation.status,'valid');
 assert.equal(output.events[0].cost_expression,payload.report.steps[0].cost_expression);
 assert.deepEqual(output.events[1].components.map(p=>p.cost_expression),payload.report.steps[1].proof_cost_expressions);
 const original=read('results/daily-2026-10-16.json');original.cost_model='overlap-experimental';
 assert.equal(validateReplay(original).validation.status,'valid');
 assert.notEqual(validateReplay(original).events[3].cost,validateReplay(read('results/daily-2026-10-16.json')).events[3].cost);
});
test('expressions are optional plain text annotations and never authoritative numeric costs',()=>{
 const r=simple();r.schema_version=8;
 let d=validateReplay(r);assert.equal(d.events[0].cost_expression,undefined);
 r.steps[0].cost_expression='<b>custom expression</b>';
 r.steps[1].proof_cost_expressions=['A','B','C'];
 d=validateReplay(r);assert.equal(d.validation.status,'valid');assert.equal(d.events[0].cost,1);
 assert.equal(d.events[0].cost_expression,'<b>custom expression</b>');
 assert.equal(d.events[1].cost_expression,undefined);assert.equal(d.events[1].components[2].cost_expression,'C');
 for(const value of [null,3,{},'', '  ']){
  const bad=structuredClone(r);bad.steps[0].cost_expression=value;
  assert.equal(validateReplay(bad).validation.status,'invalid');
 }
 r.steps[1].proof_cost_expressions=['A'];assert.equal(validateReplay(r).validation.status,'invalid');
 assert.throws(()=>validateReplay({...r,cost_model:'unknown'}),/Unknown cost model/);
});
