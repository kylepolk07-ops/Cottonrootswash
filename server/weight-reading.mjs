const decimalPlaces=value=>{
 const match=String(value).replace(',','.').match(/[.,](\d+)/);
 return match?match[1].length:0;
};

export function chooseScaleWeight(recognized={}){
 const words=Array.isArray(recognized?.data?.words)?recognized.data.words:[];
 const sources=words.length?words.map(word=>({text:String(word.text||''),confidence:Number(word.confidence)||0})):[{text:String(recognized?.data?.text||''),confidence:Number(recognized?.data?.confidence)||0}];
 const candidates=[];
 for(const source of sources){
  for(const match of source.text.matchAll(/\d{1,3}(?:[.,]\d{1,2})?/g)){
   const raw=match[0],value=Number(raw.replace(',','.'));
   if(!Number.isFinite(value)||value<0.1||value>200)continue;
   const places=decimalPlaces(raw);
   // This shop scale displays hundredths (for example, 14.74). A whole number
   // is usually a capacity/model marking elsewhere in the photo, so never
   // present one as an automatic weight suggestion.
   if(places!==2)continue;
   const score=100+Math.min(100,Math.max(0,source.confidence));
   candidates.push({value,confidence:source.confidence,score,places});
  }
 }
 if(!candidates.length)return null;
 candidates.sort((a,b)=>b.score-a.score||b.places-a.places||b.confidence-a.confidence);
 return candidates[0];
}
