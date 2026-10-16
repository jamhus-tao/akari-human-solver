import {proofCost} from './cost.mjs?v=754b0258aff5fda6';
import {pooledCandidates,candidateBranch} from './pool.mjs?v=754b0258aff5fda6';
// Compact v7/v8 wire data has one action map. All other replay details are computed here.
import {validateGrid, parsePuzzlink, facts, light, visible, key, coord, branch, tupleAt, same, effectiveActions} from './model.mjs?v=754b0258aff5fda6';
import {VerificationLimit} from './verify.mjs?v=754b0258aff5fda6';

const object = (v, name) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${name} must be an object.`);
};
function fields(v, allowed, name) {
  object(v, name);
  for (const k of Object.keys(v)) if (!allowed.includes(k)) throw new Error(`${name}: unexpected field ${k}; compact proofs forbid duplicate or derived fields.`);
}
export function compactGeometry(input, original = null) {
  fields(input, ['schema_version','puzzle','initial_marks','steps','stop',...(input.schema_version===8?['cost_model']:[])], 'Report');
  if (![7,8].includes(input.schema_version)) throw new Error('Expected schema v7 or v8.');
  if('cost_model' in input&&!['product','overlap-experimental'].includes(input.cost_model))throw new Error('Unknown cost model.');
  const p = input.puzzle;
  fields(p, ['grid','puzzlink','title','author','dateKey','dailyNumber','puzzleId','difficulty','source','license','socialUrl'], 'Puzzle');
  if (('grid' in p) === ('puzzlink' in p)) throw new Error('Compact proofs need exactly one puzzle geometry: grid or puzzlink.');
  for (const k of ['title','author','dateKey','source','license','socialUrl']) if (k in p && typeof p[k] !== 'string') throw new Error(`Puzzle ${k} must be text.`);
  for (const k of ['dailyNumber','puzzleId','difficulty']) if (k in p && !Number.isSafeInteger(p[k])) throw new Error(`Puzzle ${k} must be an integer.`);
  if ('puzzlink' in p && typeof p.puzzlink !== 'string') throw new Error('Puzzle puzzlink must be text.');
  const grid = 'grid' in p ? validateGrid(p.grid) : parsePuzzlink(p.puzzlink);
  if (original && JSON.stringify(grid) !== JSON.stringify(validateGrid(original))) throw new Error('Original board and solution report describe different puzzles.');
  if (!Array.isArray(input.steps) || input.steps.length > 10000) throw new Error('Invalid steps array.');
  if ('initial_marks' in input) {
    object(input.initial_marks, 'Initial marks');
    if (!Object.keys(input.initial_marks).length) throw new Error('Omit empty initial_marks.');
  }
  if ('stop' in input) {
    fields(input.stop, ['kind','reason'], 'Stop');
    if (!['stuck','search_limit','partial'].includes(input.stop.kind) || typeof input.stop.reason !== 'string' || !input.stop.reason.trim()) throw new Error('Invalid stop kind/reason.');
  }
  return grid;
}

// Frozen domains use only each center's own rule and physical pre-step facts.
function localDomain(grid, before, center, budget) {
  const [r,c] = coord(center), value = grid[r]?.[c], base = facts(grid,before);
  if (value === undefined || value === -2) throw new Error(`Invalid proof center ${center}.`);
  if (value === -1) {
    if (light(grid,before).has(center)) throw new Error(`Proof center ${center} is already lit.`);
    const positions = visible(grid,center).filter(k=>!(k in base)).sort((a,b)=>{const x=coord(a),y=coord(b);return x[0]-y[0]||x[1]-y[1];});
    budget.tick(positions.length+1);
    return {label:`${base[center]==='Mark'?'mark':'empty'}@${center}`, candidates:positions.map(k=>({[k]:'Lamp'}))};
  }
  const ns = [[r-1,c],[r,c-1],[r,c+1],[r+1,c]].filter(([rr,cc])=>grid[rr]?.[cc]===-1).map(([rr,cc])=>key(rr,cc));
  const unknown = ns.filter(k=>!(k in base)), remaining = value-ns.filter(k=>base[k]==='Lamp').length;
  if (!unknown.length || remaining<0 || remaining>unknown.length) throw new Error(`Number ${center} has no active local domain.`);
  const candidates=[];
  function choose(start,picked) {
    budget.tick();
    if (picked.length===remaining) {candidates.push(Object.fromEntries(unknown.map(k=>[k,picked.includes(k)?'Lamp':'Mark'])));return;}
    for(let i=start;i<unknown.length;i++) choose(i+1,[...picked,unknown[i]]);
  }
  choose(0,[]);
  return {label:`number@${center}`,candidates};
}
export function expandCompactStep(grid,before,raw,budget,version=7,costModel='product') {
  fields(raw,['actions','proofs','note',...(version===8?['cost_expression','proof_cost_expressions']:[])],'Step');
  if ('note' in raw && (typeof raw.note!=='string'||!raw.note.trim())) throw new Error('Step note must be nonempty text.');
  object(raw.actions,'Actions');
  if (!Object.keys(raw.actions).length) throw new Error('A compact proof step must submit at least one action.');
  for(const[k,v]of Object.entries(raw.actions)) {
    const[r,c]=coord(k);
    if(grid[r]?.[c]!==-1||!['Lamp','Mark'].includes(v)||k in before) throw new Error(`Action ${k} must be new Lamp/Mark on a white cell.`);
  }
  if(!Array.isArray(raw.proofs)||!raw.proofs.length||raw.proofs.length>2500) throw new Error('Invalid proofs array.');
  const expression=value=>{if(typeof value!=='string'||!value.trim()||value.length>10000)throw new Error('Cost expression must be nonempty text of at most 10000 characters.');};
  if('cost_expression' in raw)expression(raw.cost_expression);
  if('proof_cost_expressions' in raw){
    if(raw.proofs.length<2||!Array.isArray(raw.proof_cost_expressions)||raw.proof_cost_expressions.length!==raw.proofs.length)throw new Error('Proof cost expressions must match fast proof components.');
    raw.proof_cost_expressions.forEach(expression);
  }
  const base=facts(grid,before), parts=[], union={}, seen=new Set();
  for(const centers of raw.proofs) {
    if(!Array.isArray(centers)||!centers.length||centers.length>100||new Set(centers).size!==centers.length) throw new Error('Invalid or duplicate proof centers.');
    const signature=JSON.stringify([...centers].sort());
    if(seen.has(signature)) throw new Error('Duplicate proof component.');seen.add(signature);
    const domains=centers.map(c=>localDomain(grid,before,c,budget));
    const counts=domains.map(d=>d.candidates.length),rawCost=counts.reduce((a,b)=>a*b,1),cost=proofCost(domains,costModel);
    if(!cost) throw new Error('Empty proof domain.');
    if(!Number.isSafeInteger(cost)||cost>100000) throw new VerificationLimit('Proof product exceeds validation limit.');
    if(rawCost===1&&centers.length!==1) throw new Error('Cost-one proofs must use one center; multi-center unions are redundant.');
    if(raw.proofs.length>1&&(cost!==1||centers.length!==1)) throw new Error('Fast mark requires independent singleton cost-one proofs.');
    const part={cost_expression:raw.proof_cost_expressions?.[parts.length],centers:domains.map(d=>d.label),candidate_counts:counts,cost,before,facts_before:base,branch_proof:[]};
    let common=null,survivors=0;
    const evidence=[];
    if(version===8){
      const {pool,candidates}=pooledCandidates(domains.map(d=>d.candidates),budget);
      part.candidate_pool=pool;part.candidate_count=candidates.length;
      for(const assumptions of candidates){
        budget.tick(100);
        const b=candidateBranch(grid,before,assumptions),bad=b.conflicts.size>0;
        evidence.push(bad?{assumptions,status:'conflict',conflict_cells:[...b.conflicts].map(k=>coord(k).map(x=>x+1))}:{assumptions,status:'compatible',direct_effects:b.effects,constraint_effects:b.constraintEffects});
        if(!bad){survivors++;common=common===null?b.constraintEffects:Object.fromEntries(Object.entries(common).filter(([k,v])=>b.constraintEffects[k]===v));}
      }
    }else{
      part.candidates=domains.map(d=>d.candidates);
      for(let n=0;n<cost;n++) {
        budget.tick(100);
        const indexes=tupleAt(n,counts),b=branch(grid,before,part,indexes),bad=b.conflicts.size>0;
        evidence.push(bad?{candidate_indexes:indexes,multiplicity:1,status:'conflict',conflict_cells:[...b.conflicts].map(k=>coord(k).map(x=>x+1))}:{candidate_indexes:indexes,multiplicity:1,status:'compatible',direct_effects:b.effects,constraint_effects:b.constraintEffects});
        if(!bad){survivors++;common=common===null?b.constraintEffects:Object.fromEntries(Object.entries(common).filter(([k,v])=>b.constraintEffects[k]===v));}
      }
    }
    if(!survivors) throw new Error('All proof branches conflict.');
    const proposed=effectiveActions(grid,before,common);
    if(!Object.keys(proposed).length) throw new Error('Proof component has no productive actions.');
    // v8 search results are actions. Legacy v7 retains its historical diagnostic
    // conclusions; neither format accepts redundant covered Marks in actions.
    if(version===8)common=proposed;
    for(const[k,v]of Object.entries(common)){if(k in union&&union[k]!==v) throw new Error('Conflicting proof components.');union[k]=v;}
    parts.push({...part,component:parts.length+1,conclusions:common,proposed_marks:proposed,compatible_combinations:survivors,branch_proof:evidence});
  }
  const expected=effectiveActions(grid,before,union);
  if(!same(expected,raw.actions)) throw new Error('Actions do not equal the proof-derived actions after removing lit Marks; no extra or missing actions are allowed.');
  const attributed=new Set();
  for(const part of parts) {
    part.new_marks={};part.duplicate_marks={};part.redundant_marks={};
    for(const[k,v]of Object.entries(part.proposed_marks)) {
      if(!(k in expected)) part.redundant_marks[k]=v;
      else if(attributed.has(k)) part.duplicate_marks[k]=v;
      else {part.new_marks[k]=v;attributed.add(k);}
    }
  }
  const after={...before,...raw.actions},fast=parts.length>1;
  const event={cost_model:costModel,cost_expression:raw.cost_expression,type:fast?'fast_mark':'brain',step:1,before,after,facts_before:base,facts_after:facts(grid,after),new_marks:{...raw.actions},conclusions:union,cost:fast?1:parts[0].cost,total_cost:parts.reduce((n,p)=>n+p.cost,0),component_count:parts.length,centers:parts.flatMap(p=>p.centers),note:raw.note||''};
  if(fast) event.components=parts;
  else for(const k of ['candidates','candidate_pool','candidate_count','candidate_counts','branch_proof','compatible_combinations']) if(k in parts[0])event[k]=parts[0][k];
  return event;
}
