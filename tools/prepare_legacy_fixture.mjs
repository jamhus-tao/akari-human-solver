// Reconstruct input-only v6 evidence from generated v7 proofs. No saved answer
// is embedded in this tool; the Python preparation step solves the puzzle first.
import fs from 'node:fs';
import {validateReplay} from '../web/src/validation.mjs';
const input=JSON.parse(fs.readFileSync('tests/fixtures/v7-daily-2026-10-15.json'));
const replay=validateReplay(input);
if(replay.validation.status!=='valid')throw new Error(JSON.stringify(replay.validation));
// Historical v6 direct_effects meant Boolean constraints, not physical states.
for(const event of replay.events)for(const part of event.components||[event]){
 for(const record of part.branch_proof)if(record.status==='compatible')record.direct_effects=record.constraint_effects;
}
const output={schema_version:6,inference_model:'strict_local_centers',grouping:'same_state_independent_cost_one',
 puzzle:input.puzzle,history:replay.events,complete:replay.completion.solved,status:'solved'};
fs.writeFileSync('tests/fixtures/legacy-v6-daily.json',JSON.stringify(output,null,2)+'\n');
