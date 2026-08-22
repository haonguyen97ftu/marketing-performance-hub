# Contributing

Contributions are welcome when they preserve the project's privacy boundary.

## Before opening a pull request

1. Use synthetic account, campaign, company, and spend values in tests.
2. Never include a real Sheet export, log, screenshot, Script ID, account ID,
   email address, phone number, token, private key, or customer name.
3. Run:

   ```bash
   bash scripts/security-scan.sh
   node scripts/validate-apps-script.js
   ```

4. Describe Apps Script permissions or external API changes explicitly.
5. Update documentation and `CHANGELOG.md` for user-visible behavior.

## Code conventions

- Google Apps Script V8 JavaScript; no build step is required.
- Public entry points use descriptive names; internal helpers end in `_` or a
  step suffix for compatibility.
- API calls use `apiRequest_` and HTTPS.
- Logs must pass through a sanitizer and must not contain raw API payloads.
- Changes to schemas must be additive or include a reversible migration.

Security reports must follow [SECURITY.md](SECURITY.md), not public Issues.

