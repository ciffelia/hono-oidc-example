# hono-oidc-example

1. Set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_REDIRECT_URI` in `wrangler.toml`.
   - cf. https://developers.cloudflare.com/workers/configuration/environment-variables/
2. Set `OIDC_CLIENT_SECRET` in `.dev.vars`.
   - cf. https://developers.cloudflare.com/workers/configuration/secrets/
3. Run `wrangler dev` to start the worker.
