// Numeric verification only. Display expressions come exclusively from the report.
import {coord} from './model.mjs?v=754b0258aff5fda6';
export function proofCost(domains,model='product'){
 const counts=domains.map(d=>d.candidates.length),raw=counts.reduce((a,b)=>a*b,1);
 if(model==='product')return raw;
 if(model!=='overlap-experimental')throw new Error('Unknown cost model.');
 const remaining=[...counts],owners=new Map();
 domains.forEach((domain,i)=>{
  for(const cell of new Set(domain.candidates.flatMap(a=>Object.keys(a)))){
   if(!owners.has(cell))owners.set(cell,[]);owners.get(cell).push(i);
  }
 });
 const order=(a,b)=>{const x=coord(a),y=coord(b);return x[0]-y[0]||x[1]-y[1];};
 for(const [,indexes] of [...owners].sort(([a],[b])=>order(a,b))){
  if(indexes.length<2)continue;
  const keeper=[...indexes].sort((a,b)=>remaining[a]-remaining[b]||order(domains[a].label.split('@')[1],domains[b].label.split('@')[1])||domains[a].label.localeCompare(domains[b].label))[0];
  for(const i of indexes)if(i!==keeper)remaining[i]--;
 }
 return remaining.reduce((n,v)=>n*Math.max(1,v),1)+domains.length-1;
}
