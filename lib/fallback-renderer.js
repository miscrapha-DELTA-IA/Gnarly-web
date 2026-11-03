/**
 * GNARLY Canvas2D fallback painter (used only when WebGL2 is unavailable).
 * An identical palette/geometry equation with sine/cosine recurrences
 * instead of recalculating three trigonometric functions per image pixel.
 * No audio, DOM, network, storage or GPU resources are accessed here.
 */
export function paintFallbackFrame(data,width,height,colors,elapsed){
 if(width<=0||height<=0)return;
 const t=elapsed*.22,step=8/width,step2=-step*.42;
 const cs=Math.cos(step),ss=Math.sin(step),cc=Math.cos(step2),sc=Math.sin(step2);
 for(let y=0;y<height;y++){
  const b=y/height*12,wave=Math.sin(b*.65+t)*1.5;
  let sine=Math.sin(wave),cosine=Math.cos(wave);
  const phase=b*.8+t*.6;
  let secondSine=Math.sin(phase),secondCosine=Math.cos(phase);
  let offset=y*width*4;
  for(let x=0;x<width;x++){
   const f=(sine+secondCosine+2)/4;
   const index=Math.min(2,Math.floor(Math.max(0,Math.min(.999,f))*3));
   const color=colors[index];
   data[offset++]=color[0]*255;data[offset++]=color[1]*255;
   data[offset++]=color[2]*255;data[offset++]=255;
   const nextSine=sine*cs+cosine*ss;
   cosine=cosine*cs-sine*ss;sine=nextSine;
   const nextSecondSine=secondSine*cc+secondCosine*sc;
   secondCosine=secondCosine*cc-secondSine*sc;secondSine=nextSecondSine;
  }
 }
}
