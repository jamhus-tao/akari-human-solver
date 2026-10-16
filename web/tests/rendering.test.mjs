import test from 'node:test';
import assert from 'node:assert/strict';
import {illuminationCounts,illuminationStrengths,litColor,puzzleCellColor} from '../src/rendering.mjs';

test('independent crossing lamps accumulate once each, stop at walls and ignore Mark actions',()=>{
 const grid=[[-1,-1,-2],[-1,-1,-1],[-2,-1,0]];
 const marks={'(1,2)':'Lamp','(2,1)':'Lamp','(2,2)':'Mark'};
 const counts=illuminationCounts(grid,marks);
 assert.equal(counts.get('(2,2)'),2);
 assert.equal(counts.get('(1,1)'),2);
 assert.equal(counts.get('(1,2)'),1);
 assert.equal(counts.get('(2,1)'),1);
 assert.equal(counts.get('(2,3)'),1);
 assert.equal(counts.has('(1,3)'),false);
 assert.equal(counts.has('(3,3)'),false);
 assert.deepEqual(marks,{'(1,2)':'Lamp','(2,1)':'Lamp','(2,2)':'Mark'});
 const strengths=illuminationStrengths(grid,marks);
 assert.deepEqual(strengths.get('(1,1)'),[1,1]);
 assert.deepEqual(strengths.get('(2,3)'),[0.96]);
});

test('original shader keeps checker modulation under light and compresses overlaps',()=>{
 assert.equal(puzzleCellColor(0,false),'#425566');
 assert.equal(puzzleCellColor(0,true),'#50677c');
 assert.equal(litColor(1,false),'#22a8e2');
 assert.equal(litColor(1,true),'#24b3f1');
 assert.equal(litColor(2,false),'#7cd0f4');
 assert.equal(litColor(2,true),'#84d3f6');
 assert.equal(litColor(3,false),'#e3eef4');
 assert.equal(litColor(3,true),'#ebf2f6');
 assert.equal(litColor(20,true),'#f2f4f6');
 assert.equal(litColor([0.96],false),'#21a2da');
 assert.equal(litColor([0.94],true),'#23aae4');
 assert.equal(litColor([0.8],true),'#2095c7');
 assert.throws(()=>litColor(0));
 assert.throws(()=>puzzleCellColor(-1));
});
