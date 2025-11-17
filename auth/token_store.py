"""Secure token storage for OAuth credentials.

This module provides a small encrypted SQLite-backed token store suitable for
storing OAuth credentials (access/refresh tokens) at rest. It is intentionally
simple so it can be adapted to your preferred persistence layer (DB or KVS).

Usage:
  from auth.token_store import save_credentials, load_credentials
  save_credentials('user@example.com', creds_dict)
  creds = load_credentials('user@example.com')

Configuration:
  - Set environment variable `OAUTH_ENC_KEY` to a Fernet key (44-byte urlsafe base64).
    Alternatively you may set a passphrase; the passphrase will be hashed to derive
    a Fernet key (convenience only).
  - If `OAUTH_ENC_KEY` is not provided, a key will be created at
    the repository root named `.oauth_key`. For production, set `OAUTH_ENC_KEY`.

Security notes:
  - Protect the encryption key (do NOT check `.oauth_key` into source control).
  - For multi-server deployments, share the same encryption key across instances.
"""
from __future__ import annotations

import os
import sqlite3
import json
import time
import base64
import hashlib
from typing import Optional, Dict, Any

try:
    from cryptography.fernet import Fernet, InvalidToken
except Exception as e:
    raise ImportError("cryptography package is required for token encryption. Install with: pip install cryptography") from e


_DB_FILENAME = os.getenv('OAUTH_TOKEN_DB', os.path.join(os.path.dirname(__file__), '..', 'auth_tokens.db'))
_KEY_FILE = os.getenv('OAUTH_KEY_FILE', os.path.join(os.path.dirname(__file__), '..', '.oauth_key'))


def _get_fernet() -> Fernet:
    """Return a Fernet instance using env key, derived passphrase, or local keyfile.

    Accepts either:
      - `OAUTH_ENC_KEY` set to a valid Fernet key (url-safe base64, 44 bytes), or
      - `OAUTH_ENC_KEY` set to any passphrase (will be hashed to derive a key), or
      - a locally generated key file at `_KEY_FILE` will be created/used.
    """
    key_env = os.getenv('OAUTH_ENC_KEY')
    if key_env:
        key_bytes = key_env.encode('utf-8')
        # Try to use directly as a Fernet key
        try:
            return Fernet(key_bytes)
        except Exception:
            # Derive a 32-byte key from passphrase and base64-encode it for Fernet
            digest = hashlib.sha256(key_bytes).digest()
            b64 = base64.urlsafe_b64encode(digest)
            return Fernet(b64)

    # Fall back to a local keyfile
    if os.path.exists(_KEY_FILE):
        raw = open(_KEY_FILE, 'rb').read().strip()
        return Fernet(raw)

    # Generate a new key and write it to `_KEY_FILE` (developer convenience only)
    key = Fernet.generate_key()
    try:
        with open(_KEY_FILE, 'wb') as f:
            f.write(key)
    except Exception:
        # If we cannot write, still return the generated key (volatile)
        pass
    print(f"⚠ No OAUTH_ENC_KEY set; generated local key at {_KEY_FILE}. For production set OAUTH_ENC_KEY env var.")
    return Fernet(key)


def _ensure_db() -> sqlite3.Connection:
    path = os.path.abspath(_DB_FILENAME)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tokens (
            user_id TEXT PRIMARY KEY,
            token_blob BLOB NOT NULL,
            created_at INTEGER NOT NULL
        )
        """
    )
    conn.commit()
    return conn


def save_credentials(user_id: str, creds: Dict[str, Any]) -> None:
    """Encrypt and save credentials for `user_id`.

    `creds` is typically the OAuth credentials mapping returned by
    `google.oauth2.credentials.Credentials` or a similar dict-like object.
    """
    conn = _ensure_db()
    f = _get_fernet()
    payload = json.dumps(creds, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    token_blob = f.encrypt(payload)
    now = int(time.time())
    conn.execute('REPLACE INTO tokens (user_id, token_blob, created_at) VALUES (?,?,?)', (user_id, token_blob, now))
    conn.commit()
    conn.close()


def load_credentials(user_id: str) -> Optional[Dict[str, Any]]:
    """Load and decrypt credentials for `user_id`. Returns None if not found."""
    conn = _ensure_db()
    cur = conn.execute('SELECT token_blob FROM tokens WHERE user_id = ?', (user_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    token_blob = row[0]
    f = _get_fernet()
    try:
        plaintext = f.decrypt(token_blob)
    except InvalidToken as e:
        raise RuntimeError('Failed to decrypt tokens; check OAUTH_ENC_KEY or keyfile') from e
    return json.loads(plaintext.decode('utf-8'))


def delete_credentials(user_id: str) -> None:
    conn = _ensure_db()
    conn.execute('DELETE FROM tokens WHERE user_id = ?', (user_id,))
    conn.commit()
    conn.close()


def list_users() -> list:
    conn = _ensure_db()
    cur = conn.execute('SELECT user_id, created_at FROM tokens')
    rows = cur.fetchall()
    conn.close()
    return [{'user_id': r[0], 'created_at': r[1]} for r in rows]
