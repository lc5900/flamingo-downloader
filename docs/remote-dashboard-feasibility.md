# Remote Read-only Dashboard Feasibility

Current recommendation: keep the control plane localhost-only by default.

If LAN read-only access is ever added, the minimum bar should include:

- separate read-only token from add/control token
- explicit opt-in bind address, never default `0.0.0.0`
- CSRF-resistant auth model for browser access
- strict CORS allowlist
- redaction of source URLs, headers, cookies, and filesystem paths where possible
- request logging and easy token rotation

This release keeps the API on `127.0.0.1` only and treats LAN exposure as deferred work.
