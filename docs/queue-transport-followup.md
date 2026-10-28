# Fila, navegação e avisos — correção complementar

Esta rodada incorpora a `main` 77eec59, preservando a remoção recente do upload
Canva/iPod. As alterações da primeira rodada ainda não estavam na main; o PR #50
continua sendo a entrega conjunta, sem presumir que o site já foi atualizado.

## Problemas reproduzidos

- Ao tocar A → B → Anterior, A voltava, mas B desaparecia da fila. O próximo
  comando avançava para C. O novo teste de áudio real falhou na revisão anterior
  exatamente nessa lista: recebeu `[C]` quando deveria receber `[B,C]`.
- O comando Tocar da aba Fila consumia a próxima música quando o player estava
  tocando, em vez de funcionar como transporte. Os rótulos não explicavam isso.
- Selecionar na Busca uma música que já estava na fila deixava uma cópia pendente.
- Adições manuais eram colocadas depois das sugestões automáticas.
- Próxima ficava desativada no player e no iPod quando a fila esvaziava, mesmo
  havendo um Mix inteligente capaz de buscar a próxima música.
- A geração da seleção não distinguia Pausar/Play na mesma faixa. Uma rejeição
  atrasada da tentativa anterior podia iniciar recuperação contra a tentativa nova.
- Um play() que nunca resolvia podia aguardar indefinidamente. Next também podia
  reiniciar a consulta de recomendações que já estava em andamento.

## Comportamento corrigido

- Anterior restaura a faixa interrompida no início da fila. Próxima refaz o caminho
  de escuta. Depois de três segundos, Anterior continua reiniciando a faixa atual.
- Tocar/Pausar/Continuar na fila controla a reprodução atual, sem avançar escondido.
- Escolhas explícitas precedem a cauda automática, com promoção e deduplicação.
- Cada tentativa possui um AbortSignal próprio. Troca de faixa, Pausar e retomada
  invalidam promessas antigas, inclusive quando o objeto da faixa continua igual.
- Um adaptador pequeno envolve o HTMLAudioElement existente: inicia play() e desbloqueio
  do grafo no gesto e limita a espera inicial a 30 segundos por tentativa. Esse limite
  aciona a recuperação já existente; não promete que a origem responderá em 30 segundos.
  Nenhum novo player, biblioteca, grafo de efeitos ou conversão foi introduzido.
- Next reaproveita a consulta de recomendações em andamento. Só Atualizar substitui
  explicitamente a consulta. Seleções obsoletas não podem publicar resultados depois.
- Eventos play/pause/playing/ended obsoletos não alteram o transporte atual.
- Balões de ação foram removidos. O feedback comum usa uma região não visual para
  leitores de tela; falhas de reprodução e fila permanecem no status inline existente.
- O cache do shell foi versionado para carregar o novo módulo também no modo offline.

## Verificação

- 301 testes unitários passaram; não houve remoção de testes.
- As antigas verificações literais de implementação foram adaptadas ao adaptador
  cancelável e à seleção deduplicada. Novos testes exercitam execução síncrona no
  gesto, cancelamento, limite de espera e rejeições antigas sem erros não tratados.
- Testes de navegador usam AAC sintético, o HTMLAudioElement real e a aplicação real,
  sem tráfego para provedores. Incluem ida/volta, alternância rápida no player/iPod,
  Play/Pausar na fila, adição manual, remoção da faixa selecionada da fila, controles
  de sistema, karaokê, offline, retomada da mesma faixa e fallback de uma fonte travada.
- Também validam uma única consulta ao catálogo quando Next encontra descoberta já
  ativa, cancelamento de descoberta ao Pausar/Play e ausência de balões visuais.
- Sintaxe, build Pages e empacotamento Wrangler sem publicação foram verificados.

Os testes de áudio são fixtures de integração, não medições de produção. O ambiente
recebeu HTTP 403 ao ler os dois hosts públicos consultados, portanto nenhuma alegação
é feita sobre a versão publicada. Não foi feita publicação em produção nem mudança no backend compartilhado
nesta rodada. Safari/iPhone, Bluetooth físico e longa duração em segundo plano continuam
exigindo validação em dispositivo. O erro pré-existente da suíte Stage72 na expectativa
“Para você” continua documentado no relatório anterior; ele não foi afrouxado nesta rodada.

## Entrega

Correção enviada ao PR #50, commit funcional `6813438`. A prévia automática
Netlify foi sinalizada como publicada com sucesso pelo status do GitHub no commit
`cdc2b82`: https://deploy-preview-50--gnarlyweb.netlify.app . Essa prévia exige
autenticação: as leituras HTTP neste ambiente retornaram 401. Portanto o sucesso
do build da prévia não é tratado como teste de reprodução no site publicado.
O PR permanece aberto e fora da main; os workflows Actions ainda não apareceram
na consulta do novo head. A validação descrita acima foi executada localmente.
