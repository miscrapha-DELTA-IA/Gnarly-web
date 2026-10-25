# GNARLY WEB — Cloudflare Workers / Pages deploy

## Workers: atual configuração da sua conta

No Cloudflare já existe um **Worker** chamado `gnarly-web`. Para manter esta
implantação, use a configuração `wrangler.jsonc` versionada no repositório.

### Workers Builds → Settings → Build
- Root directory: `/`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Production branch: `main`

O arquivo `wrangler.jsonc` define:
- `main: ./src/worker.js` — rotas de API
- `assets.directory: ./dist` — **NUNCA a raiz do repositório**
- `assets.run_worker_first: ['/api/*']` — APIs executadas pelo Worker

A pasta dist é gerada por `scripts/build-pages.mjs`, que copia apenas
`index.html`, `app.js`, `styles.css`, `assets/`, `lib/`, `ui/`,
`logo.svg`, `manifest.webmanifest` e `_headers`.

`node_modules/` fica fora do deploy. O executável `workerd`, de ~134 MiB,
era encontrado porque a configuração antiga apontava os ativos para
`/opt/buildhome/repo`; a Cloudflare limita cada ativo a 25 MiB.

### URLs e dependências
Workers usa um endereço `*.workers.dev` (não `*.pages.dev`).
- Catálogo: `/api/catalog` (iTunes)
- Omnibox: `/api/omnibox` (proxy para Render)
- Stems: `/api/stems-ticket` (admissão da GPU)
- Áudio longo e separação real: permanecem fora da Cloudflare no Render e no
  Space do Hugging Face; nada de downloads de áudio passando pelo Worker.

**ATENÇÃO — CORS:** o backend Render deve aceitar a origem efetiva
`https://gnarly-web.<subdominio>.workers.dev` para reproduzir áudio,
além dos antigos domínios Pages/Netlify. Descubra o endereço no painel
Workers & Pages e não chute um endereço.

### Verificação
```sh
npm test
npm run build
npx wrangler deploy --dry-run
npx wrangler deploy
```

Caso o deploy continue mostrando `assets.directory=/opt/buildhome/repo`,
remova do campo Deploy command qualquer `--assets .` ou
`--assets /opt/buildhome/repo`. O correto é **somente**
`npx wrangler deploy`, que lê o `wrangler.jsonc`.

## Caso prefira criar um Cloudflare Pages genuíno

Crie um projeto Pages distinto com GitHub integrado:
- Branch: `main`
- Build command: `npm run build:pages`
- Output: `dist`
- Functions: `functions/api/` na raiz

Não use `wrangler deploy` como comando para Pages. Esse comando pertence
ao projeto Workers e não interpreta as Pages Functions por convenção.

Workers atualmente já existe na conta e é capaz de servir
as mesmas três APIs via `src/worker.js`, por isso é a recuperação
mais rápida para o erro atual.
