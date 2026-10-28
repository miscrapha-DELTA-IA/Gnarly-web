/** A tiny player-local shortcut, not a new playlist management screen. */
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;')
 .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function quickPlaylistMarkup(names=[],currentName='Meu Mix'){
 const items=[...new Set(names)].filter(Boolean);
 return '<div class="quick-playlist-header"><strong>Salvar em playlist</strong>'+
  '<button class="quick-playlist-dismiss" type="button" data-quick-playlist="close" aria-label="Fechar">×</button></div>'+
  '<div class="quick-playlist-options" role="group" aria-label="Suas playlists">'+
  items.map(name=>'<button type="button" data-quick-playlist="add" data-playlist-name="'+esc(name)+'"'+
   (name===currentName?' class="selected"':'')+'>'+esc(name)+'</button>').join('')+
  '</div><form id="quick-playlist-create" class="quick-playlist-create">'+
  '<label for="quick-playlist-name">Nova playlist</label>'+
  '<div><input id="quick-playlist-name" name="playlist" type="text" maxlength="45" autocomplete="off" placeholder="Nome da playlist"/>'+
  '<button type="submit">Criar + salvar</button></div></form>';
}
