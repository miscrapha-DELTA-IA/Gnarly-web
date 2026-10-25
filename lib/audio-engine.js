export class WebAudioEngine {
  constructor(audio){this.audio=audio;this.ctx=null;this._bass=0;this._wet=0;this._energy=0;this.data=null}
  init(){if(this.ctx)return;const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;const c=this.ctx=new Audio();this.src=c.createMediaElementSource(this.audio);this.bassFilter=c.createBiquadFilter();this.bassFilter.type='lowshelf';this.bassFilter.frequency.value=165;this.bassFilter.gain.value=this._bass;this.dry=c.createGain();this.wet=c.createGain();this.reverbNode=c.createConvolver();this.reverbNode.buffer=this.impulse(c);this.analyser=c.createAnalyser();this.analyser.fftSize=512;this.data=new Uint8Array(this.analyser.frequencyBinCount);this.src.connect(this.bassFilter);this.bassFilter.connect(this.analyser);this.analyser.connect(this.dry);this.analyser.connect(this.reverbNode);this.reverbNode.connect(this.wet);this.dry.connect(c.destination);this.wet.connect(c.destination);this.setReverb(this._wet)}
  impulse(c){const n=Math.round(c.sampleRate*1.5),buff=c.createBuffer(2,n,c.sampleRate);for(let ch=0;ch<2;ch++){const a=buff.getChannelData(ch);for(let i=0;i<n;i++)a[i]=(Math.random()*2-1)*Math.pow(1-i/n,2.8)}return buff}
  async resume(){this.init();if(this.ctx?.state==='suspended')await this.ctx.resume()}
  setSpeed(value,preserve=true){this.audio.playbackRate=value;if('preservesPitch'in this.audio)this.audio.preservesPitch=preserve;if('webkitPreservesPitch'in this.audio)this.audio.webkitPreservesPitch=preserve}
  setBass(value){this._bass=value;if(this.bassFilter)this.bassFilter.gain.value=value}
  setReverb(value){this._wet=value;if(this.wet)this.wet.gain.value=value*.68;if(this.dry)this.dry.gain.value=1-value*.28}
  sampleEnergy(){if(!this.analyser||this.audio.paused)return 0;this.analyser.getByteFrequencyData(this.data);let sum=0;for(let i=0;i<75;i++)sum+=this.data[i]||0;return Math.min(1,sum/(75*175))}
}
