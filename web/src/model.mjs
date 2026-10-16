import {upgradeInput} from './terminology.mjs?v=754b0258aff5fda6';
// Pure replay engine. Does not solve, add inference, or call any remote service.
export const key = (r, c) => `(${r + 1},${c + 1})`;
export function coord(k) {
  const m = /^\(([1-9]\d*),([1-9]\d*)\)$/.exec(k);
  if (!m) throw new Error(`Invalid coordinate: ${k}`);
  return [+m[1] - 1, +m[2] - 1];
}
export function parsePuzzlink(url) {
  const m = /akari\/(\d+)\/(\d+)\/([^?#\s]+)/.exec(url);
  if (!m) throw new Error('Expected an Akari puzz.link URL.');
  const w = +m[1], h = +m[2];
  if (w < 1 || h < 1 || w * h > 2500) throw new Error('Board must contain 1 to 2500 cells.');
  const grid = Array.from({length: h}, () => Array(w).fill(-1));
  let p = 0;
  for (const ch of m[3]) {
    if (p >= w * h) throw new Error('Puzzle encoding exceeds board size.');
    let pad = 0;
    if (/^[0-4]$/.test(ch)) grid[Math.floor(p/w)][p%w] = +ch;
    else if (/^[5-9]$/.test(ch)) { grid[Math.floor(p/w)][p%w] = +ch - 5; pad = 1; }
    else if (/^[a-e]$/.test(ch)) { grid[Math.floor(p/w)][p%w] = parseInt(ch,16)-10; pad = 2; }
    else if (/^[g-z]$/.test(ch)) p += parseInt(ch,36)-16;
    else if (ch === '.') grid[Math.floor(p/w)][p%w] = -2;
    else throw new Error(`Invalid puzzle character: ${ch}`);
    p += 1 + pad;
    if (p > w*h + pad) throw new Error('Puzzle run exceeds board size.');
  }
  return grid;
}
export function validateGrid(grid) {
  if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0]) || !grid[0].length || grid.length*grid[0].length > 2500 ||
      grid.some(row => !Array.isArray(row) || row.length !== grid[0].length || row.some(v => ![-2,-1,0,1,2,3,4].includes(v))))
    throw new Error('Invalid rectangular grid; use -1 for white, -2 for wall, 0-4 for clues.');
  return grid.map(row => [...row]);
}
export function readPuzzle(text) {
  const s = text.trim();
  if (s.startsWith('{') || s.startsWith('[')) {
    const p = JSON.parse(s);
    return Array.isArray(p) ? validateGrid(p) : p.grid ? validateGrid(p.grid) : parsePuzzlink(p.puzzlink || p.puzzle?.puzzlink || '');
  }
  if (s.includes('akari/')) return parsePuzzlink(s);
  const rows = s.split(/\r?\n/).filter(x => x.trim()).map(row => row.replace(/\s/g,'').split('').map(ch => {
    if (ch === '.') return -1;
    if (ch === '#') return -2;
    if (/^[0-4]$/.test(ch)) return +ch;
    throw new Error('Original board text accepts only . # and numbers 0-4.');
  }));
  return validateGrid(rows);
}
export function white(grid, r, c) { return grid[r]?.[c] === -1; }
export function visible(grid, cell) {
  const [r,c] = typeof cell === 'string' ? coord(cell) : cell;
  if (!white(grid,r,c)) return [];
  const cells = [key(r,c)];
  for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    let rr=r+dr, cc=c+dc;
    while (white(grid,rr,cc)) { cells.push(key(rr,cc)); rr+=dr; cc+=dc; }
  }
  return cells;
}
export function light(grid, marks) {
  const lit = new Set();
  for (const [k,v] of Object.entries(marks)) if (v === 'Lamp') for (const x of visible(grid,k)) lit.add(x);
  return lit;
}
export function facts(grid, marks) {
  const out = {...marks};
  for (const k of light(grid,marks)) if (!(k in out)) out[k]='Mark';
  return out;
}
// Physical state is distinct from the Boolean no-lamp constraints in facts().
// Historical actions remain immutable; a covered Mark currently has state Lit.
export function positionState(grid, marks) {
  const state={...marks};
  for(const k of light(grid,marks)) if(state[k]!=='Lamp') state[k]='Lit';
  return state;
}
export function effectiveActions(grid,before,claims) {
  return Object.fromEntries(Object.entries(positionState(grid,{...before,...claims}))
    .filter(([k,v])=>!(k in before)&&(v==='Lamp'||v==='Mark')));
}
export function same(a,b) {
  const ka=Object.keys(a), kb=Object.keys(b);
  return ka.length===kb.length && ka.every(k => a[k]===b[k]);
}
function marksCheck(grid, marks, label) {
  if (!marks || typeof marks !== 'object' || Array.isArray(marks)) throw new Error(`${label}: missing marks object.`);
  for (const [k,v] of Object.entries(marks)) {
    const [r,c]=coord(k);
    if (!white(grid,r,c) || !['Lamp','Mark'].includes(v)) throw new Error(`${label}: illegal mark ${k}=${v}.`);
  }
}
export function centerInfo(label) {
  const m=/^(number|empty|mark)@(\([1-9]\d*,[1-9]\d*\))$/.exec(label);
  if (!m) throw new Error(`Invalid center: ${label}`);
  return {kind:m[1],cell:m[2],position:coord(m[2])};
}
export function components(event) { return event.type==='fast_mark' ? event.components : [event]; }
export function tupleAt(index, counts) {
  const result=Array(counts.length);
  for(let i=counts.length-1;i>=0;i--){result[i]=index%counts[i];index=Math.floor(index/counts[i]);}
  return result;
}
export function branch(grid, before, part, indexes) {
  const constraints=facts(grid,before), assumed={}, conflicts=new Set(), lamps=new Set(Object.keys(before).filter(k=>before[k]==='Lamp'));
  const assignments=[];
  part.candidates.forEach((domain,i)=>{
    const a=domain[indexes[i]];
    if (!a) throw new Error('Candidate index out of range.');
    assignments.push(a);
    for(const [k,v] of Object.entries(a)) {
      if(k in constraints && constraints[k]!==v) conflicts.add(k);
      if(k in assumed && assumed[k]!==v) conflicts.add(k);
      assumed[k]=v; constraints[k]=v;
      if(v==='Lamp') lamps.add(k);
    }
  });
  const hypothetical={...before,...assumed};
  for(const k of lamps) hypothetical[k]='Lamp';
  const lit=light(grid,hypothetical);
  const blocked=new Set();
  for(const k of lamps) for(const x of visible(grid,k)) if(x!==k) {
    blocked.add(x);
    if(lamps.has(x)) { conflicts.add(k); conflicts.add(x); }
    else constraints[x]='Mark';
  }
  for(const k of lamps) constraints[k]='Lamp';
  const base=facts(grid,before), constraintEffects={}, state=positionState(grid,hypothetical);
  for(const [k,v] of Object.entries(constraints)) if(!(k in base)) constraintEffects[k]=v;
  const effects=Object.fromEntries(Object.keys(constraintEffects).map(k=>[k,state[k]]));
  const record=part.branch_proof.find(p=>{
    const ids=p.candidate_indexes || p.candidate_prefix;
    return ids && ids.every((v,i)=>indexes[i]===v);
  });
  return {state,assumed,assignments,lamps,lit,blocked,conflicts,effects,constraintEffects,record};
}
function normalizeStrictReport(report, originalGrid=null) {
  if(report.schema_version!==6 || report.inference_model!=='strict_local_centers' || report.grouping!=='same_state_independent_cost_one')
    throw new Error('This viewer requires strict-local schema v6 (independent fast marks). Older sequential logs are not compatible.');
  const embedded=report.puzzle?.grid ? validateGrid(report.puzzle.grid) : report.puzzle?.puzzlink ? parsePuzzlink(report.puzzle.puzzlink) : null;
  const grid=originalGrid ? validateGrid(originalGrid) : embedded;
  if(!grid) throw new Error('Supply an original board JSON/text file; this report has no puzzle layout.');
  if(embedded && JSON.stringify(embedded)!==JSON.stringify(grid)) throw new Error('Original board and solution report describe different puzzles.');
  if(!Array.isArray(report.history) || report.history.length>10000) throw new Error('Invalid or oversized history.');
  const events=[]; let previous=null, terminal=null;
  for(const e of report.history) {
    if(['stuck','search_limit'].includes(e.type)) { if(terminal) throw new Error('Duplicate terminal event.'); terminal=e; continue; }
    if(terminal || !['brain','fast_mark'].includes(e.type) || e.step!==events.length+1) throw new Error('Invalid step order.');
    for(const k of ['before','after','new_marks','conclusions']) marksCheck(grid,e[k],`Step ${e.step} ${k}`);
    if(previous && !same(previous,e.before)) throw new Error(`Step ${e.step}: broken before/after chain.`);
    if(!Object.keys(e.new_marks).length || Object.keys(e.new_marks).some(k=>k in e.before) || !same({...e.before,...e.new_marks},e.after))
      throw new Error(`Step ${e.step}: marks must be new, monotonic and match the after state.`);
    const parts=components(e);
    if(!Array.isArray(parts) || !parts.length || parts.length>2500) throw new Error('Missing proof components.');
    if(e.type==='fast_mark' && e.cost!==1) throw new Error('Fast-mark cost must be 1.');
    for(const part of parts) {
      if(!same(part.before,e.before)) throw new Error(`Step ${e.step}: components do not share the same pre-state.`);
      if(!same(part.facts_before,facts(grid,e.before))) throw new Error(`Step ${e.step}: recorded facts do not match actual marks and light.`);
      for(const k of ['conclusions','new_marks']) marksCheck(grid,part[k],`Step ${e.step} component ${k}`);
      if(!Array.isArray(part.centers) || !Array.isArray(part.candidates) || !part.centers.length || part.centers.length!==part.candidates.length || part.centers.length>100)
        throw new Error('Invalid centers/candidates.');
      let cost=1;
      part.centers.forEach((label,i)=>{
        const info=centerInfo(label),[r,c]=info.position;
        if(info.kind==='number' ? !(grid[r]?.[c]>=0) : !white(grid,r,c)) throw new Error('Center does not match original grid.');
        const domain=part.candidates[i];
        if(!Array.isArray(domain) || !domain.length || domain.length>20000 || domain.length!==part.candidate_counts?.[i]) throw new Error('Candidate count mismatch.');
        for(const a of domain) {
          marksCheck(grid,a,'Candidate');
          for(const [k,v] of Object.entries(a)) {
            const [rr,cc]=coord(k);
            if(info.kind==='number' ? Math.abs(rr-r)+Math.abs(cc-c)!==1 : !visible(grid,info.cell).includes(k) || v!=='Lamp' || (info.kind==='mark' && k===info.cell)) throw new Error('Candidate exceeds its center scope.');
          }
          if(info.kind!=='number' && Object.keys(a).length!==1) throw new Error('Coverage candidate must assume exactly one lamp.');
        }
        cost*=domain.length;
      });
      if(!Number.isSafeInteger(cost) || cost>10000000 || cost!==part.cost || (e.type==='fast_mark' && cost!==1)) throw new Error('Invalid Cartesian product cost.');
      if(!Array.isArray(part.branch_proof) || part.branch_proof.length>200000) throw new Error('Invalid branch proof.');
      let multiplicity=0;
      const intervals=[];
      for(const p of part.branch_proof) {
        const ids=p.candidate_indexes || p.candidate_prefix;
        if(!['compatible','conflict'].includes(p.status)||!Array.isArray(ids)||!ids.length||ids.length>part.centers.length||ids.some((v,i)=>!Number.isInteger(v)||v<0||v>=part.candidate_counts[i]) || !Number.isSafeInteger(p.multiplicity)||p.multiplicity<1) throw new Error('Invalid proof branch indices.');
        if(p.status==='compatible' && ids.length!==part.centers.length) throw new Error('Compatible branch must specify every center.');
        const suffix=part.candidate_counts.slice(ids.length).reduce((a,b)=>a*b,1);
        if(p.multiplicity!==suffix) throw new Error('Branch prefix multiplicity mismatch.');
        let start=0;
        ids.forEach((v,i)=>start=start*part.candidate_counts[i]+v);
        intervals.push([start*suffix,(start+1)*suffix]);
        multiplicity+=p.multiplicity;
      }
      if(multiplicity!==cost) throw new Error('Branch evidence does not cover the recorded product size.');
      intervals.sort((a,b)=>a[0]-b[0]);
      let end=0;
      for(const [start,next] of intervals){if(start!==end)throw new Error('Overlapping or missing branch evidence.');end=next;}
    }
    e.board_after=boardText(grid,e.after);
    e.cell_states_after=cellStates(grid,e.after);
    previous=e.after; events.push(e);
  }
  const initialMarks=events[0]?.before || report.initial_marks || {};
  marksCheck(grid,initialMarks,'Initial marks');
  return {report,grid,events,terminal,initialMarks,format:'strict-local-v6'};
}

