# Security and performance

Keep all credentials in local configuration or a secret manager; rotate any secret found in Git history. REST mutations require capability checks, validation, sanitization, and authenticated requests. Escape output by context. Use WordPress APIs for database access, permissions, assets, nonces, and fonts.

Avoid shipping editor bundles on public pages. Generate only required CSS and load it where needed. Establish performance budgets and measure front-end and editor behavior when features exist. Keep MariaDB bound to localhost and retain backups outside Git.
