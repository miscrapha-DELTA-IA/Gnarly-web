import {SMART_MODES,SMART_LABELS} from '../lib/smart-queue.js';
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function renderSmartQueuePanel({mode='off',queueCount=0,playlistNames=['Meu Mix'],selectedPlaylist='Meu Mix',playlistCount=0,status='',anchor=null}={}){
 const modes=SMART_MODES.map(m=>'<button type="button" class="smart-chip '+(mode===m?'active':'')+'" data-smart-mode="'+m+'" aria-pressed="'+(mode===m)+'">'+SMART_LABELS[m]+'</button>').join('');
 const options=playlistNames.map(name=>'<option value="'+esc(name)+'" '+(name===selectedPlaylist?'selected':'')+'>'+esc(name)+'</option>').join('');
 const seed=anchor?'<span class="smart-anchor">'+esc(anchor.artist||'')+' · '+esc(anchor.album||anchor.title||'')+'</span>':'<span class="smart-anchor">Escolha uma música para orientar o mix</span>';
 return '<div class="smart-queue-panel"><div class="section-head">FILA INTELIGENTE · '+queueCount+' a seguir</div>'+
   '<div class="smart-chip-row" role="group" aria-label="Tipo de fila">'+modes+'</div>'+
   '<div class="smart-queue-explain">Manual preserva sua ordem. Artista e Álbum procuram outras faixas da mesma origem. Mix alterna álbuns do artista. Playlist utiliza sua coleção salva. Nenhuma opção troca uma música já adicionada.</div>'+
   seed+'<div class="smart-queue-actions"><button type="button" class="action-button alt" data-command="smart-refresh">Completar fila</button>'+
   '<button type="button" class="action-button alt" data-command="playlist-add-current">Salvar atual</button></div>'+
   '<p class="status-text" role="status">'+esc(status)+'</p>'+
   '<div class="smart-playlist-controls"><label class="smart-playlist-name" for="smart-playlist-select">PLAYLIST</label>'+
   '<select id="smart-playlist-select" data-smart-playlist aria-label="Playlist selecionada">'+options+'</select>'+
   '<button class="action-button alt" data-command="playlist-create" type="button">+ Nova</button>'+
   '<button class="action-button alt" data-command="playlist-load" type="button">Enfileirar '+playlistCount+'</button></div>'+
   '<div class="smart-playlist-subactions"><button type="button" class="action-button alt" data-command="playlist-delete">Excluir playlist selecionada</button></div></div>';
}
