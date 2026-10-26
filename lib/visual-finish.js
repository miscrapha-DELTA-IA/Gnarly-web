/**
 * One-pass color/edge finishing for existing native Metal -> WebGL2 surfaces.
 * No texture readbacks, second render targets, bloom blur, or shader recompute
 * per frame. All original material shape equations/palettes remain untouched.
 */
export const GNARLY_FINISH_GLSL=String.raw`
float gnarlyFinishHash(vec2 p) {
 p=fract(p*vec2(.1031,.1030));
 p+=dot(p,p.yx+33.33);
 return fract((p.x+p.y)*p.x);
}
vec3 gnarlyFinish(vec3 linearColor,vec2 px) {
 vec3 c=clamp(linearColor,0.0,1.0);
 // Midtone separation without compressing highlights or washing shadows.
 vec3 contoured=smoothstep(vec3(.015),vec3(.985),c);
 c=mix(c,contoured,.105);
 // Edge-aware microcontrast in the source shader's own pixel derivatives.
 // No texture samples, no sharpening halos, and no temporal feedback.
 float detail=clamp(dot(fwidth(c),vec3(.2126,.7152,.0722)),0.0,.30);
 c=clamp((c-.5)*(1.0+detail*.08)+.5,0.0,1.0);
 // Sub-LSB stationary dither prevents 8-bit banding on smooth Metal gradients.
 float dither=(gnarlyFinishHash(floor(px))-.5)*(0.68/255.0);
 return clamp(c+dither,0.0,1.0);
}
`;
export function improveCreativeEdges(fragment) {
 const original='return 1.0 - smoothstep(width, width * 1.8, abs(sin(v)));';
 const improved='float aa=max(width*0.8,0.70*fwidth(v)); return 1.0-smoothstep(width,width+aa,abs(sin(v)));';
 const originalDots='return 1.0 - smoothstep(radius-0.07,radius+0.035,length(cell));';
 const improvedDots='float dist=length(cell); float aa=max(0.025,fwidth(dist)*0.72); return 1.0-smoothstep(radius-max(0.07,aa),radius+max(0.035,aa),dist);';
 if(!fragment.includes(original)||!fragment.includes(originalDots))throw Error('CreativeUniverse GLSL contract changed: verify native anti-aliasing');
 return fragment.replace(original,improved).replace(originalDots,improvedDots);
}
export function finishedShader(fragment) {
 const index=fragment.lastIndexOf('void main()');
 const last=fragment.lastIndexOf('}');
 if(index<0||last<index)throw Error('Fragment has no final main()');
 return fragment.slice(0,index)+GNARLY_FINISH_GLSL+
  fragment.slice(index,last)+
  '\n fragColor.rgb=gnarlyFinish(fragColor.rgb,gl_FragCoord.xy);\n'+fragment.slice(last);
}
