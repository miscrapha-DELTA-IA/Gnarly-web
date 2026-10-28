/** Bounded WSOLA for an explicit <=15s export, executed off the UI thread. */
export function stretchClip(channels,rate,speed,seconds){
 const length=Math.ceil(seconds*rate),size=1024,hop=512,search=192;
 if(!channels.length||channels.length>2||length>480001||!Number.isFinite(speed)||speed<.5||speed>2)throw Error('Trecho fora do limite de exportação.');
 const output=channels.map(()=>new Float32Array(length+size)),weights=new Float32Array(length+size);
 const input=channels[0];let previous=0;
 for(let at=0,n=0;at<length;at+=hop,n++){
  const expected=Math.round(n*hop*speed);let best=Math.max(0,Math.min(input.length-size,expected)),score=-Infinity;
  if(n)for(let candidate=Math.max(0,expected-search);candidate<=Math.min(input.length-size,expected+search);candidate+=4){
   let cross=0,aa=0,bb=0;
   for(let i=0;i<hop;i+=4){const a=input[previous+hop+i]||0,b=input[candidate+i]||0;cross+=a*b;aa+=a*a;bb+=b*b}
   const similarity=cross/Math.sqrt(Math.max(1e-12,aa*bb))-.00001*Math.abs(candidate-expected);
   if(similarity>score){score=similarity;best=candidate}
  }
  for(let i=0;i<size;i++){
   const weight=.5-.5*Math.cos(2*Math.PI*i/size);weights[at+i]+=weight;
   for(let c=0;c<channels.length;c++)output[c][at+i]+=(channels[c][best+i]||0)*weight;
  }
  previous=best;
 }
 return output.map(channel=>{const result=channel.subarray(0,length);for(let i=0;i<length;i++)result[i]/=Math.max(.0001,weights[i]);return result});
}
