// Canonical vocabulary. Lit is a derived illumination state, never an action.
export const Cell = Object.freeze({Lamp:'Lamp',Mark:'Mark',Lit:'Lit',Empty:'Empty',Wall:'Wall',Clue:'Clue',Satisfied:'Satisfied'});
export const PROOF_SCHEMA = 8;
const LEGACY_PROOF_SCHEMA = 6;
export const ACTION_VERSION = 2;

// Input-only compatibility for the previous shorthand schemas. It never appears
// in generated reports, diagrams, labels, or exports. Decode exact action maps,
// not arbitrary notes, author names, puzzle encodings or HTML.
export function upgradeInput(input){
 if(!input || typeof input!=='object' || Array.isArray(input))return input;
 const oldProof=input.schema_version===5;
 const oldAction=['akari-replay','akari-solution'].includes(input.format)&&input.version===1;
 if(!oldProof&&!oldAction)return input;
 const actionKeys=new Set(['marks','new_marks','before','after','initial_marks','explicit_marks','logical_facts','facts_before','facts_after','conclusions','direct_effects','assumptions','proposed_marks','duplicate_marks','redundant_marks','removed_marks','changes']);
 const convertValue=v=>v===String.fromCharCode(79)?Cell.Lamp:v===String.fromCharCode(88)?Cell.Mark:v;
 const visit=(obj,field='')=>{
  if(Array.isArray(obj))return obj.map(v=>visit(v,field));
  if(!obj||typeof obj!=='object'){
   if(field==='centers'&&typeof obj==='string')return obj.replace(/^x@/,'mark@');
   return obj;
  }
  if(actionKeys.has(field)||field==='candidates')return Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,convertValue(v)]));
  const out={};
  for(const[k,v]of Object.entries(obj)){
   // Old diagram/prose fields cannot be trusted as canonical display snapshots.
   if(['board_after','final','cell_states_after'].includes(k))continue;
   if(k==='proof'&&v?.format==='strict-local-v5')out[k]={...v,format:'strict-local-v6',event:visit(v.event)};
   else out[k]=visit(v,k);
  }
  return out;
 };
 const out=visit(input);
 if(oldProof)out.schema_version=LEGACY_PROOF_SCHEMA;
 if(oldAction)out.version=ACTION_VERSION;
 return out;
}