// Import adapters are code registered by the application, never executable
// strings or module URLs supplied by an imported file.
const adapters=[];
export function registerReplayAdapter(id, matches, normalize) {
  if(typeof id!=='string'||!id||adapters.some(a=>a.id===id)||typeof matches!=='function'||typeof normalize!=='function')
    throw new Error('Invalid or duplicate replay adapter.');
  adapters.push({id,matches,normalize});
}
export function completion(grid, marks) {
  const lit=light(grid,marks),problems=[];
  let whiteCount=0;
  for(let r=0;r<grid.length;r++)for(let c=0;c<grid[0].length;c++){
    const k=key(r,c),v=grid[r][c];
    if(v===-1){whiteCount++;if(marks[k]==='Lamp' && visible(grid,k).some(x=>x!==k&&marks[x]==='Lamp'))problems.push(`Lamp conflict at ${k}`);}
    else if(v>=0){const actual=[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].filter(([rr,cc])=>marks[key(rr,cc)]==='Lamp').length;if(actual!==v)problems.push(`Clue ${k}: ${actual}/${v}`);}
  }
  return {solved:lit.size===whiteCount&&!problems.length,lit:lit.size,whiteCount,problems};
}
function resolveGrid(report, originalGrid) {
  const puzzle=report.puzzle;
  const embedded=puzzle==null?null:typeof puzzle==='string'?parsePuzzlink(puzzle):Array.isArray(puzzle)?validateGrid(puzzle):puzzle.grid?validateGrid(puzzle.grid):puzzle.puzzlink?parsePuzzlink(puzzle.puzzlink):null;
  const grid=originalGrid?validateGrid(originalGrid):embedded;
  if(!grid)throw new Error('Supply an original board JSON/text file; this report has no puzzle layout.');
  if(embedded&&JSON.stringify(grid)!==JSON.stringify(embedded))throw new Error('Original board and solution report describe different puzzles.');
  return grid;
}
function note(value,label) {
  if(value==null)return '';
  if(typeof value!=='string'||value.length>20000)throw new Error(`${label} must be text (maximum 20000 characters).`);
  return value;
}
function normalizeActions(report, originalGrid) {
  if(report.version!==2)throw new Error('Unsupported akari-replay version; expected version 2.');
  const grid=resolveGrid(report,originalGrid);
  marksCheck(grid,report.initial_marks??{},'Initial marks');
  const initialMarks={...(report.initial_marks??{})};
  if(!Array.isArray(report.steps)||report.steps.length>10000)throw new Error('Invalid or oversized steps array.');
  if(report.complete!==undefined&&typeof report.complete!=='boolean')throw new Error('complete must be a boolean.');
  const events=[];let current={...initialMarks};
  for(const [i,step] of report.steps.entries()){
    if(!step||typeof step!=='object'||Array.isArray(step))throw new Error(`Step ${i+1}: expected an object.`);
    const before={...current},changes=step.marks??{},applied={},added={},removed={};
    if(typeof changes!=='object'||changes===null||Array.isArray(changes))throw new Error('Step marks must map coordinates to Lamp, Mark or null.');
    for(const[k,v]of Object.entries(changes)){
      const[r,c]=coord(k);
      if(!white(grid,r,c)||!['Lamp','Mark',null].includes(v))throw new Error(`Step ${i+1}: illegal mark ${k}=${v}.`);
      if(v===null){if(k in current){removed[k]=current[k];delete current[k];applied[k]=null;}}
      else if(current[k]!==v){if(k in current)removed[k]=current[k];current[k]=v;added[k]=v;applied[k]=v;}
    }
    const title=note(step.title,'Step title'),explanation=note(step.note,'Step note');
    if(!Object.keys(applied).length&&!title&&!explanation)throw new Error(`Step ${i+1}: empty step requires a title or note.`);
    if(step.before!==undefined){marksCheck(grid,step.before,'Provided before');if(!same(step.before,before))throw new Error(`Step ${i+1}: provided before state does not match replay.`);}
    if(step.after!==undefined){marksCheck(grid,step.after,'Provided after');if(!same(step.after,current))throw new Error(`Step ${i+1}: provided after state does not match replay.`);}
    let event={type:'action',step:i+1,title,note:explanation,centers:[],cost:null,
      before,after:{...current},new_marks:added,changes:applied,removed_marks:removed,
      facts_before:facts(grid,before),facts_after:facts(grid,current),conclusions:{},
      board_after:boardText(grid,current),cell_states_after:cellStates(grid,current),verification:null,hasProof:false};
    if(step.proof!==undefined){
      if(step.proof?.format!=='strict-local-v6'||!step.proof.event)throw new Error(`Step ${i+1}: unsupported proof format.`);
      const source=step.proof.event;
      if(Object.keys(removed).length||!same(source.before,before)||!same(source.after,current)||!same(source.new_marks,added))throw new Error(`Step ${i+1}: proof does not match this action/state transition.`);
      // Validate optional proof through the existing adapter, not a permissive
      // interpretation of partial candidate data. Preserve the real evidence.
      const result=normalizeStrictReport({schema_version:6,inference_model:'strict_local_centers',grouping:'same_state_independent_cost_one',puzzle:{grid},history:[{...source,step:1}]},grid);
      event={...result.events[0],step:i+1,title,note:explanation,hasProof:true};
    }
    events.push(event);
  }
  const puzzle=report.puzzle&&typeof report.puzzle==='object'&&!Array.isArray(report.puzzle)?report.puzzle:{};
  return {report:{...report,puzzle,title:note(report.title,'Replay title')},grid,events,initialMarks,terminal:report.status&&report.status!=='solved'?{type:String(report.status),reason:note(report.note,'Report note')}:null,format:'akari-replay-v2'};
}
function normalizeFinal(report,originalGrid){
  if(report.version!==2||!Array.isArray(report.lamps)||report.lamps.length>2500)throw new Error('akari-solution v2 requires a lamps array of [row, column].');
  const marks={};
  for(const cell of report.lamps){if(!Array.isArray(cell)||cell.length!==2||cell.some(v=>!Number.isInteger(v)||v<1))throw new Error('Lamp coordinates must be one-based integer [row, column] pairs.');marks[key(cell[0]-1,cell[1]-1)]='Lamp';}
  const result=normalizeActions({...report,format:'akari-replay',initial_marks:{},steps:[{marks,title:'Final lamp layout',note:'Final-answer-only input. All supplied lamps are shown in one action; no reasoning sequence or proof was supplied.'}]},originalGrid);
  return {...result,report:{...result.report,format:'akari-solution'},format:'akari-solution-v2'};
}
registerReplayAdapter('strict-local-v6',r=>r.schema_version!==undefined,normalizeStrictReport);
registerReplayAdapter('akari-replay-v2',r=>r.format==='akari-replay',normalizeActions);
registerReplayAdapter('akari-solution-v2',r=>r.format==='akari-solution',normalizeFinal);

