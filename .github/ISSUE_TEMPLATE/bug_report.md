---
name: Bug report
about: Report something that isn't working correctly
title: "[Bug] "
labels: bug
assignees: ''
---

**Describe the bug**
A clear, concise description of what's wrong.

**To Reproduce**
Steps to reproduce the behavior:
1. Load GPO backups from '...'
2. Open '...' view
3. Click on '...'
4. See error

**Expected behavior**
What you expected to happen instead.

**Screenshots**
If applicable, add screenshots to help explain the problem.

**Environment**
- App version/build: [e.g. 1.0.4, or commit hash]
- Running as: [Electron desktop app / browser]
- Browser + version (if applicable): [e.g. Chrome 126]
- OS: [e.g. Windows 11]

**GPO backup details (if parsing-related)**
- Source of the backup: [`Backup-GPO` PowerShell / GPMC "Back Up All"]
- Anything unusual about the GPO(s) involved (empty settings, very large
  policy, non-English locale, etc.)

> Please don't attach real production GPO backups or API keys — redact or
> use a synthetic example if the bug depends on specific content.

**Additional context**
Add any other context about the problem here, e.g. browser console errors or
backend traceback.
