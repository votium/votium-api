#!/usr/bin/env bash
# Generates the AES-256 key that encrypts election RSA private keys at rest.
#
# Usage:
#   npm run keys:generate                 # writes .secrets/election_key_enc
#   scripts/generate-election-key.sh PATH # writes PATH (used by tests)
#
# The key is 32 random bytes encoded in base64. The file is created with mode 0600 inside a
# directory with mode 0700. The script never overwrites an existing file: regenerating the key
# makes every already-encrypted election key unreadable, so that must be a deliberate manual act.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT/.secrets/election_key_enc}"
DIR="$(dirname "$TARGET")"

if [ -e "$TARGET" ]; then
  echo "Error: $TARGET already exists. Refusing to overwrite it." >&2
  echo "Existing election keys are encrypted with this file. Regenerating it makes them unreadable." >&2
  echo "If you really need a new key, move the old file out of the way by hand first." >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "Error: openssl is required." >&2
  exit 1
fi

umask 077

if [ ! -d "$DIR" ]; then
  mkdir -p "$DIR"
  chmod 700 "$DIR"
fi

TMP="$(mktemp "$DIR/.election_key.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

openssl rand -base64 32 > "$TMP"
chmod 600 "$TMP"

# `ln` fails if TARGET appeared in the meantime, so the write never clobbers an existing key.
if ! ln "$TMP" "$TARGET" 2>/dev/null; then
  echo "Error: could not create $TARGET (it appeared while generating). Nothing was overwritten." >&2
  exit 1
fi

echo "Created $TARGET (32 random bytes, base64, mode 600)."
echo "Set ELECTION_KEY_ENCRYPTION_KEY_FILE=$TARGET in your .env if it is not already set."
