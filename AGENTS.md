# Repository agent instructions

These rules apply to every change; explicit user instructions take precedence.

## Workflow

- Inspect the branch, `git status --short`, and existing diff first. Preserve
  unrelated/untracked work; never reset, commit, push, deploy, or touch production
  unless explicitly requested.
- Define affected behavior, failure cases, and permissions. Run focused tests,
  start the real app, exercise the final behavior end to end, then run the full
  suite. Code review or unit tests alone do not prove runtime behavior.
- Report only checks actually performed. Documentation-only changes require
  content/format validation, not an app launch.
- Extremely favor about simplicity and maintainability when designing software.

## Isolated test environment

Never load `.env.local.ps1` or use `BD\guardias.sqlite`, production, or an
ambiguous database. Set `GUARDIAS_DB_PATH` to a unique `.test.sqlite` under
`$env:TEMP`, with test-only credentials/session secret and a free `PORT`; confirm
the path before writing, then run `npm.cmd run dev`. Keep secrets, personal data,
external sources, databases, and sensitive screenshots outside the repository and
reports. Stop the server and clean up temporary artifacts safely.

## Required empirical checks

- API: use the running server to test success, unauthenticated and allowed/denied
  roles, invalid/boundary inputs, persistence, and safe errors.
- Auth: test legacy admin/superadmin and individual sessions, logout, expiry,
  own-password rules, and escalation attempts via manipulated roles, IDs, bodies,
  parameters, and cookies. Authorize only from server-side session identity.
- Database: test fresh and representative legacy temporary databases, migration
  idempotency, constraints, foreign keys, integrity, and affected backup/restore.
- Schedules: test overlaps, expiry, inactive/missing assignments, breaks,
  out-of-hours states, transactional activation, and visible failure without an
  active dataset—never silent legacy fallback.
- Never log or expose passwords, hashes, salts, cookies, session IDs, tokens, or
  authorization headers.

## Browser integration

For every browser-facing change, use the integrated browser/Computer Use against
localhost. Log in, click, type, submit, navigate, reload the final state, log out,
verify visible results, and inspect console/network failures when available. Test
`/app/` in mobile and desktop viewports with relevant loading, empty, forbidden,
error, schedule, and substitution states; exercise `guardias.html` through its
canonical-data legacy adapter.

Screenshots never replace interaction. If browser integration fails, retry,
complete HTTP E2E checks, record the blocker, and do not claim browser verification
or recommend committing UI changes without explicit user acceptance.

## Completion and handoff

Run relevant focused scripts, then `npm.cmd test`, `git diff --check`,
`git status --short`, and `git diff --stat`. Report changed behavior, isolated
setup (without secrets), automated/HTTP/browser results, console/network errors,
risks, Git checks, and explicit `COMMIT` or `NO COMMIT`. Never claim E2E,
mobile, browser, or commit readiness without current empirical evidence.
