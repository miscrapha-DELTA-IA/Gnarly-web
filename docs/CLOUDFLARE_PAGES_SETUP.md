# GNARLY WEB: Cloudflare Pages migration

GitHub source: https://github.com/miscrapha-DELTA-IA/Gnarly-web

## Recommended Git connection
- Cloudflare Workers & Pages → Pages → Connect Git repository.
- GitHub repository: `miscrapha-DELTA-IA/Gnarly-web`
- Production branch: `main`
- Project name: `gnarly-web`
- Framework: None
- Root directory: `/`
- Build command: `npm run build:pages`
- Build output directory: `dist`
- No environment variables are required for basic Pages Functions. Optional:
  `GNARLY_BACKEND_URL=https://nightcorelab.onrender.com`

## Architecture
- `dist/`: static HTML, styles, scripts, assets, visual and Web Audio engines.
- `functions/api/catalog.js`: iTunes catalogue search proxy.
- `functions/api/omnibox.js`: Render backend music metadata search proxy.
- `functions/api/stems-ticket.js`: protected admission bridge, without transferring music.
- `https://nightcorelab.onrender.com`: audio delivery and stem provider status.
- Existing Hugging Face GPU Space: actual source separation.
- `netlify/`: previous implementation kept in source for reference, not deployed.

Backend Render CORS must permit the **exact Pages production origin** in addition
to Netlify if still necessary. This is a server configuration, not a frontend flag.
Audio extraction may fail independently of Pages; Pages does not solve source limits.

## Verify
```bash
npm test
npm run build:pages
```
After deployment check the index, JavaScript assets and
`/api/catalog?term=daft%20punk`, `/api/omnibox?term=daft%20punk`.
The beta GPU ticket function requires a valid request and available GPU quota.

If the Cloudflare GitHub App has not been authorized, connect the repository
through the Pages dashboard / GitHub app installation. Do not create a
Direct Upload-only Pages project if you intend to use Git integration.
