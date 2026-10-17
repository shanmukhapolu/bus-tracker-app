# Security handling and release gates

- Never print authentication objects, CLI credential configuration, passwords, refresh/access/ID tokens, raw OAuth responses, process environment dumps, or unreviewed debug logs.
- Do not invoke `firebase login:list --json`, use credential-bearing command arguments, or call `firebase logout --token`. Use `npm run firebase:status:safe` for diagnostic account status. It requires `FIREBASE_CLI_PATH` pointing to the installed Firebase CLI entry point and emits allowlisted metadata only.
- Interactive login belongs in the operator's terminal. Do not capture its authorization code or paste it into task output. Read logs through an allowlist/redactor; secret-scanner results must contain locations/rule IDs only, never matches.
- Run `npm run security:scan` before staging changes and before any push. Ignored local staging account journals are intentionally private and must never be force-added or copied into build output.
- The October 16 security remediation is held for explicit user approval. No push/deploy may be inferred from a passing test. The user reported on October 16 that the repository owner confirmed there are no automatic deployment integrations. This clears the integration uncertainty, not the separate release approval gate.
- `bus-safety-admin` owns deployed Firebase rules. Copies in `bus-tracker-app/scripts/spark/fixtures` are emulator fixtures only. Never deploy rules from the public repository.
- Keep unfinished Cloud Run work, production records, real credentials, routing and onboarding changes outside this release. No paid service activation.
- Read `docs/SECURITY-REMEDIATION.md` and `docs/CONTROLLED-GPS-RELEASE.md` before release work. Treat captured timestamps as required; do not restore an optional-timestamp bypass to accommodate cached clients.

## Final production review authorization
The user authorized pushing secret-scanned, tested commits to the named development branches only. This supersedes the earlier push hold. Do not push production branches or deploy production. Read docs/FINAL-PRODUCTION-REVIEW.md for current acceptance gates, exact rollout order and the compatible production fallback.
