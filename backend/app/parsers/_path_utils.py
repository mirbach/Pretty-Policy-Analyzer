"""Shared path-validation helpers for all GPO parsers.

Both helpers:
- Resolve symlinks via os.path.realpath so the result is an absolute,
  canonical path with no traversal components.
- Optionally enforce containment within *trusted_root* using
  os.path.commonpath, which avoids the look-alike prefix attack that
  afflicts plain startswith comparisons (e.g. /tmp/foo vs /tmp/foobar).
- Raise ValueError on any violation so callers can gate on a single
  well-named exception type.
"""

from __future__ import annotations

import os


def safe_resolve_dir(candidate: str, trusted_root: str | None = None) -> str:
    """Return the realpath of *candidate* after asserting it is a directory.

    Raises ValueError if *candidate* does not resolve to a directory, or if
    *trusted_root* is given and the resolved path escapes it.
    """
    resolved = os.path.realpath(candidate)
    if not os.path.isdir(resolved):  # lgtm[py/path-injection]
        raise ValueError(f"Not a directory: {resolved!r}")
    if trusted_root is not None:
        root = os.path.realpath(trusted_root)
        if os.path.commonpath([resolved, root]) != root:
            raise ValueError(f"Path {resolved!r} escapes trusted root {root!r}")
    return resolved


def safe_resolve_file(candidate: str, trusted_root: str | None = None) -> str:
    """Return the realpath of *candidate* after asserting containment.

    Unlike safe_resolve_dir this does *not* require the path to exist yet —
    parsers call os.path.isfile themselves so they can return a clean empty
    result rather than raising.  The containment check is still enforced when
    *trusted_root* is provided.

    Raises ValueError if *trusted_root* is given and the resolved path
    escapes it.
    """
    resolved = os.path.realpath(candidate)
    if trusted_root is not None:
        root = os.path.realpath(trusted_root)
        if os.path.commonpath([resolved, root]) != root:
            raise ValueError(f"Path {resolved!r} escapes trusted root {root!r}")
    return resolved
