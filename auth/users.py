from __future__ import annotations

import os
import sqlite3
import json
import time
from typing import Optional, Dict, Any

from werkzeug.security import generate_password_hash, check_password_hash

DB_FILE = os.getenv('JUKEBOX_USERS_DB', os.path.join(os.path.dirname(__file__), 'users.db'))


def _ensure_db():
    path = os.path.abspath(DB_FILE)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.execute(
        '''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password_hash TEXT,
            display_name TEXT,
            is_active INTEGER DEFAULT 0,
            is_admin INTEGER DEFAULT 0,
            created_at INTEGER,
            confirmed_at INTEGER,
            oauth_links TEXT,
            avatar_filename TEXT
        )
        '''
    )
    conn.commit()
    # Ensure migrations: add avatar_filename column if missing (for older DBs)
    try:
        cur = conn.execute("PRAGMA table_info('users')")
        cols = [r[1] for r in cur.fetchall()]
        if 'avatar_filename' not in cols:
            conn.execute('ALTER TABLE users ADD COLUMN avatar_filename TEXT')
            conn.commit()
    except Exception:
        # If anything goes wrong here, continue — table may be newly created or locked.
        pass
    return conn


class User:
    def __init__(self, id: int, email: str, display_name: str = None, is_active: bool = False, is_admin: bool = False, created_at: int = None, confirmed_at: int = None, oauth_links: dict = None, avatar_filename: str = None):
        self.id = id
        self.email = email
        self.display_name = display_name or ''
        self.is_active = bool(is_active)
        self.is_admin = bool(is_admin)
        self.created_at = created_at
        self.confirmed_at = confirmed_at
        self.oauth_links = oauth_links or {}
        self.avatar_filename = avatar_filename or None

    def get_id(self):
        return str(self.id)

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

    @property
    def is_active_user(self):
        return bool(self.is_active)


def create_user(email: str, password: str = None, display_name: str = None, require_confirm: bool = True) -> User:
    conn = _ensure_db()
    now = int(time.time())
    pwd_hash = generate_password_hash(password) if password else None
    cur = conn.cursor()
    try:
        cur.execute('INSERT INTO users (email, password_hash, display_name, is_active, created_at) VALUES (?,?,?,?,?)',
                    (email.lower(), pwd_hash, display_name or '', 0 if require_confirm else 1, now))
        conn.commit()
        uid = cur.lastrowid
        return get_user_by_id(uid)
    except sqlite3.IntegrityError:
        return None
    finally:
        conn.close()


def get_user_by_email(email: str) -> Optional[User]:
    conn = _ensure_db()
    cur = conn.execute('SELECT id,email,display_name,is_active,is_admin,created_at,confirmed_at,oauth_links,avatar_filename FROM users WHERE email = ?', (email.lower(),))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    oauth_links = json.loads(row[7]) if row[7] else {}
    avatar = row[8] if len(row) > 8 else None
    return User(id=row[0], email=row[1], display_name=row[2], is_active=row[3], is_admin=row[4], created_at=row[5], confirmed_at=row[6], oauth_links=oauth_links, avatar_filename=avatar)


def get_user_by_id(uid: int) -> Optional[User]:
    conn = _ensure_db()
    cur = conn.execute('SELECT id,email,display_name,is_active,is_admin,created_at,confirmed_at,oauth_links,avatar_filename FROM users WHERE id = ?', (uid,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    oauth_links = json.loads(row[7]) if row[7] else {}
    avatar = row[8] if len(row) > 8 else None
    return User(id=row[0], email=row[1], display_name=row[2], is_active=row[3], is_admin=row[4], created_at=row[5], confirmed_at=row[6], oauth_links=oauth_links, avatar_filename=avatar)


def verify_password(email: str, password: str) -> Optional[User]:
    conn = _ensure_db()
    cur = conn.execute('SELECT id,password_hash FROM users WHERE email = ?', (email.lower(),))
    row = cur.fetchone()
    conn.close()
    if not row or not row[1]:
        return None
    if check_password_hash(row[1], password):
        return get_user_by_id(row[0])
    return None


def set_password(user_id: int, password: str) -> None:
    conn = _ensure_db()
    pwd_hash = generate_password_hash(password)
    conn.execute('UPDATE users SET password_hash = ? WHERE id = ?', (pwd_hash, user_id))
    conn.commit()
    conn.close()


def set_avatar(user_id: int, filename: str) -> None:
    conn = _ensure_db()
    conn.execute('UPDATE users SET avatar_filename = ? WHERE id = ?', (filename, user_id))
    conn.commit()
    conn.close()


def confirm_user(user_id: int) -> None:
    conn = _ensure_db()
    now = int(time.time())
    conn.execute('UPDATE users SET is_active = 1, confirmed_at = ? WHERE id = ?', (now, user_id))
    conn.commit()
    conn.close()


def link_oauth(user_id: int, provider: str, provider_id: str) -> None:
    conn = _ensure_db()
    cur = conn.execute('SELECT oauth_links FROM users WHERE id = ?', (user_id,))
    row = cur.fetchone()
    links = json.loads(row[0]) if row and row[0] else {}
    links[provider] = provider_id
    conn.execute('UPDATE users SET oauth_links = ? WHERE id = ?', (json.dumps(links), user_id))
    conn.commit()
    conn.close()


def find_user_by_oauth(provider: str, provider_id: str) -> Optional[User]:
    conn = _ensure_db()
    cur = conn.execute('SELECT id,oauth_links FROM users')
    for row in cur.fetchall():
        links = json.loads(row[1]) if row[1] else {}
        if links.get(provider) == provider_id:
            conn.close()
            return get_user_by_id(row[0])
    conn.close()
    return None


def delete_user(user_id: int) -> Optional[str]:
    """Delete a user by id. Returns the avatar filename (if any) so callers
    can remove the file from disk if desired."""
    conn = _ensure_db()
    try:
        cur = conn.execute('SELECT avatar_filename FROM users WHERE id = ?', (user_id,))
        row = cur.fetchone()
        avatar = row[0] if row and row[0] else None
        conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
        conn.commit()
        return avatar
    finally:
        conn.close()
