# GNARLY WEB · α1

Primeira base navegável para portar a experiência **GNARLY iOS Stage 72** à web, preservando o aplicativo SwiftUI original.

**Fonte de comparação iOS:** `miscrapha-DELTA-IA/NightcoreLab`, branch `stage-72-client-onboarding-final`, commit `744b998a0d85c316407d17c9e4d3690b3b1e8dfe`. A versão iOS de referência foi aprovada no GitHub Actions #40139747152. Este repositório web é uma implementação independente, **não uma transpilação** de Swift/Metal.

## O que já funciona (α1)

- Recriação responsiva da estrutura visual principal: fundo ACID, cabeçalho, Criar, player em vidro, controles, gavetas de busca/fila/mix e ações rápidas.
- Material web Canvas 2D em fluxo contínuo; 8 paletas; reatividade DESLIGADO / FLUIDO / REATIVO baseada em analyser de áudio local.
- Player HTMLAudio + Web Audio: arquivos próprios locais via seletor e arrastar/soltar, velocidade 0,5–2× com preservação de tom quando suportada, bass shelving, reverb Convolver, scrub, fila, anterior/próximo, Media Session.
- Busca por *metadados oficiais e prévias iTunes* (até 30 s), via Netlify Function com fallback de requisição direta. **Não reproduz faixas completas do catálogo online**.
- Favoritos das prévias salvos no navegador (os arquivos locais duram só na sessão), personalização de fundo com foto local, letras sincronizadas via importação `.lrc`.
- Safari iPhone: pode ser colocado na Tela de Início como aplicativo web.
- Nenhuma credencial exposta no cliente; código sem bibliotecas externas; sem conta Apple, certificado, Sideloadly ou instalação de IPA.

## Limites da paridade com o iOS

O objetivo **1:1** é de longo prazo. Esta é uma **primeira implementação α1**, não possui: Metal shaders idênticos, Stems/Demucs, exportação de vídeo, microfone com pontuação, motor dos pads, motor nativo karaoke, downloads/catálogo completo do app. APIs musicais externas têm suas próprias licenças e direitos; não incluiremos extração não autorizada de obras.

## Rodar localmente

No terminal, na pasta do projeto:

```bash
python -m http.server 8080
```

Abra http://localhost:8080. Não abra `index.html` por `file://` porque módulos JS e requisições CORS funcionam melhor via HTTP. Não precisa instalar npm.

Testes (Node 20+): `npm test`.

## Netlify

### Git deploy recomendado
1. Crie no GitHub um repositório `miscrapha-DELTA-IA/Gnarly-web` (GitHub não permite espaço no slug).
2. Faça commit dos arquivos desta pasta na raiz do repositório. Não faça commit do ZIP em si nem da pasta `Gnarly-web` como uma subpasta, a menos que você ajuste o publish directory.
3. Netlify → **Add new project → Import an existing project** → GitHub → `Gnarly-web`.
4. **Build command: deixe em branco**, **Publish directory: `.`**, **Base directory: raiz**. O arquivo `netlify.toml` já define essas preferências.
5. Deploy. O endpoint `/.netlify/functions/catalog` é disponibilizado pela função `netlify/functions/catalog.mjs` mapeada para `/api/catalog`.

### Deploy manual provisório
Extraia o ZIP de deploy e envie a pasta com `index.html` para o Netlify Drop (ou os arquivos extraídos). Para essa modalidade, funcionalidades puramente estáticas funcionam, mas **o endpoint Netlify Function pode não ser implantado**. A busca tem fallback direto ao serviço público da Apple, que depende do CORS do serviço no navegador.

## Direitos e segurança

Não publica tokens, cookies, credenciais nem código do backend de downloads na web. O logo é do projeto GNARLY. O conteúdo distribuído deve respeitar licenças de dependências e direitos de áudio e imagens. **Nenhum arquivo musical protegido é incluído.** Não foi escolhida uma licença aberta para o novo repositório; confirme a licença antes de aceitar contribuições externas.

## Matriz de paridade (progresso)

| Recurso SwiftUI | Web α1 | Próxima etapa |
| --- | --- | --- |
| Player / scrubbing / fila | Implementação inicial | Testes no iPhone |
| ACID / temas visuais | Canvas 2D inspirado | Port WebGL2/WebGPU a partir do material original |
| Reatividade a áudio | Analyser inicial | RMS e envelopes alinhados ao AudioVisualFrameBus |
| Omnibox | Metadados/prévias iTunes | Catálogo licenciado de streaming |
| Speed / Pitch | playbackRate + preservesPitch | DSP time-stretch de qualidade superior |
| Bass / Reverb | Web Audio implementado | Parametrização Stage 72 |
| Karaokê | Importação LRC | Letras com modelos de tipografia e microfone |
| Stems / Demucs | Não | Estudar processamento cliente/servidor conforme licença |
| Creator / Pads / MP4 | Parcial / não | Work packages dedicados |

## Publicação

Se você já criou o site no Netlify mas ainda não o repositório, a documentação do Netlify também descreve **Project configuration → Developer settings → Continuous deployment → Repository → Push to new repository** para alguns projetos. Com Git conectado, o Netlify implanta automaticamente novas mudanças.

## Verificação após publicação

O workflow `.github/workflows/live-smoke.yml` testa `https://gnarlyweb.netlify.app` pelo GitHub Actions após alterações em `main`, incluindo HTML, JavaScript, CSS, ícone e catálogo. O teste automatizado não substitui validação no Safari do iPhone.
