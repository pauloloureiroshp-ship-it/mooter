#!/bin/bash
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
exec bash "$REPO/_handoff/go-github-2026-08-16.sh"
