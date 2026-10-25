# Run or host the editor

For local use: npm ci, npm run build, npm run preview. Open the localhost URL. Direct-directory exports require a supporting browser and a secure context; localhost qualifies.

The dist directory is a static application with local help, licenses, textures, catalog, masks, presets and schema. If you choose hosting, serve it over HTTPS and configure SPA fallback as needed. No hosting account, domain or deployment is configured by this package. The inherited Cloudflare Worker and donation configuration were removed during publication preparation.

Builds include root MIT text, full inherited Spacescape notice, HYG catalog attribution and third-party dependency notices. Preserve those files when deploying dist. The inherited public/_headers is an optional static-host cache/CORS hint; it does not connect a service or deploy anything.
