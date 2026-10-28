/** Legacy-compatible Durable Object constructor.
 * Reuses the same proven WebSocket Hibernation state/methods in Node tests and
 * Cloudflare Workers; no RPC is exposed, only the fetch handler is used.
 */
import {KaraokeRoomCore} from '../lib/karaoke-room-core.js';
export class KaraokeRoom extends KaraokeRoomCore {}
