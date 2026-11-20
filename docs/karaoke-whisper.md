# GNARLY · Avaliação vocal Whisper

## Experiência

1. Abra **Karaokê → Expandir** e inicie a música.
2. Toque **Ligar mic**. O indicador de voz e os pontos por presença/ritmo funcionam localmente, sem mandar samples ao servidor.
3. Para uma avaliação adicional, toque **Avaliar canto · Whisper**, cante por 1–45 s e toque **Avaliar trecho gravado**. Esse gesto autoriza apenas o envio desse trecho de voz captada pelo microfone para Cloudflare Workers AI.
4. O Whisper reconhece palavras e, havendo LRC sincronizada confiável, o GNARLY compara o texto ao intervalo correspondente da faixa. Exibe **similaridade textual aproximada (%)**, número de palavras correspondentes e trecho reconhecido. Isso **não é uma nota de afinação nem uma avaliação musical validada**. Sem LRC confiável, mostra apenas a transcrição, sem inventar correspondência.
5. **Gravar voz** continua sendo opção local independente para download, sem chamar Whisper. **Usar celular como microfone** continua enviando apenas características acústicas pelo relay; o áudio remoto não vai ao Whisper.

## Pipeline

- Browser: MediaStream do microfone, MediaRecorder, decodificação local, WAV PCM mono 16 kHz, limite de 48 s/9 MB, AbortController e descarte ao trocar música, recolher karaokê ou desconectar.
- Edge: POST same-origin /api/lyrics-ai, consentimento no cabeçalho, checagem de origem/formato/tamanho, rate limit simples e cache-control no-store.
- Cloudflare AI: modelo @cf/openai/whisper-large-v3-turbo; sem chaves expostas ao navegador.
- Player, Guardian, R2, fila, stems, letras e presets não são modificados por esta função; Whisper não bloqueia áudio.

**Dependência operacional:** O Worker autônomo obtém env.AI pelo binding AI definido em wrangler.jsonc. Se a implantação usada for **Cloudflare Pages**, adicione também binding **Workers AI** chamado AI à configuração do projeto Pages em produção e, se desejado, prévias. São implantações separadas. Ausência do binding deve retornar HTTP 503, sem afetar o player. O processamento remoto pode ter custo/limites da Cloudflare. As requisições não persistem gravações no repositório, Worker, R2 ou IndexedDB; consulte a política do provedor para retenção interna de inferência.

## Verificação

- npm test
- npm run build:pages
- Teste HTTPS com fones, permissão, música com LRC e sem LRC, pausa, seek, mudança de música, troca para microfone remoto, fechamento e iOS/desktop.
- Validar /api/lyrics-ai nos dois ambientes: sem consentimento ou origem distinta são rejeitados, sem AI retorna 503.
- Comparação textual por LCS é **heurística** (Whisper pode ouvir parte da música ambiente). Afinacão requer uma referência de melodia/pitch separada.
