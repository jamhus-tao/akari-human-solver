// Independent CNF checker. Never generates replay moves or minimizes a proof.
export class VerificationLimit extends Error {}
export class ExactCheck {
 constructor(grid,{maxWork=8000000,maxMs=8000}={}){
  this.work=0;this.maxWork=maxWork;this.deadline=Date.now()+maxMs;
  this.ids=new Map();this.clauses=[];
  grid.forEach((row,r)=>row.forEach((v,c)=>{if(v===-1)this.ids.set(`(${r+1},${c+1})`,this.ids.size+1);}));
  const id=(r,c)=>this.ids.get(`(${r+1},${c+1})`);
  const combos=(a,k,start=0,p=[])=>{if(k===0){this.clauses.push(p);return;}for(let i=start;i<=a.length-k;i++)combos(a,k-1,i+1,[...p,a[i]]);};
  for(let r=0;r<grid.length;r++)for(let c=0;c<grid[0].length;c++){
   this.tick();const v=grid[r][c],here=id(r,c);
   if(v===-1){const cover=[here];for(const[dr,dc]of [[1,0],[-1,0],[0,1],[0,-1]]){let rr=r+dr,cc=c+dc;while(id(rr,cc)){const other=id(rr,cc);cover.push(other);if(other>here)this.clauses.push([-here,-other]);rr+=dr;cc+=dc;}}this.clauses.push(cover);}
   else if(v>=0){const ns=[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].map(([rr,cc])=>id(rr,cc)).filter(Boolean);if(v>ns.length)this.clauses.push([]);else{combos(ns.map(n=>-n),v+1);combos(ns,ns.length-v+1);}}
  }
 }
 tick(n=1){this.work+=n;if(this.work>this.maxWork||Date.now()>this.deadline)throw new VerificationLimit('Verification budget exceeded; remaining frames are unverified, not proven wrong.');}
 solution(marks){
  const values=new Int8Array(this.ids.size+1);
  for(const[k,v]of Object.entries(marks)){const id=this.ids.get(k);if(!id||!['Lamp','Mark'].includes(v))throw new Error(`Illegal mark ${k}=${v}`);values[id]=v==='Lamp'?1:-1;}
  // Iterative DFS avoids call-stack limits on large puzzles.
  const stack=[values];
  while(stack.length){const state=stack.pop();let failed=false,choice=0;
   for(;;){let changed=false,best=Infinity;choice=0;
    for(const clause of this.clauses){this.tick(clause.length+1);let satisfied=false,unknown=0,last=0;
     for(const literal of clause){const val=state[Math.abs(literal)];if(val===(literal>0?1:-1)){satisfied=true;break;}if(!val){unknown++;last=literal;}}
     if(satisfied)continue;if(!unknown){failed=true;break;}
     if(unknown===1){state[Math.abs(last)]=last>0?1:-1;changed=true;}
     else if(unknown<best){best=unknown;choice=last;}
    }
    if(failed||!changed)break;
   }
   if(failed)continue;
   if(!choice)return Object.fromEntries([...this.ids].map(([k,i])=>[k,state[i]===1?'Lamp':'Mark']));
   const other=state.slice();other[Math.abs(choice)]=-1;state[Math.abs(choice)]=1;stack.push(other,state);
  }
  return null;
 }
}
