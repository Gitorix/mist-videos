# Security

This repository is a static GitHub Pages site. It must never contain API keys, tokens, passwords or other secrets:
anything committed here is public, including its git history.

- Secrets belong in the service that uses them (for example Apps Script "Script properties"), never in HTML/JS.
- Every push is scanned by GitHub secret scanning (push protection on) and by the `secret-scan` workflow (gitleaks).
- If a secret is ever committed, revoke/rotate it at the provider first. Deleting it from git does not un-leak it.

To report a problem, open a private advisory under the repository's Security tab.
