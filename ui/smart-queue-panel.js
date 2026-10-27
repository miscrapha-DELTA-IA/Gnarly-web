/** Three-action queue chrome. Smart radio, taste memory, verified candidate
 * selection and playlists remain in the engine rather than crowding the sheet.
 * Modelled after the compact Mix / Queue surface in native GNARLY.
 */
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function renderSmartQueuePanel({queueCount=0,status='',anchor=null,busy=false,playing=false}={}){
 const ready=Boolean(anchor),count=Math.max(0,Number(queueCount)||0);
 const activity=busy?'Buscando próximas músicas…':
  status&&(/Sem novas|Não há|Falha|indisponível|preservada/i.test(status))?status:'';
 return `<section class="smart-queue-panel native-queue" aria-label="Fila inteligente automática">
   <div class="native-queue-top"><div>
    <strong class="native-queue-name">A seguir <span class="native-queue-number">${count}</span></strong>
    <span class="native-queue-auto"><span aria-hidden="true" class="native-queue-pulse"></span>Mix inteligente</span>
   </div></div>
   <div class="native-queue-actions" role="group" aria-label="Ações da fila">
    <button type="button" data-command="queue-play" class="native-queue-action primary" ${!ready&&!count?'disabled':''} aria-label="${playing?'Continuar reprodução':'Tocar músicas da fila'}"><span aria-hidden="true">▶</span><span>Tocar</span></button>
    <button type="button" data-command="queue-shuffle" class="native-queue-action" ${count<2?'disabled':''} aria-label="Misturar ordem das próximas músicas"><span aria-hidden="true">⇄</span><span>Aleatório</span></button>
    <button type="button" data-command="smart-refresh" class="native-queue-action" ${!ready||busy?'disabled':''} aria-label="Atualizar sugestões automáticas"><span aria-hidden="true">↻</span><span>Atualizar</span></button>
   </div>
   ${activity?'<p class="native-queue-status" role="status">'+esc(activity)+'</p>':''}
   ${!ready?'<p class="native-queue-hint">Escolha uma música em Busca para o Mix continuar automaticamente.</p>':''}
  </section>`;
}
