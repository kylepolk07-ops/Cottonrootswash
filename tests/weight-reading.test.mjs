import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseScaleWeight} from '../server/weight-reading.mjs';

test('scale reader favors a decimal display over unrelated whole numbers',()=>{
 const reading=chooseScaleWeight({data:{text:'21 14.76 lb',confidence:80,words:[{text:'21',confidence:96},{text:'14.76',confidence:82},{text:'lb',confidence:90}]}});
 assert.equal(reading.value,14.76);
});

test('scale reader accepts a normal tenths display',()=>{
 assert.equal(chooseScaleWeight({data:{text:'8.5',confidence:91}}).value,8.5);
});

test('scale reader rejects absent and implausible readings',()=>{
 assert.equal(chooseScaleWeight({data:{text:'lb'}}),null);
 assert.equal(chooseScaleWeight({data:{text:'999.9'}}),null);
});
