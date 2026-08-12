# Security Policy

## Supported Versions

Pretty Policy Analyzer is a single-line, actively developed project. Security
fixes are only made against the latest released version — there are no
maintained older branches.

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, use GitHub's private vulnerability reporting:

1. Go to the [Security tab](../../security/advisories/new) of this repository.
2. Click **Report a vulnerability**.
3. Include as much detail as you can: affected version, reproduction steps,
   impact, and any suggested fix.

You should expect an initial response within **7 days**. If the report is
confirmed, we'll work with you on a fix and coordinate a release; if it's
declined, we'll explain why. Please give us a reasonable amount of time to
address the issue before any public disclosure.

## Scope Notes

Pretty Policy Analyzer parses GPO backup exports (XML, `.pol`, `.inf`) and,
optionally, calls out to a user-supplied LLM API key (OpenAI, xAI, or Google
Gemini) for plain-English setting explanations. Reports related to any of the
following are especially welcome:

- Unsafe parsing of GPO backup files (XML/XXE, path traversal, etc.)
- Handling or storage of user-supplied AI provider API keys
- Privilege escalation via the `gpresult` import feature (Windows RSoP import)
- Electron IPC / packaged desktop app attack surface
