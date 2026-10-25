import test from 'node:test';
import assert from 'node:assert/strict';
import {scaleVisionConfig,readScaleWithVision} from '../server/scale-vision.mjs';

test('scale vision is opt-in and extracts only a two-decimal weight',async()=>{
 assert.equal(scaleVisionConfig({}),null);
 const config=scaleVisionConfig({CRC_OPENAI_API_KEY:'secret'});let request;
 const weight=await readScaleWithVision({config,image:'data:image/png;base64,AAAA',fetchImpl:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({output_text:'14.72'})}}});
 assert.equal(weight,14.72);assert.equal(request.url,'https://api.openai.com/v1/responses');assert.doesNotMatch(request.options.body,/secret/);
});
test('scale vision preserves provider status without exposing the key',async()=>{
 await assert.rejects(()=>readScaleWithVision({config:{apiKey:'secret',model:'gpt-4.1-mini'},image:'data:image/png;base64,AAAA',fetchImpl:async()=>({ok:false,status:429,json:async()=>({error:{message:'quota exceeded'}})})}),error=>error.status===429&&error.message==='quota exceeded');
});
