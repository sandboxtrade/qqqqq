# v0.20.50 — GitHub Pages deploy fix

- Fixed GitHub Actions failure in `actions/setup-node@v6` when the repository has no npm lockfile.
- Explicitly disables setup-node automatic package-manager caching with `package-manager-cache: false`.
- Keeps `npm install`, tests, typecheck and build in the Pages workflow.
- Adds a regression check so the workflow cannot silently regress while a lockfile is absent.
- `SCHEMA_VERSION` remains 4.
