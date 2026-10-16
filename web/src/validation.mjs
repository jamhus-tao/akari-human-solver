import {compactGeometry,expandCompactStep} from './protocol.mjs?v=754b0258aff5fda6';
import {upgradeInput} from './terminology.mjs?v=754b0258aff5fda6';
import {normalizeReport,validateGrid,parsePuzzlink,facts,same,components,centerInfo,visible,key,coord,branch,tupleAt,completion,boardText,cellStates} from './model.mjs?v=754b0258aff5fda6';
import {ExactCheck,VerificationLimit} from './verify.mjs?v=754b0258aff5fda6';
const map=(value,label)=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${label} must be an object.`);return value;};
function geometry(r,original){
 const p=r.puzzle;const embedded=p==null?null:typeof p==='string'?parsePuzzlink(p):Array.isArray(p)?validateGrid(p):p.grid?validateGrid(p.grid):p.puzzlink?parsePuzzlink(p.puzzlink):null;
 const g=original?validateGrid(original):embedded;if(!g)throw new Error('Supply a structured original board or embedded puzzle layout.');
 if(embedded&&JSON.stringify(g)!==JSON.stringify(embedded))throw new Error('Original board and solution report describe different puzzles.');return g;
}
function checkMarks(g,m){map(m,'Marks');for(const[k,v]of Object.entries(m)){const[r,c]=coord(k);if(g[r]?.[c]!==-1||!['Lamp','Mark'].includes(v))throw new Error(`Illegal mark ${k}=${v}.`);}}
function transition(raw,before,strict){
 let changes=raw.actions??raw.marks??raw.new_marks;
 if(changes===undefined&&raw.after!==undefined){map(raw.after,'after');changes={};for(const k of Object.keys(before))if(!(k in raw.after))changes[k]=null;for(const[k,v]of Object.entries(raw.after))if(before[k]!==v)changes[k]=v;}
 if(changes===undefined&&(raw.title||raw.note))changes={};
 if(changes===undefined)throw new Error('Step needs marks/new_marks or after state.');map(changes,'Step changes');
 const after={...before},added={};for(const[k,v]of Object.entries(changes)){if(!['Lamp','Mark',null].includes(v))throw new Error(`Illegal mark ${k}=${v}.`);if(strict&&k in before&&before[k]!==v)throw new Error('A strict proof cannot retract or overwrite an existing mark.');if(strict&&v===null)throw new Error('A strict proof cannot remove marks.');if(v===null)delete after[k];else{after[k]=v;if(before[k]!==v)added[k]=v;}}
 if(raw.before!==undefined&&!same(map(raw.before,'before'),before))throw new Error('Provided before state does not match last valid frame.');
 if(raw.after!==undefined&&!same(map(raw.after,'after'),after))throw new Error('Provided after state does not match actions.');
 return {after,added,changes};
}
function domain(g,base,label){
 const {kind,cell,position:[r,c]}=centerInfo(label);
 if(kind!=='number'){
  if(g[r]?.[c]!==-1||base[cell]==='Lamp'||(kind==='mark'&&base[cell]!=='Mark')||(kind==='empty'&&cell in base))throw new Error(`Invalid center state: ${label}`);
  return visible(g,cell).filter(k=>!(k in base)).map(k=>({[k]:'Lamp'}));
 }
 if(!(g[r]?.[c]>=0))throw new Error(`Invalid number center: ${label}`);
 const ns=[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].filter(([rr,cc])=>g[rr]?.[cc]===-1).map(([rr,cc])=>key(rr,cc));
 const unknown=ns.filter(k=>!(k in base)),remaining=g[r][c]-ns.filter(k=>base[k]==='Lamp').length,result=[];
 const choose=(at,picked)=>{if(picked.length===remaining){result.push(Object.fromEntries(unknown.map(k=>[k,picked.includes(k)?'Lamp':'Mark'])));return;}for(let i=at;i<unknown.length;i++)choose(i+1,[...picked,unknown[i]]);};
 if(remaining>=0&&remaining<=unknown.length)choose(0,[]);return result;
}
const signature=a=>JSON.stringify(Object.entries(a).sort(([a],[b])=>a.localeCompare(b)));
function hydrateProof(g,raw,before,after,added,budget,warnings){
 const e=structuredClone(raw);e.step=1;e.before??=before;e.after??=after;e.new_marks??=added;
 const base=facts(g,before);e.facts_before??=base;e.facts_after??=facts(g,after);
 const parts=e.type==='fast_mark'?e.components:[e];
 // Missing evidence is not false evidence. Preserve proof-claim semantics for
 // exact forced-mark checking, but disable branch UI instead of inventing data.
 if(!Array.isArray(parts)||!parts.length||parts.some(p=>!p.centers||!p.candidates)){
  warnings.push('Enumeration evidence is missing; displayed as actions. Claimed strict marks are still checked for logical necessity.');return null;
 }
 const union={};
 for(const part of parts){
  part.before??=before;part.facts_before??=base;
  if(!same(part.before,before)||!same(part.facts_before,base))throw new Error('Proof components do not share the frozen pre-state.');
  if(!Array.isArray(part.centers)||!Array.isArray(part.candidates)||part.centers.length!==part.candidates.length||!part.centers.length)throw new Error('Malformed proof centers/candidates.');
  if(new Set(part.centers).size!==part.centers.length)throw new Error('Duplicate centers in one proof.');
  const counts=part.candidates.map((ds,i)=>{
   if(!Array.isArray(ds))throw new Error('Malformed candidate domain.');
   const expected=domain(g,base,part.centers[i]);const a=ds.map(signature).sort(),b=expected.map(signature).sort();
   if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Incomplete or incorrect local candidates for ${part.centers[i]}.`);
   return ds.length;
  });
  const cost=counts.reduce((a,b)=>a*b,1);if(!cost||cost>100000)throw new VerificationLimit('Proof product exceeds validation limit; not certified as wrong.');
  if(part.candidate_counts!==undefined&&JSON.stringify(part.candidate_counts)!==JSON.stringify(counts))throw new Error('Candidate count mismatch.');
  if(part.cost!==undefined&&part.cost!==cost)throw new Error('Recorded cost disagrees with candidate product (optimality is not tested).');
  part.candidate_counts=counts;part.cost=cost;
  const supplied=part.branch_proof;part.branch_proof??=[];
  if(!Array.isArray(part.branch_proof)||part.branch_proof.length>200000)throw new Error('Malformed branch evidence.');
  for(const record of part.branch_proof){
   const ids=record.candidate_indexes||record.candidate_prefix;
   if(!Array.isArray(ids)||!ids.length||ids.length>counts.length||ids.some((v,i)=>!Number.isInteger(v)||v<0||v>=counts[i]))throw new Error('Invalid branch indexes.');
   record.multiplicity??=counts.slice(ids.length).reduce((a,b)=>a*b,1);
  }
  let common=null,survivors=0;const rebuilt=[];
  for(let n=0;n<cost;n++){
   budget.tick(100);const ids=tupleAt(n,counts),b=branch(g,before,part,ids),bad=b.conflicts.size>0;
   if(supplied){if(!b.record)throw new Error('Proof branch missing.');b.record.status??=bad?'conflict':'compatible';if((b.record.status==='conflict')!==bad)throw new Error(`Incorrect branch verdict at combination ${n+1}.`);if(!bad&&b.record.direct_effects!==undefined&&!same(b.record.direct_effects,b.constraintEffects))throw new Error('Recorded branch effects are incorrect.');}
   rebuilt.push(bad?{candidate_indexes:ids,status:'conflict',multiplicity:1}:{candidate_indexes:ids,status:'compatible',multiplicity:1,direct_effects:b.constraintEffects});
   if(!bad){survivors++;common=common===null?b.constraintEffects:Object.fromEntries(Object.entries(common).filter(([k,v])=>b.constraintEffects[k]===v));}
  }
  if(!survivors)throw new Error('All branches conflict; cannot infer conclusions from an empty set.');
  if(part.conclusions!==undefined){checkMarks(g,part.conclusions);for(const[k,v]of Object.entries(part.conclusions))if(common[k]!==v)throw new Error(`Claim ${k}=${v} does not hold in every compatible branch.`);}else part.conclusions=common;
  if(!supplied)part.branch_proof=rebuilt;
  part.compatible_combinations??=survivors;part.new_marks??={};
  for(const[k,v]of Object.entries(part.conclusions)){if(k in union&&union[k]!==v)throw new Error('Conflicting component conclusions.');union[k]=v;}
 }
 e.centers??=parts.flatMap(p=>p.centers);e.component_count??=parts.length;e.cost??=e.type==='fast_mark'?1:parts[0].cost;
 if(e.conclusions!==undefined){checkMarks(g,e.conclusions);for(const[k,v]of Object.entries(e.conclusions))if(union[k]!==v)throw new Error(`Unsupported batch conclusion ${k}=${v}.`);}else e.conclusions=union;
 for(const[k,v]of Object.entries(added))if(union[k]!==v)throw new Error(`Submitted mark ${k}=${v} is not supported by this proof.`);
 return normalizeReport({schema_version:6,inference_model:'strict_local_centers',grouping:'same_state_independent_cost_one',puzzle:{grid:g},history:[e]},g).events[0];
}
function directError(g,state){
 const lit=facts(g,state);
 for(const[k,v]of Object.entries(state))if(v==='Lamp'){const other=visible(g,k).find(x=>x!==k&&state[x]==='Lamp');if(other)return `Lamps ${k} and ${other} see each other.`;}
 for(let r=0;r<g.length;r++)for(let c=0;c<g[0].length;c++)if(g[r][c]>=0){const ns=[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].filter(([rr,cc])=>g[rr]?.[cc]===-1).map(([rr,cc])=>key(rr,cc));const n=ns.filter(k=>state[k]==='Lamp').length,u=ns.filter(k=>!(k in lit)).length;if(n>g[r][c])return `Clue ${key(r,c)} has too many adjacent lamps (${n}/${g[r][c]}).`;if(n+u<g[r][c])return `Clue ${key(r,c)} cannot reach ${g[r][c]} adjacent lamps.`;}
 for(let r=0;r<g.length;r++)for(let c=0;c<g[0].length;c++)if(g[r][c]===-1&&!visible(g,key(r,c)).some(k=>lit[k]!=='Mark'))return `Cell ${key(r,c)} can no longer be illuminated.`;
 return null;
}

