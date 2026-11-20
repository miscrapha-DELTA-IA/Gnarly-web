# GNARLY Karaoke Connect — voz do celular no PC (WebRTC)

## O que muda

- O botão **Usar celular como microfone** mantém o pareamento privado já existente.
- O iPhone/Android abre `mic.html`, autoriza o microfone com um toque e inicia a pontuação local/relatada ao desktop.
- Após **mic-on**, o desktop faz uma oferta WebRTC de áudio **recvonly**; o celular responde com o track `getUserMedia()` já autorizado.
- O Durable Object transmite **apenas sinalização SDP/ICE, indicadores vocais, status e relógio de reprodução**. O áudio da voz usa **WebRTC DTLS-SRTP** entre navegadores; não passa pelo Worker, Guardian, R2, Render, Whisper ou pelo player musical.
- No desktop, o áudio remoto entra em um `AudioContext` independente. O volume é ajustável, mas o retorno começa **desligado**. Marque **Ouvir minha voz pelo PC** com fones para monitorar sem microfonia. O reprodutor de música, queue, efeitos e lyric clock não são modificados.
- O WebRTC é opcional: caso falhe ou seja bloqueado, a pontuação de presença/ritmo baseada em indicadores continua funcionando.

## Deploy obrigatório

1. Publicar a branch/PR do frontend Cloudflare Pages (incluindo `mic.html`, `mic.js`, `lib/karaoke-remote.js` e `ui/karaoke-stage.js`).
2. Atualizar também o **Worker separado** `gnarly-web.miscrapha.workers.dev`, que é dono de `/karaoke-relay/:room`, com `lib/karaoke-room-core.js` e `lib/karaoke-relay-protocol.js`. **Publicar apenas Pages não ativa a transmissão de voz**, pois o Worker antigo ignorará `rtc-offer`/`rtc-answer`/`rtc-candidate`.
3. Confirmar que o binding `KARAOKE_ROOMS` e a migração `karaoke-room-v1` permanecem configurados. Nenhuma nova migração ou conta TURN é necessária para a primeira versão LAN.
4. Verificar no domínio HTTPS publicado; outros domínios precisam ser autorizados explicitamente na política de `Origin` de `src/worker.js`.

## Uso

1. Computador: abra GNARLY → Karaokê → Expandir → **Usar celular como microfone**; copie o link.
2. Celular: conecte preferencialmente ao **mesmo Wi‑Fi**, abra o link no Safari/Chrome e toque **Ativar microfone**. Mantenha a página ativa.
3. Computador: aguarde **Áudio conectado**. Use fones e marque **Ouvir minha voz pelo PC**, regulando o volume do microfone independentemente do volume musical.
4. Para parar, toque **Desligar microfone** no celular ou **Desconectar celular** no desktop. Fechar o karaokê encerra o canal.

## Limitações e critérios de aceitação

- P2P sem TURN **não garante conexão entre redes distintas, redes corporativas ou isolamento entre clientes Wi‑Fi**. STUN externo ajuda a descobrir rotas (metadados de conectividade podem ser vistos pelo serviço STUN), mas não retransmite o áudio.
- WebRTC oferece áudio interativo de baixa latência em condições favoráveis, **sem garantia de sincronia zero**; há latência variável de rede, buffer, iOS Safari, drivers e especialmente Bluetooth. Monitorar com fones conectados ao PC evita que a música dos alto-falantes entre no microfone do celular.
- Ao bloquear a tela/colocar Safari em segundo plano, o sistema pode suspender a captura. O recurso tenta manter a tela ativa quando suportado.
- A pontuação remota continua baseada em voz/ritmo/presença, não em referência melódica verificada.
- Validar em **iPhone físico + PC físico**: permissão mic, conexão no mesmo Wi-Fi, entrada de áudio real, retorno ligado/desligado, mudança de volume, desligar e religar, seek, pause, mudanças de faixa, troca para mic local, fechamento e erro de rede.
- Rodar `npm test`, `npm run build:pages` e o workflow de aceitação de karaokê. Os testes automatizados de sinalização não substituem medição de latência, feedback e áudio nos dois dispositivos reais.

## Privacidade

A sala do Worker recebe um segredo aleatório por sessão. O link de convite contém um token no fragmento `#`, removido da barra do navegador após a entrada. O servidor recebe SDP e candidatos ICE necessários ao pareamento, mas **não o fluxo de mídia WebRTC**. A voz não é gravada nem enviada ao Whisper por esta ponte. O próprio microfone só é capturado após ação explícita no celular; a reprodução local só é liberada por ação explícita no computador.
