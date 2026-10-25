export function scaleVisionConfig(env=process.env){
 const apiKey=String(env.CRC_OPENAI_API_KEY||'').trim();
 if(!apiKey)return null;
 return {apiKey,model:String(env.CRC_SCALE_VISION_MODEL||'gpt-4.1-mini').trim()};
}

export async function readScaleWithVision({config,image,fetchImpl=fetch}){
 if(!config)return null;
 const response=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:config.model,input:[{role:'user',content:[{type:'input_text',text:'Read the large illuminated weight on this digital laundry scale display. Ignore all capacity, graduation, model, unit, and other printed numbers. Return only the weight in pounds with exactly two decimal places, for example 14.72. If the display is not unambiguous, return unreadable.'},{type:'input_image',image_url:image}]}],max_output_tokens:20})});
 if(!response.ok)throw Error(`Scale vision service returned ${response.status}`);
 const data=await response.json(),text=String(data.output_text||data.output?.flatMap(item=>item.content||[]).find(item=>item.type==='output_text')?.text||'').trim(),match=text.match(/(?:^|\s)(\d{1,3}\.\d{2})(?:\s|$)/),weight=match?Number(match[1]):NaN;
 return Number.isFinite(weight)&&weight>=.1&&weight<=200?weight:null;
}
