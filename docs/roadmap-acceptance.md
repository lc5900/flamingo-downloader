# Roadmap Acceptance Notes

## Phase 1

- Health / error / remediation fields are persisted in task records.
- Retry policy distinguishes user-fixable failures from transient failures.
- Checksum and disk-space guard are covered by unit tests.

## Phase 2

- Link parsing, page scan, candidate scoring, duplicate merge, and batch creation flow are wired through one candidate review path.

## Phase 3

- Local API supports list/add/pause/resume/retry/remove/status/stats/health.
- PowerShell CLI wraps the local API.
- Completion hooks can send a webhook or spawn a local command.

## Release Quality

- Preflight scripts already exist under `scripts/preflight.ps1` and `scripts/preflight.sh`.
- Browser extension verification checklist, privacy notes, and sample-set notes are documented under `docs/`.
