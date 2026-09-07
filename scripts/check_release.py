"""Validate that a release tag matches the integration manifest."""

from __future__ import annotations

import json
from pathlib import Path
import sys


manifest_path = (
    Path(__file__).parents[1]
    / "custom_components"
    / "http_requests"
    / "manifest.json"
)
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
tag = sys.argv[1] if len(sys.argv) > 1 else ""
expected = f"v{manifest['version']}"
if tag != expected:
    raise SystemExit(f"Release tag {tag!r} must match manifest version {expected!r}")
print(f"Release version validated: {tag}")
