# Public release checklist

- [ ] Version updated in `Core.gs`, `Code.gs`, and `CHANGELOG.md`.
- [ ] No `.clasp.json`, credentials, keys, tokens, Sheet IDs, exports, or logs.
- [ ] No customer, person, company, account, campaign, or project-specific data.
- [ ] Legacy/archive runtime files are excluded.
- [ ] `bash scripts/security-scan.sh` passes.
- [ ] `node scripts/validate-apps-script.js` passes.
- [ ] Staged diff reviewed manually.
- [ ] Deployment tested on a private non-production Sheet.
- [ ] One-day live sync and reconciliation pass.
- [ ] Daily trigger count equals one after deployment.
- [ ] GitHub release contains source/documentation only.

