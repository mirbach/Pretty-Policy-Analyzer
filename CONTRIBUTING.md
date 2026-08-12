# Contributing to Pretty Policy Analyzer

Thanks for your interest in improving Pretty Policy Analyzer! Bug reports,
feature requests, and pull requests are all welcome.

Participation in this project is governed by our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting Bugs / Requesting Features

Search [existing issues](../../issues) first to avoid duplicates, then open a
new one using the appropriate template:

- **Bug report** — include repro steps, expected vs. actual behavior, your OS
  and browser (or Electron version), and a sample GPO backup structure if the
  issue is parsing-related (redact anything sensitive).
- **Feature request** — describe the problem you're trying to solve, not just
  the solution you have in mind.

For security vulnerabilities, see [SECURITY.md](SECURITY.md) instead of
opening a public issue.

## Development Setup

See the [Development](README.md#development) section of the README for
prerequisites and how to run the backend/frontend locally.

## Making a Pull Request

1. Fork the repo and create a branch off `main`:
   `git checkout -b feature/short-description`
2. Make your change. Keep the diff focused — unrelated formatting or refactor
   changes make review harder.
3. If you changed frontend code, run it locally and confirm the affected view
   (Browse / Compare / Conflicts / Search / Baseline) still works.
4. If you changed backend code, make sure the app still starts with
   `npm run dev:backend` and existing GPO backups still parse correctly.
5. Update `README.md` if you changed setup steps, scripts, or user-facing
   behavior.
6. Commit with a clear, present-tense message (e.g. `fix: handle empty
   registry.pol files`) and push your branch.
7. Open a pull request against `main` and fill in the PR template, describing
   **what** changed and **why**.

## Code Style

- **Frontend**: TypeScript + React 19, Tailwind CSS. Match the existing
  component structure under `frontend/src`; run `npm run build` in
  `frontend/` to catch type errors before opening a PR.
- **Backend**: Python 3.13, FastAPI, pydantic v2. Follow the existing module
  layout under `backend/app`.
- No formatter/linter is currently enforced in CI — just match the
  surrounding code's style.

## License

By contributing, you agree that your contributions will be licensed under
the project's [0BSD license](LICENSE).