export function normalizeReport(report,originalGrid=null){
  report=upgradeInput(report);
  if(!report||typeof report!=='object'||Array.isArray(report))throw new Error('Expected a replay JSON object.');
  const adapter=adapters.find(a=>a.matches(report));
  if(!adapter)throw new Error('Unsupported input. Use strict-local schema v6, akari-replay v2, or akari-solution v2; convert other solver formats first.');
  const out=adapter.normalize(report,originalGrid);
  // Custom adapters must emit the same safe, replayable state transitions.
  out.grid=validateGrid(out.grid);
  marksCheck(out.grid,out.initialMarks,'Initial marks');
  if(!Array.isArray(out.events)||out.events.length>10000)throw new Error('Adapter returned invalid events.');
  let previous=out.initialMarks;
  for(const [i,e] of out.events.entries()){
    marksCheck(out.grid,e.before,'Before');marksCheck(out.grid,e.after,'After');
    if(e.step!==i+1||!same(e.before,previous))throw new Error('Adapter returned a broken replay chain.');
    e.hasProof=e.type==='brain'||e.type==='fast_mark';
    previous=e.after;
  }
  out.completion=completion(out.grid,previous);
  out.warnings=[];
  if(out.report.complete===true&&!out.completion.solved)out.warnings.push('Input claims completion, but the final board does not satisfy all Akari rules.');
  return out;
}
export function boardText(grid, marks) {
  return cellStates(grid,marks).map(row=>row.map(cell=>{
    if(cell.kind!=='Clue')return cell.kind;
    return `Clue:${cell.satisfied?'Satisfied':cell.remaining}`+(cell.remaining!==cell.original?`[original=${cell.original}]`:'');
  }).join(' ')).join('\n');
}
export function clueState(grid,marks,r,c){
  const original=grid[r]?.[c];if(!(original>=0))return null;
  const count=[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].filter(([rr,cc])=>marks[key(rr,cc)]==='Lamp').length;
  return {kind:'Clue',original,remaining:original-count,satisfied:original===count};
}
export function cellStates(grid,marks){
  const lit=light(grid,marks),state=positionState(grid,marks);
  return grid.map((row,r)=>row.map((v,c)=>v>=0?clueState(grid,marks,r,c):v===-2?{kind:'Wall'}:
    {kind:state[key(r,c)]||'Empty',action:marks[key(r,c)]??null,lit:lit.has(key(r,c))}));
}
