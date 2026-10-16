// Pooled assignments are independent of center tuple indexes and UI ordering.
import {coord,branch} from './model.mjs?v=754b0258aff5fda6';
import {VerificationLimit} from './verify.mjs?v=754b0258aff5fda6';

export function pooledCandidates(domains,budget={tick(){}}){
 const pool=[...new Set(domains.flatMap(ds=>ds.flatMap(a=>Object.keys(a))))]
  .sort((a,b)=>{const x=coord(a),y=coord(b);return x[0]-y[0]||x[1]-y[1];});
 let combinations=new Map([['[]',{}]]),work=0;
 for(const domain of domains){
  const next=new Map();
  for(const partial of combinations.values())for(const choice of domain){
   budget.tick();
   if(++work>100000*(domains.length+1))throw new VerificationLimit('Pooled combination search exceeds work limit.');
   if(Object.entries(choice).some(([k,v])=>k in partial&&partial[k]!==v))continue;
   const entries=Object.entries({...partial,...choice}).sort(([a],[b])=>{const x=coord(a),y=coord(b);return x[0]-y[0]||x[1]-y[1];});
   const signature=JSON.stringify(entries);
   if(!next.has(signature))next.set(signature,Object.fromEntries(entries));
   if(next.size>100000)throw new VerificationLimit('Unique pooled combinations exceed limit.');
  }
  combinations=next;
 }
 return {pool,candidates:[...combinations.values()]};
}

export function candidateBranch(grid,before,assumptions){
 return branch(grid,before,{candidates:[[assumptions]],branch_proof:[]},[0]);
}

// Legacy proofs keep their original partial-assignment semantics on import.
// Only their presentation is flattened; v8 never constructs center tuples.
const legacyCache=new WeakMap();
export function exploreCandidates(grid,before,part){
 if(part.candidate_pool)return part.branch_proof;
 if(legacyCache.has(part))return legacyCache.get(part);
 const records=[],seen=new Set(),ids=part.candidate_counts.map(()=>0);
 for(let n=0;n<part.cost;n++){
  let value=n;
  for(let i=ids.length-1;i>=0;i--){ids[i]=value%part.candidate_counts[i];value=Math.floor(value/part.candidate_counts[i]);}
  const b=branch(grid,before,part,ids);
  const signature=JSON.stringify([Object.entries(b.assumed).sort(),[...b.conflicts].sort()]);
  if(seen.has(signature))continue;seen.add(signature);
  records.push({assumptions:b.assumed,status:b.conflicts.size?'conflict':'compatible',legacy_indexes:[...ids]});
 }
 legacyCache.set(part,records);return records;
}
export function exploreBranch(grid,before,part,record){
 const b=record.legacy_indexes?branch(grid,before,part,record.legacy_indexes):candidateBranch(grid,before,record.assumptions);
 return {...b,record};
}
