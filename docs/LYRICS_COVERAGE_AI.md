# GNARLY WEB — Lyrics Coverage & AI fallback

## Fonte e prioridade
1. A correção de artista/título vem do Metadata Intelligence já existente. Nunca usar “YouTube Music” como o artista da letra.
2. Consulta exata a `LRCLIB /api/get` com título, artista, álbum e duração. Cada candidato precisa corresponder a título e artista e ter duração compatível.
3. `LRCLIB /api/search`, sem recorrer a LRC de outro artista/remix. Preferir letra sincronizada; aceitar texto simples como **sem sincronização**.
4. `lyrics.ovh`, apenas texto simples e somente se o LRCLIB não encontrou registro.
5. Fallback opcional de IA para áudio que o usuário forneceu ou escolheu explicitamente, utilizando `@cf/openai/whisper-large-v3-turbo`. Não baixar nem transmitir ao serviço de IA música de terceiros automaticamente.

### Limites e qualidade
- `lyrics-ai` só recebe POST da mesma origem, exige `x-gnarly-audio-consent: yes`, inspeciona magic bytes e limita arquivos a 9 MB. Áudio não é armazenado.
- O modo automático fica **desligado por padrão**. O usuário pode consentir em auto-transcrever apenas os arquivos locais durante a sessão.
- A transcrição de IA é experimental. Timestamps retornados são os do provedor; nunca gerar tempos falsos para letras simples.
- Músicas instrumentais ficam marcadas como sem letra. Timeout, rate limit, DRM, API instável ou falta de modelo não param o áudio.
- O cliente faz cache em memória e respeita o `Retry-After` do LRCLIB.
- O endpoint usa apenas **Workers AI** vinculado à implantação. Se `AI` não existe, retorna `503` com mensagem clara.

## Habilitar AI no Cloudflare Pages
A integração Whisper foi implementada, mas **a inferência real fica indisponível até a configuração explícita do binding**. Os dois projetos `gnarly-web-pages` e `gnarly-web-stage72` compartilham o mesmo código; configure separadamente apenas os ambientes desejados.

1. Cloudflare > Workers & Pages > projeto > Settings > Bindings > Add > **Workers AI**.
2. Nome do binding: `AI`. Repetir para Production/Preview que for usar e publicar novo deploy.
3. **Antes da ativação pública, configure proteção global contra abuso** (Turnstile + rate limiting na borda e um orçamento/quota de uso). A proteção por IP implementada no isolate é auxiliar e **não substitui** um limite global.
4. Conferir o faturamento e a cota diária de Neurons do Workers AI. Não colocar chave do provedor em código do navegador.
5. Testar com um arquivo de áudio próprio curto; confirmar que `/api/lyrics-ai` nunca retorna texto quando a gravação não contém voz.

## Repositórios avaliados
- `tranxuanthang/lrcget` (MIT): inspiração para clientes LRCLIB; GNARLY usa a API oficial diretamente, sem copiar a GUI.
- `final-wav/LRCGen` (GPLv3): inspiração para Whisper + revisão humana, sem copiar código proprietário ao projeto.
- `bocaletto-luca/Lyrics-Finder` (GPLv3): referência à API `lyrics.ovh`; integração própria, sem incorporar o código.
- `Lyrics/lyrics-database`: conteúdo sob restrições de uso não comercial/educacional; não foi importado nem espelhado.
- Reddit `r/musichoarder/.../lrcget`: confirma abordagem de usar LRCLIB/LRCGET para grandes bibliotecas.

## Comportamento final do karaokê
Se há LRC confiável, destacar linhas no tempo; se só há letra simples, exibir de forma estática. Se não houver letra, oferecer reconsulta, importação de `.lrc` e IA a partir de arquivo selecionado. O playback deve permanecer independente deste pipeline.
