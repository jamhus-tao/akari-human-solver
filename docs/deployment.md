# Deployment

The existing demo uses SSH alias `jdcloud`, OpenResty container
`1Panel-openresty-tjqi`, and public route `/akari/web/`. `/akari/` redirects there.
Host files: `/opt/1panel/www/akari-replay/`; container files: `/www/akari-replay/`.

## Update

1. Generate the required reports with `python3 -B tools/prepare_data.py`.
2. Run tests from the root README.
3. Run `python3 tools/version_assets.py` after changing browser runtime files.
4. Back up the current deployed `web/` and `results/` to
   `/www/akari-deploy-backups/before-latest-deploy.tar.gz`.
5. Upload `web/index.html`, `web/style.css`, `web/src/`, `web/assets/`,
   `web/replays.json`, generated `web/examples/`, required `data/` puzzle inputs,
   and the reports referenced by the catalog. Preserve relative paths. Update
   `index.html` last. Do not upload tests, Python source or `node_modules`.
6. Check initial load, cost-mode switching, a candidate preview and the closing
   page. Delete temporary transfer archives after success.

This layout uses `web/src/`; an older deployment with modules directly in `web/`
requires the complete runtime update, not an individual-file copy. No server
reload is required for static file updates.

The OpenResty Akari location uses `alias /www/akari-replay/`, JavaScript MIME for
`.mjs`, and `Cache-Control: no-cache`. Preserve the existing root reverse proxy
and security headers. Site configuration is 1Panel-managed at
`/usr/local/openresty/nginx/conf/conf.d/new-api.conf` inside the container.
Configuration changes require `nginx -t` before reload.

## Rollback and retention

Restore `before-latest-deploy.tar.gz` into `/www/akari-replay/`. Keep one recent
runtime backup and the initial site config `new-api.before-akari.conf`; remove
older version archives. Never roll back the entire site configuration merely to
restore static Akari files. No scheduled puzzle refresh is installed.
