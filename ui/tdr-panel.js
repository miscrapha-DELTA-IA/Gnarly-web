/**
 * Read-only, session-local TDR dashboard. Never receives recording metadata.
 * Accessible from More (...) > Tempo de Reprodução and Display > TDR.
 */
const finiteMs=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export function formatTdrDuration(value){
 if(!finiteMs(value))return '—';
 if(value<1000)return Math.round(value)+' ms';
 return (value/1000).toFixed(value<10000?2:1).replace('.',',')+' s';
}
function stat(label,value,detail=''){
 return '<div class="tdr-stat"><span class="tdr-stat-label">'+label+'</span>'+
  '<strong>'+value+'</strong>'+(detail?'<small>'+detail+'</small>':'')+'</div>';
}
function phase(label,data){
 if(!data?.count)return '';
 return '<div class="tdr-phase"><span>'+label+'</span><strong>'+
  formatTdrDuration(data.p50Ms)+'</strong><small>P95 '+formatTdrDuration(data.p95Ms)+
  ' · n='+data.count+'</small></div>';
}
export function renderTdrPanel(report){
 const automatic=report?.automatic||{},totals=report?.totals||{},inProgress=report?.inProgress;
 const recent=Array.isArray(report?.recent)?report.recent.slice(-6).reverse():[];
 const phases=report?.phases||{},routes=report?.byRoute||{};
 const failure=report?.lastFailure||null,failed=report?.terminalFailures||{};
 const failurePhases=report?.failurePhases||{};
 const stageNames={selected:'Faixa selecionada',source_attached:'Fonte atribuída',
  play_requested:'Reprodução solicitada',recovery:'Recuperação iniciada',
  pc_wait:'Aguardando PC Node',pc_processing:'PC Node processando',
  pc_ready:'PC Node pronto',r2_sync:'Verificando cache R2'};
 const observedStage=failure?stageNames[failure.lastObservedStage]||'Etapa não identificada':null;
 const failureTimeline=failure?[
  ['Primeiro erro de mídia',failure.timeToFirstMediaErrorMs],
  ['Início da recuperação',failure.timeToRecoveryMs],
  ['Espera pelo PC Node iniciada',failure.timeToPcWaitMs],
  ['PC Node pronto',failure.timeToPcReadyMs],
  ['Espera pelo cache R2 iniciada',failure.timeToR2SyncMs]
 ].filter(([,elapsed])=>finiteMs(elapsed)).map(([label,elapsed])=>
  '<div class="tdr-attempt"><span>'+label+'</span><strong>+'+
   formatTdrDuration(elapsed)+'</strong></div>').join(''):'';
 const phaseRows=[
  phase('Seleção → Play',phases.selectionToPlay),
  phase('Play → reproduzindo',phases.playToPlaying),
  phase('PC Node · espera total',phases.pcWait),
  phase('PC Node · aguardando fila',phases.pcQueueObserved),
  phase('PC Node · processando',phases.pcLeasedToReady),
  phase('Cache R2 · disponibilidade',phases.r2Sync),
  phase('Confirmação do relógio',phases.clockConfirmationLag)
 ].filter(Boolean).join('');
 const routeLabels={fast_edge:'Cloudflare · /fast-audio',render:'Render · /download',
  offline:'Arquivo offline',independent:'Fonte independente',unknown:'Rota não identificada'};
 const routeRows=Object.entries(routes).filter(([,v])=>v?.count).map(([key,v])=>
  phase(routeLabels[key]||'Outra rota',v)).join('');
 const latest=recent.map(s=>'<div class="tdr-attempt">'+
  '<span>'+(s.kind==='automatic'?'Automática':s.kind==='manual_retry'?'Nova tentativa':'Manual')+
  (s.recovered?' · recuperação':'')+(s.hadMediaError?' · erro inicial':'')+
  (s.lateRecovered?' · iniciou após aviso de erro':'')+'</span>'+
  '<strong>'+formatTdrDuration(s.tdrMs)+'</strong></div>').join('');
 return '<section class="tdr-panel" id="tdr-dashboard" aria-label="Tempo de Reprodução">'+
  '<p class="section-note">TDR = tempo entre selecionar a música e o primeiro evento de reprodução do navegador. A medição não altera o áudio nem o processamento do Guardian.</p>'+
  '<div class="tdr-stats">'+
  stat('TDR MEDIANO',formatTdrDuration(automatic.p50Ms),'P50 · início automático')+
  stat('TDR P95',formatTdrDuration(automatic.p95Ms),'95% das amostras concluídas')+
  stat('TENTATIVAS BEM-SUCEDIDAS',report?.automaticSuccessRatePercent===null?'—':
   String(report.automaticSuccessRatePercent).replace('.',',')+'%','Exclui cancelamentos e novas seleções')+
  stat('AMOSTRAS AUTOMÁTICAS',String(automatic.count||0),'Concluídas · sessão atual, máximo de 96')+
  ((totals.terminalReclassified||0)?stat('REPRODUÇÃO APÓS ERRO',
   String(totals.terminalReclassified),'Alerta terminal revisado após evento playing'):'')+
  (failed.count?stat('FALHAS · TEMPO ATÉ ERRO',
   formatTdrDuration(failed.p50Ms),'Mediana separada · '+failed.count+' falha(s)'):'')+
  '</div>'+
  (inProgress?'<div class="tdr-current" role="status"><span>Preparando áudio · '+
   (inProgress.phase==='recovering'?'Recuperação':inProgress.phase==='connecting'?'Conectando':'Selecionada')+
   '</span><strong id="tdr-live-elapsed">'+formatTdrDuration(inProgress.elapsedMs)+'</strong></div>':
   '<p class="section-note">Nenhuma seleção pendente no momento.</p>')+
  (failure?'<div class="section-head">ÚLTIMA FALHA · LINHA DO TEMPO</div>'+
   '<p class="section-note">Sem reprodução após '+formatTdrDuration(failure.elapsedMs)+
   '. Última etapa observada: <strong>'+observedStage+
   '</strong>. Isso não identifica automaticamente a causa da falha.</p>'+
   (failureTimeline?'<div class="tdr-breakdown">'+failureTimeline+'</div>':'')+
   (finiteMs(failure.pcWaitMs)?'<p class="section-note">Espera PC Node: '+
    formatTdrDuration(failure.pcWaitMs)+(failure.pcWaitComplete?'':' (tempo parcial até o erro)')+'</p>':'')+
   (finiteMs(failure.r2SyncMs)?'<p class="section-note">Espera cache R2: '+
    formatTdrDuration(failure.r2SyncMs)+(failure.r2SyncComplete?'':' (tempo parcial até o erro)')+'</p>':'')+
   (failure.errorCode?'<p class="section-note">Código de mídia observado: '+
    failure.errorCode+'</p>':'')+
   '<p class="section-note">Estes registros só são capturados após a atualização do TDR; não recuperam fases de falhas anteriores.</p>':'')+
  '<div class="section-head">TEMPOS POR ETAPA · MEDIANA</div>'+
  (phaseRows?'<div class="tdr-breakdown">'+phaseRows+'</div>':
   '<p class="section-note">Reproduza algumas músicas para identificar as etapas mais lentas.</p>')+
  (routeRows?'<div class="section-head">ROTAS DE ENTREGA</div><div class="tdr-breakdown">'+routeRows+
   '</div><p class="section-note">A rota Cloudflare não comprova, por si só, que houve acerto no cache R2.</p>':'')+
  (recent.length?'<div class="section-head">ÚLTIMAS REPRODUÇÕES</div>'+
   '<div class="tdr-attempts">'+latest+'</div>':'')+
  '<div class="section-head">RESUMO DA SESSÃO</div>'+
  '<p class="section-note">Selecionadas: '+(totals.selections||0)+
  ' · Concluídas: '+(totals.successful||0)+
  ' · Erros finais: '+(totals.terminalErrors||0)+
  ' · Alertas corrigidos por reprodução tardia: '+(totals.terminalReclassified||0)+
  ' · Canceladas: '+(totals.userCancels||0)+'</p>'+
  '<div class="button-row">'+
  '<button type="button" class="action-button" data-command="tdr-refresh">Atualizar métricas</button>'+
  '<button type="button" class="action-button alt" data-command="tdr-copy">Copiar relatório TDR</button>'+
  '</div><p class="section-note">Somente dados desta aba/sessão, sem IDs, títulos ou links das músicas. Início estimado pelo evento playing; a confirmação do relógio aparece separadamente.</p>'+
  '</section>';
}