// Diagnostic only: invalid coordinates/values must never reach the SVG renderer.
// Keep the rejected input as text and explicitly disclose any omitted marks.
function diagnosticFrame(g,error,before,raw,initial=false){
 const after=initial?{}:{...before},omitted=[];
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 let attempted=initial?raw:object(raw)?raw.actions??raw.marks??raw.new_marks:undefined;
 const snapshot=!initial&&attempted===undefined&&object(raw?.after);
 if(snapshot)attempted=raw.after;
 if(snapshot)for(const k of Object.keys(after))delete after[k];
 if(object(attempted))for(const[k,v]of Object.entries(attempted)){
  try{const[r,c]=coord(k);if(g[r]?.[c]!==-1||!['Lamp','Mark',null].includes(v))throw new Error('unsafe mark');
   if(v===null)delete after[k];else after[k]=v;
  }catch{omitted.push(k);}
 }
 else if(attempted!==undefined)omitted.push('invalid marks object');
 const changes={};for(const k of Object.keys(before))if(!(k in after))changes[k]=null;
 for(const[k,v]of Object.entries(after))if(before[k]!==v)changes[k]=v;
 const conflicts=new Set();
 for(const match of error.message.matchAll(/\([1-9]\d*,[1-9]\d*\)/g)){
  const[r,c]=coord(match[0]);if(g[r]?.[c]!==undefined)conflicts.add(match[0]);
 }
 for(const[k,v]of Object.entries(after))if(v==='Lamp')for(const x of visible(g,k))if(x!==k&&after[x]==='Lamp'){conflicts.add(k);conflicts.add(x);}
 const rawText=JSON.stringify(initial?{initial_marks:raw}:raw,null,2)??String(raw);
 return {type:error.kind==='invalid'?'error':'unverified',step:error.lastValidStep+1,
  source_step:error.step,hasProof:false,isDiagnostic:true,cost:null,centers:[],
  title:error.kind==='invalid'?'Error frame':'Unverified frame',
  before:{...before},after,changes,new_marks:Object.fromEntries(Object.entries(changes).filter(([,v])=>v!==null)),
  removed_marks:Object.fromEntries(Object.keys(before).filter(k=>!(k in after)).map(k=>[k,before[k]])),
  diagnostic:{...error,omittedMarks:omitted,previewPartial:omitted.length>0,
   previewNote:omitted.length?'Some invalid coordinates or values cannot be drawn. The board is a partial preview; see the rejected input below.':'The board shows the attempted state, not an accepted or verified commit.',
   rawInput:rawText.slice(0,16000)+(rawText.length>16000?'\n[Preview truncated]':''),
   conflict_cells:[...conflicts]},
  board_after:boardText(g,after),cell_states_after:cellStates(g,after),live_verification:{status:error.kind,optimalityChecked:false}};
}
export function validateReplay(input,original=null,options={}){
 input=upgradeInput(input);
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected replay object.');
 const compact=[7,8].includes(input.schema_version),strict=input.schema_version!==undefined;
 if(strict&&!compact&&(input.schema_version!==6||(input.inference_model!==undefined&&input.inference_model!=='strict_local_centers')||(input.grouping!==undefined&&input.grouping!=='same_state_independent_cost_one')))throw new Error('Unsupported strict-local schema v6 model.');
 if(!strict&&(!['akari-replay','akari-solution'].includes(input.format)||input.version!==2))throw new Error('Unsupported replay format/version.');
 const g=compact?compactGeometry(input,original):geometry(input,original);
 const warnings=[],events=[];let initial=structuredClone(input.initial_marks??(strict?input.history?.[0]?.before:undefined)??{}),state=initial,terminal=null,error=null,budget;
 const finalOnly=input.format==='akari-solution';let raws=finalOnly?[{title:'Final lamp layout',note:'Final answer only; no reasoning supplied.'}]:compact?input.steps:strict?input.history:input.steps;
 if(!Array.isArray(raws)||raws.length>10000)throw new Error('Invalid steps/history array.');
 const out={report:{...input,puzzle:{...(typeof input.puzzle==='object'&&!Array.isArray(input.puzzle)?input.puzzle:{}),grid:g}},grid:g,events,initialMarks:initial,terminal:null,format:compact?`strict-local-v${input.schema_version}`:strict?'strict-local-v6':finalOnly?'akari-solution-v2':'akari-replay-v2',warnings};
 const fail=(step,e,raw,before=state)=>{
  error={step,lastValidStep:events.length,kind:e instanceof VerificationLimit?'unverified':'invalid',message:e.message};
  out.failureFrame=diagnosticFrame(g,error,before,raw,step===0);
 };
 try{checkMarks(g,initial);budget=new ExactCheck(g,options);const issue=directError(g,initial);if(issue)throw new Error(issue);if(!budget.solution(initial))throw new Error('Initial state has no legal complete solution.');}
 catch(e){fail(0,e,initial,{});out.initialMarks={};state={};}
 if(!error)for(let i=0;i<raws.length;i++){
  const raw=raws[i];let source=raw;
  try{
   if(strict&&!compact&&['stuck','search_limit'].includes(raw?.type)){terminal=raw;if(i!==raws.length-1)throw new Error('Events after terminal record.');break;}
   map(raw,'Step');
   if(compact)source=expandCompactStep(g,state,raw,budget,input.schema_version,input.cost_model??'product');
   if(raw.step!==undefined&&raw.step!==i+1)throw new Error('Step number does not match position.');
   if(finalOnly){if(!Array.isArray(input.lamps))throw new Error('Final answer requires lamp coordinates.');const marks={};for(const cell of input.lamps){if(!Array.isArray(cell)||cell.length!==2||cell.some(v=>!Number.isInteger(v)||v<1))throw new Error('Lamp coordinates must be one-based [row,column].');marks[key(cell[0]-1,cell[1]-1)]='Lamp';}source={...raw,marks};}
   const before={...state},claim=strict||raw.proof!==undefined;
   const {after,added,changes}=transition(source,before,claim);
   for(const k of Object.keys(changes)){const[r,c]=coord(k);if(g[r]?.[c]!==-1)throw new Error(`Action targets a non-white cell ${k}.`);}
   checkMarks(g,after);
   const issue=directError(g,after);if(issue)throw new Error(issue);
   if(!budget.solution(after))throw new Error('These marks have no legal complete solution, even though no immediate local conflict is visible.');
   let proof=null;
   if(claim){const originalSource=compact?source:strict?raw:raw.proof?.event;if(!originalSource||(!strict&&raw.proof.format!=='strict-local-v6'))throw new Error('Unsupported or malformed proof.');
    const src={...originalSource,type:originalSource.type??(originalSource.components?'fast_mark':'brain')};
    proof=input.schema_version===8?{...src,hasProof:true,board_after:boardText(g,after),cell_states_after:cellStates(g,after)}:compact?normalizeReport({schema_version:6,inference_model:'strict_local_centers',grouping:'same_state_independent_cost_one',puzzle:{grid:g},history:[src]},g).events[0]:hydrateProof(g,src,before,after,added,budget,warnings);
    const claims={...(proof?.conclusions||src.conclusions||{}),...added};checkMarks(g,claims);
    for(const[k,v]of Object.entries(claims)){if(before[k]===v)continue;const opposite=v==='Lamp'?'Mark':'Lamp';if(budget.solution({...before,[k]:opposite}))throw new Error(`Mark ${k}=${v} is not forced: a complete solution exists with ${k}=${opposite}.`);}
   }
   const last=i===raws.length-1;
   if(last&&((compact&&!input.stop)||finalOnly||input.complete===true||input.status==='solved')&&!completion(g,after).solved)throw new Error('Final answer claims completion but leaves cells unlit or clues unsatisfied.');
   let event;
   if(proof)event={...proof,step:i+1,title:raw.title??'',note:raw.note??'',hasProof:true};
   else{
    const result=normalizeReport({format:'akari-replay',version:2,puzzle:{grid:g},initial_marks:before,steps:[{marks:changes,title:raw.title??'',note:raw.note??(!Object.keys(changes).length?'No state change.':'')}]},g);
    event={...result.events[0],step:i+1,claimMode:claim?'strict-marks-without-enumeration':'actions'};
   }
   event.live_verification={status:'verified',mode:claim?'forced-marks-and-state':'extendable-state',optimalityChecked:false};
   events.push(event);state=after;
  }catch(e){fail(i+1,e,compact?raw:source);break;}
 }
 if(compact&&input.stop)terminal={type:input.stop.kind,reason:input.stop.reason};
 out.terminal=terminal;out.completion=completion(g,state);
 if(!error&&!events.length&&((compact&&!input.stop)||finalOnly||input.complete===true||input.status==='solved')&&!out.completion.solved)fail(0,new Error('Completion claimed without a solved final state.'),initial,{});
 out.validation={status:error?.kind||'valid',error,lastValidStep:events.length,inputFrames:raws.length,work:budget?.work??0,optimalityChecked:false};
 if(error)warnings.push(`${error.kind==='unverified'?'Verification stopped':'Invalid input'} at ${error.step===0?'initial state':`step ${error.step}`}: ${error.message} ${events.length} valid frames are followed by one diagnostic frame; later input is excluded.`);
 return out;
}
