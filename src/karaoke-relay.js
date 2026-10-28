/** Cloudflare runtime Durable Object. Real socket handling stays testable. */
import {DurableObject} from 'cloudflare:workers';
import {KaraokeRoomCore} from '../lib/karaoke-room-core.js';
export class KaraokeRoom extends DurableObject {
 constructor(ctx,env){
  super(ctx,env);
  this.relay=new KaraokeRoomCore(ctx,env);
 }
 fetch(request){return this.relay.fetch(request)}
 webSocketMessage(ws,raw){return this.relay.webSocketMessage(ws,raw)}
 webSocketClose(ws,code,reason,wasClean){return this.relay.webSocketClose(ws,code,reason,wasClean)}
 webSocketError(ws,error){return this.relay.webSocketError(ws,error)}
}
