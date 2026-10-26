/** Installed standalone mode is controlled by the user/browser, not the website. */
export function isStandalone({standalone=false,displayModeStandalone=false}={}){
 return Boolean(standalone||displayModeStandalone);
}
export function installPlatform(userAgent='',touchPoints=0){
 const ua=String(userAgent);
 if(/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/i.test(ua)&&touchPoints>1))return 'ios';
 if(/Android/i.test(ua))return 'android';
 return 'desktop';
}
export function installModeFromBrowser(win=window){
 return isStandalone({
  standalone:win.navigator?.standalone===true,
  displayModeStandalone:!!win.matchMedia?.('(display-mode: standalone)').matches
 });
}
export function renderAppInstallGuide({platform='ios',standalone=false}={}){
 const intro=standalone?
  '<div class="install-status is-installed" role="status">✓ Você já está usando o GNARLY como aplicativo, sem a barra do Safari.</div>':
  '<div class="install-status" role="status">Ao abrir como aplicativo, o GNARLY ocupa a tela sem a barra de endereço do navegador.</div>';
 const steps=standalone?'':
  platform==='ios'?
  '<ol class="install-steps"><li>Abra <strong>gnarly-web-stage72.pages.dev</strong> no <strong>Safari</strong>.</li><li>Toque em <strong>Compartilhar</strong> (ícone com seta para cima).</li><li>Escolha <strong>Adicionar à Tela de Início</strong>.</li><li>Ative <strong>Abrir como App</strong> e toque em <strong>Adicionar</strong>.</li><li>Na Tela de Início, abra o novo ícone <strong>GNARLY</strong>.</li></ol>':
  platform==='android'?
  '<ol class="install-steps"><li>Abra este site no Chrome.</li><li>No menu do navegador, escolha <strong>Instalar app</strong> ou <strong>Adicionar à Tela inicial</strong>.</li><li>Abra o ícone <strong>GNARLY</strong>.</li></ol>':
  '<p class="section-note">No Safari para Mac, use <strong>Arquivo → Adicionar ao Dock</strong>, quando disponível. No Chrome ou Edge, procure <strong>Instalar aplicativo</strong> no menu do navegador.</p>';
 return '<section class="install-app-panel" aria-label="Instalar GNARLY">'+
  '<div class="install-brand"><img src="./assets/gnarly-icon.png" alt="Ícone GNARLY" width="76" height="76"/><div><span class="install-overline">GNARLY / WEB APP</span><h3>GNARLY como aplicativo</h3><p>Uma tela imersiva para música e visuais.</p></div></div>'+
  intro+steps+
  '<p class="install-hint">O Safari não permite que um site esconda sozinho sua barra de endereço em uma aba normal. O modo aplicativo depende da instalação na Tela de Início.</p>'+
  '</section>';
}
