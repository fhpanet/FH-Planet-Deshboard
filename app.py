#!/usr/bin/env python3
"""FH Planet Reporting Site — stdlib only. Listen 127.0.0.1:8090, path /reports."""
from __future__ import annotations

import hashlib
import html
import json
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

APP_NAME = "FH Planet Reporting"
HOST = os.environ.get("FHPLANET_HOST", "127.0.0.1")
PORT = int(os.environ.get("FHPLANET_PORT", "8090"))
PREFIX = "/reports"
ADMIN_USER = "sourav"
PBKDF2_ITERS = 260000
SESSION_DAYS = 7
MAX_FAILS = 5
LOCKOUT_SECONDS = 15 * 60
CSRF_SECONDS = 2 * 60 * 60
API_TOKEN_BYTES = 32

_home = os.environ.get("FHPLANET_HOME") or os.path.expanduser("~")
DB_PATH = os.environ.get("FHPLANET_DB") or os.path.join(_home, "fhplanet", "data", "app.db")
_lock = threading.RLock()

# --- time / crypto / db ---

def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _ts() -> float:
    return time.time()


def hash_password(password: str, iters: int = PBKDF2_ITERS) -> str:
    if iters < 200000:
        raise ValueError("iterations must be >= 200000")
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iters)
    return "pbkdf2_sha256$%d$%s$%s" % (iters, salt.hex(), dk.hex())


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters_s, salt_hex, hash_hex = stored.split("$")
        iters = int(iters_s)
        if algo != "pbkdf2_sha256" or iters < 200000 or not salt_hex or not hash_hex:
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), iters
        )
        return secrets.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _connect() -> sqlite3.Connection:
    parent = os.path.dirname(DB_PATH)
    if parent:
        os.makedirs(parent, exist_ok=True)
    con = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA journal_mode=WAL")
    return con


def init_db() -> None:
    with _lock:
        con = _connect()
        try:
            con.executescript(
                """
                CREATE TABLE IF NOT EXISTS meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS todos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'todo',
                    priority INTEGER NOT NULL DEFAULT 0,
                    notes TEXT,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS reports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    body TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    csrf TEXT,
                    created_at TEXT NOT NULL,
                    expires_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS login_attempts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ip TEXT NOT NULL,
                    attempted_at REAL NOT NULL,
                    success INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS api_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    token_hash TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS csrf_tokens (
                    token TEXT PRIMARY KEY,
                    scope TEXT NOT NULL,
                    expires_at REAL NOT NULL
                );
                """
            )
            con.commit()
        finally:
            con.close()


def _db():
    return _connect()


def meta_get(key: str):
    with _lock:
        con = _db()
        try:
            row = con.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
            return row["value"] if row else None
        finally:
            con.close()


def meta_set(key: str, value: str) -> None:
    with _lock:
        con = _db()
        try:
            con.execute(
                "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, value),
            )
            con.commit()
        finally:
            con.close()


# --- auth helpers ---

def is_locked(ip: str) -> bool:
    cutoff = _ts() - LOCKOUT_SECONDS
    with _lock:
        con = _db()
        try:
            rows = con.execute(
                "SELECT success, attempted_at FROM login_attempts WHERE ip=? AND attempted_at>=? ORDER BY attempted_at DESC",
                (ip, cutoff),
            ).fetchall()
        finally:
            con.close()
    fails = 0
    for r in rows:
        if r["success"]:
            break
        fails += 1
        if fails >= MAX_FAILS:
            return True
    return False


def record_attempt(ip: str, success: bool) -> None:
    with _lock:
        con = _db()
        try:
            con.execute(
                "INSERT INTO login_attempts(ip, attempted_at, success) VALUES(?,?,?)",
                (ip, _ts(), 1 if success else 0),
            )
            con.execute(
                "DELETE FROM login_attempts WHERE attempted_at<?",
                (_ts() - 24 * 3600,),
            )
            con.commit()
        finally:
            con.close()


def new_session() -> str:
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(32)
    exp = _ts() + SESSION_DAYS * 86400
    with _lock:
        con = _db()
        try:
            con.execute(
                "INSERT INTO sessions(token,csrf,created_at,expires_at) VALUES(?,?,?,?)",
                (token, csrf, _now(), exp),
            )
            con.commit()
        finally:
            con.close()
    return token


def get_session(token: str):
    if not token:
        return None
    with _lock:
        con = _db()
        try:
            row = con.execute(
                "SELECT token, csrf, expires_at FROM sessions WHERE token=?", (token,)
            ).fetchone()
            if not row or row["expires_at"] < _ts():
                if row:
                    con.execute("DELETE FROM sessions WHERE token=?", (token,))
                    con.commit()
                return None
            return row
        finally:
            con.close()


def destroy_session(token: str) -> None:
    if not token:
        return
    with _lock:
        con = _db()
        try:
            con.execute("DELETE FROM sessions WHERE token=?", (token,))
            con.commit()
        finally:
            con.close()


def session_csrf(token: str) -> str:
    row = get_session(token)
    if row and row["csrf"]:
        return row["csrf"]
    csrf = secrets.token_urlsafe(32)
    if token and row:
        with _lock:
            con = _db()
            try:
                con.execute("UPDATE sessions SET csrf=? WHERE token=?", (csrf, token))
                con.commit()
            finally:
                con.close()
        return csrf
    return issue_anon_csrf()


def issue_anon_csrf() -> str:
    csrf = secrets.token_urlsafe(32)
    with _lock:
        con = _db()
        try:
            con.execute(
                "INSERT INTO csrf_tokens(token,scope,expires_at) VALUES(?,?,?)",
                (csrf, "anon", _ts() + CSRF_SECONDS),
            )
            con.execute("DELETE FROM csrf_tokens WHERE expires_at<?", (_ts(),))
            con.commit()
        finally:
            con.close()
    return csrf


def valid_csrf(token_from_form: str, session_token: str) -> bool:
    if not token_from_form or not re.fullmatch(r"[A-Za-z0-9_\-]+", token_from_form):
        return False
    sess = get_session(session_token) if session_token else None
    if sess and sess["csrf"] and secrets.compare_digest(sess["csrf"], token_from_form):
        return True
    with _lock:
        con = _db()
        try:
            row = con.execute(
                "SELECT token, expires_at FROM csrf_tokens WHERE token=?",
                (token_from_form,),
            ).fetchone()
            if row and row["expires_at"] >= _ts():
                con.execute("DELETE FROM csrf_tokens WHERE token=?", (token_from_form,))
                con.commit()
                return True
            return False
        finally:
            con.close()


def api_token_ok(bearer: str) -> bool:
    if not bearer:
        return False
    h = hash_token(bearer)
    with _lock:
        con = _db()
        try:
            row = con.execute(
                "SELECT id FROM api_tokens WHERE token_hash=?", (h,)
            ).fetchone()
            return bool(row)
        finally:
            con.close()


def create_api_token() -> str:
    raw = secrets.token_urlsafe(API_TOKEN_BYTES)
    with _lock:
        con = _db()
        try:
            con.execute(
                "INSERT INTO api_tokens(token_hash, created_at) VALUES(?,?)",
                (hash_token(raw), _now()),
            )
            con.commit()
        finally:
            con.close()
    return raw


# --- todos / reports ---

STATUSES = ("todo", "in_progress", "blocked", "done")
STATUS_BN = {
    "todo": "করণীয়",
    "in_progress": "চলছে",
    "blocked": "আটকে আছে",
    "done": "শেষ",
}


def todo_counts():
    with _lock:
        con = _db()
        try:
            rows = con.execute(
                "SELECT status, COUNT(*) AS n FROM todos GROUP BY status"
            ).fetchall()
        finally:
            con.close()
    out = {s: 0 for s in STATUSES}
    for r in rows:
        if r["status"] in out:
            out[r["status"]] = r["n"]
    return out


def list_todos(status=None):
    q = "SELECT * FROM todos"
    args = []
    if status and status in STATUSES:
        q += " WHERE status=?"
        args.append(status)
    q += " ORDER BY CASE status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END, priority DESC, updated_at DESC"
    with _lock:
        con = _db()
        try:
            return con.execute(q, args).fetchall()
        finally:
            con.close()


def get_todo(tid: int):
    with _lock:
        con = _db()
        try:
            return con.execute("SELECT * FROM todos WHERE id=?", (tid,)).fetchone()
        finally:
            con.close()


def upsert_todo(title, status, priority, notes, tid=None):
    title = (title or "").strip()
    if not title:
        raise ValueError("title required")
    if status not in STATUSES:
        status = "todo"
    try:
        priority = int(priority)
    except (TypeError, ValueError):
        priority = 0
    notes = notes or ""
    now = _now()
    with _lock:
        con = _db()
        try:
            if tid:
                con.execute(
                    "UPDATE todos SET title=?, status=?, priority=?, notes=?, updated_at=? WHERE id=?",
                    (title, status, priority, notes, now, tid),
                )
                if con.execute("SELECT changes()").fetchone()[0] == 0:
                    raise ValueError("not found")
            else:
                cur = con.execute(
                    "INSERT INTO todos(title,status,priority,notes,updated_at) VALUES(?,?,?,?,?)",
                    (title, status, priority, notes, now),
                )
                tid = cur.lastrowid
            con.commit()
        finally:
            con.close()
    return get_todo(tid)


def list_reports(limit=20):
    with _lock:
        con = _db()
        try:
            return con.execute(
                "SELECT * FROM reports ORDER BY created_at DESC, id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        finally:
            con.close()


def get_report(rid: int):
    with _lock:
        con = _db()
        try:
            return con.execute("SELECT * FROM reports WHERE id=?", (rid,)).fetchone()
        finally:
            con.close()


def add_report(title, body):
    title = (title or "").strip()
    if not title:
        raise ValueError("title required")
    body = body or ""
    with _lock:
        con = _db()
        try:
            cur = con.execute(
                "INSERT INTO reports(title,body,created_at) VALUES(?,?,?)",
                (title, body, _now()),
            )
            rid = cur.lastrowid
            con.commit()
        finally:
            con.close()
    return get_report(rid)


# --- html ---

def e(s) -> str:
    return html.escape("" if s is None else str(s), quote=True)


def render_md(text: str) -> str:
    t = html.escape(text or "")
    t = re.sub(r"[*][*](.+?)[*][*]", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![*])[*]([^*]+?)[*](?![*])", r"<em>\1</em>", t)
    t = re.sub(r"^### (.+)$", r"<h3>\1</h3>", t, flags=re.M)
    t = re.sub(r"^## (.+)$", r"<h2>\1</h2>", t, flags=re.M)
    t = re.sub(r"^# (.+)$", r"<h1>\1</h1>", t, flags=re.M)
    parts = re.split(r"\n{2,}", t)
    out = []
    for p in parts:
        if re.match(r"<h[1-3]>", p):
            out.append(p.replace("\n", "<br>\n"))
        else:
            out.append("<p>%s</p>" % p.replace("\n", "<br>\n"))
    return "\n".join(out)


CSS = (
    "*{box-sizing:border-box}body{margin:0;font-family:system-ui,Segoe UI,Roboto,sans-serif;"
    "background:#0f1419;color:#e8eef4;line-height:1.5;padding:0}"
    "a{color:#7dc4ff;text-decoration:none}a:hover{text-decoration:underline}"
    "header{background:#1a2330;padding:12px 16px;display:flex;justify-content:space-between;"
    "align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1px solid #2a3a4d}"
    "header h1{font-size:1.05rem;margin:0;font-weight:650}nav{display:flex;gap:12px;flex-wrap:wrap}"
    "main{max-width:860px;margin:0 auto;padding:16px}"
    ".card{background:#1a2330;border:1px solid #2a3a4d;border-radius:12px;padding:14px 16px;margin:0 0 14px}"
    ".counts{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:0 0 14px}"
    ".counts .card{margin:0;text-align:center}.counts .n{font-size:1.6rem;font-weight:700;display:block}"
    "label{display:block;font-size:.85rem;margin:10px 0 4px;color:#b9c5d1}"
    "input,select,textarea{width:100%;padding:10px 12px;border-radius:8px;border:1px solid #3a4b5e;"
    "background:#0f1419;color:#e8eef4;font:inherit}"
    "textarea{min-height:140px}button,.btn{display:inline-block;background:#2b6cb0;color:#fff;border:0;"
    "padding:10px 16px;border-radius:8px;font:inherit;cursor:pointer;margin:12px 8px 0 0}"
    "button.sec,.btn.sec{background:#334155}.err{background:#3b1d1d;color:#fecaca;padding:10px 12px;"
    "border-radius:8px;margin:0 0 12px}.ok{background:#14321f;color:#bbf7d0;padding:10px 12px;"
    "border-radius:8px;margin:0 0 12px}"
    "table{width:100%;border-collapse:collapse;font-size:.95rem}"
    "th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #2a3a4d;vertical-align:top}"
    ".tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.75rem;background:#334155}"
    ".todo{background:#1e3a5f}.in_progress{background:#3f3a14}.blocked{background:#5c1f1f}"
    ".done{background:#14532d}form.inline{display:inline}.filters{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}"
    ".filters a{padding:6px 10px;border-radius:999px;background:#243044;color:#dbe7f3}"
    ".filters a.on{background:#2b6cb0;color:#fff}p.hint{color:#93a4b5;font-size:.9rem}"
    "@media(max-width:600px){th.desk,td.desk{display:none}main{padding:12px}}"
)


def page(title, body, user=None, extra_nav=""):
    nav = ""
    if user:
        nav = (
            '<nav><a href="%s/">ড্যাশবোর্ড</a><a href="%s/todos/new">নতুন কাজ</a>'
            '<a href="%s/reports/new">নতুন রিপোর্ট</a>'
            '<form class="inline" method="post" action="%s/logout">'
            '<input type="hidden" name="csrf" value="%s">'
            '<button class="sec" type="submit">লগআউট</button></form></nav>'
        ) % (PREFIX, PREFIX, PREFIX, PREFIX, e(extra_nav))
    return (
        "<!doctype html><html lang='bn'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<meta name='robots' content='noindex,nofollow'>"
        "<title>%s — %s</title><style>%s</style></head><body>"
        "<header><h1><a href='%s/'>%s</a></h1>%s</header><main>%s</main></body></html>"
    ) % (e(title), e(APP_NAME), CSS, PREFIX, e(APP_NAME), nav, body)


def csrf_input(csrf: str) -> str:
    return '<input type="hidden" name="csrf" value="%s">' % e(csrf)


# --- HTTP handler ---

class Handler(BaseHTTPRequestHandler):
    server_version = "FHPlanetReports/1.0"
    sys_version = ""

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _ip(self) -> str:
        xf = self.headers.get("X-Forwarded-For", "")
        if xf:
            return xf.split(",")[0].strip() or self.client_address[0]
        return self.client_address[0]

    def _secure_cookie(self) -> bool:
        return self.headers.get("X-Forwarded-Proto", "").lower() == "https"

    def _cookie_flags(self) -> str:
        parts = ["HttpOnly", "SameSite=Strict", "Path=/reports"]
        if self._secure_cookie():
            parts.append("Secure")
        return "; ".join(parts)

    def _cookies(self) -> SimpleCookie:
        c = SimpleCookie()
        raw = self.headers.get("Cookie", "")
        if raw:
            try:
                c.load(raw)
            except Exception:
                pass
        return c

    def _sid(self) -> str:
        c = self._cookies()
        if "fhpsess" in c:
            return c["fhpsess"].value
        return ""

    def _read_body(self) -> bytes:
        n = int(self.headers.get("Content-Length") or 0)
        if n < 0 or n > 2_000_000:
            return b""
        return self.rfile.read(n) if n else b""

    def _form(self) -> dict:
        raw = self._read_body().decode("utf-8", "replace")
        parsed = parse_qs(raw, keep_blank_values=True)
        return {k: v[0] if v else "" for k, v in parsed.items()}

    def _json(self):
        raw = self._read_body().decode("utf-8", "replace")
        if not raw:
            return {}
        return json.loads(raw)

    def _send(self, code, body, content_type="text/html; charset=utf-8", headers=None):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Cache-Control", "no-store")
        if headers:
            for k, v in headers:
                self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _redir(self, loc, headers=None):
        hdrs = [("Location", loc)]
        if headers:
            hdrs.extend(headers)
        self._send(302, "", headers=hdrs)

    def _set_session_header(self, token: str, clear=False):
        if clear:
            val = "fhpsess=; Max-Age=0; %s" % self._cookie_flags()
        else:
            val = "fhpsess=%s; Max-Age=%d; %s" % (
                token,
                SESSION_DAYS * 86400,
                self._cookie_flags(),
            )
        return ("Set-Cookie", val)

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def _dispatch(self, method):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)
        if path != PREFIX and path.startswith(PREFIX + "/") is False and path != PREFIX + "/":
            if path == "/" or path == "":
                if method == "GET":
                    self._redir(PREFIX + "/")
                    return
            self._send(404, page("Not found", "<p>Not found.</p>"))
            return
        rest = path[len(PREFIX) :] or "/"
        if rest != "/" and rest.endswith("/"):
            rest = rest.rstrip("/")
        try:
            self._route(method, rest, qs)
        except Exception as exc:
            sys.stderr.write("handler error: %s\n" % type(exc).__name__)
            self._send(500, page("Error", "<p class='err'>সার্ভার ত্রুটি। / Server error.</p>"))

    def _authed(self):
        return get_session(self._sid())

    def _need_login(self):
        if not self._authed():
            self._redir(PREFIX + "/login")
            return False
        return True

    def _route(self, method, rest, qs):
        if method == "GET" and rest in ("/", ""):
            if self._authed():
                return self._dashboard(qs)
            return self._redir(PREFIX + "/login")
        if method == "GET" and rest == "/login":
            return self._login_get()
        if method == "POST" and rest == "/login":
            return self._login_post()
        if method == "POST" and rest == "/logout":
            return self._logout()
        if method == "GET" and rest == "/todos/new":
            if not self._need_login():
                return
            return self._todo_form(None)
        if method == "POST" and rest == "/todos":
            if not self._need_login():
                return
            return self._todo_save(None)
        m = re.fullmatch(r"/todos/(\d+)/edit", rest)
        if method == "GET" and m:
            if not self._need_login():
                return
            return self._todo_form(int(m.group(1)))
        m = re.fullmatch(r"/todos/(\d+)", rest)
        if method == "POST" and m:
            if not self._need_login():
                return
            return self._todo_save(int(m.group(1)))
        if method == "GET" and rest == "/reports/new":
            if not self._need_login():
                return
            return self._report_form()
        if method == "POST" and rest == "/reports":
            if not self._need_login():
                return
            return self._report_save()
        m = re.fullmatch(r"/reports/(\d+)", rest)
        if method == "GET" and m:
            if not self._need_login():
                return
            return self._report_view(int(m.group(1)))
        if method == "POST" and rest == "/api/todos":
            return self._api_todos()
        if method == "POST" and rest == "/api/reports":
            return self._api_reports()
        self._send(404, page("Not found", "<p>পাতা মেলেনি। / Not found.</p>"))

    def _login_get(self, err=""):
        if self._authed():
            return self._redir(PREFIX + "/")
        csrf = issue_anon_csrf()
        err_h = "<div class='err'>%s</div>" % e(err) if err else ""
        body = (
            "<div class='card'><h2>লগইন / Login</h2>%s"
            "<form method='post' action='%s/login'>"
            "%s"
            "<label for='username'>ব্যবহারকারী / Username</label>"
            "<input id='username' name='username' autocomplete='username' required>"
            "<label for='password'>পাসওয়ার্ড / Password</label>"
            "<input id='password' type='password' name='password' autocomplete='current-password' required>"
            "<button type='submit'>প্রবেশ করুন</button></form>"
            "<p class='hint'>শুধু নির্ধারিত অ্যাডমিন অ্যাকাউন্ট।</p></div>"
        ) % (err_h, PREFIX, csrf_input(csrf))
        self._send(200 if not err else 401, page("লগইন", body))

    def _login_post(self):
        form = self._form()
        csrf, user, pw = form.get("csrf", ""), form.get("username", ""), form.get("password", "")
        if not valid_csrf(csrf, self._sid()):
            return self._send(403, page("নিষিদ্ধ", "<p class='err'>CSRF যাচাই ব্যর্থ। পাতা রিফ্রেশ করুন।</p>"))
        ip = self._ip()
        if is_locked(ip):
            return self._login_get("অনেকবার ভুল হয়েছে। ১৫ মিনিট পরে চেষ্টা করুন। / Locked 15 minutes.")
        stored = meta_get("password_hash")
        ok = (
            stored
            and user.strip().lower() == ADMIN_USER
            and verify_password(pw, stored)
        )
        record_attempt(ip, bool(ok))
        if not ok:
            if is_locked(ip):
                msg = "অনেকবার ভুল হয়েছে। ১৫ মিনিট পরে চেষ্টা করুন। / Locked 15 minutes."
            else:
                msg = "ভুল ব্যবহারকারী বা পাসওয়ার্ড। / Invalid username or password."
            return self._login_get(msg)
        token = new_session()
        self._redir(PREFIX + "/", headers=[self._set_session_header(token)])

    def _logout(self):
        form = self._form()
        sid = self._sid()
        if not valid_csrf(form.get("csrf", ""), sid):
            return self._send(403, page("নিষিদ্ধ", "<p class='err'>CSRF যাচাই ব্যর্থ।</p>"))
        destroy_session(sid)
        self._redir(PREFIX + "/login", headers=[self._set_session_header("", clear=True)])

    def _dashboard(self, qs):
        status = (qs.get("status") or [""])[0]
        if status not in STATUSES:
            status = ""
        counts = todo_counts()
        todos = list_todos(status or None)
        reports = list_reports(8)
        csrf = session_csrf(self._sid())
        cards = "".join(
            "<div class='card'><span class='n'>%d</span>%s<br><small>%s</small></div>"
            % (counts[s], e(STATUS_BN[s]), e(s))
            for s in STATUSES
        )
        fil = []
        for key, label in [("", "সব")] + [(s, STATUS_BN[s]) for s in STATUSES]:
            href = PREFIX + "/" if not key else PREFIX + "/?status=" + key
            on = " on" if status == key else ""
            fil.append("<a class='%s' href='%s'>%s</a>" % (on, href, e(label)))
        rows = []
        for t in todos:
            rows.append(
                "<tr><td><a href='%s/todos/%d/edit'>%s</a></td>"
                "<td><span class='tag %s'>%s</span></td>"
                "<td>%s</td><td class='desk'>%s</td></tr>"
                % (
                    PREFIX,
                    t["id"],
                    e(t["title"]),
                    e(t["status"]),
                    e(STATUS_BN.get(t["status"], t["status"])),
                    e(t["priority"]),
                    e((t["updated_at"] or "")[:16].replace("T", " ")),
                )
            )
        table = (
            "<table><thead><tr><th>শিরোনাম</th><th>অবস্থা</th><th>অগ্রাধিকার</th>"
            "<th class='desk'>হালনাগাদ</th></tr></thead><tbody>%s</tbody></table>"
            % ("".join(rows) or "<tr><td colspan='4'>কোনো কাজ নেই।</td></tr>")
        )
        ritems = []
        for r in reports:
            ritems.append(
                "<li><a href='%s/reports/%d'>%s</a> <small>%s</small></li>"
                % (PREFIX, r["id"], e(r["title"]), e((r["created_at"] or "")[:16].replace("T", " ")))
            )
        rsec = "<ul>%s</ul>" % ("".join(ritems) or "<li>এখনো কোনো রিপোর্ট নেই।</li>")
        body = (
            "<div class='counts'>%s</div>"
            "<div class='card'><h2>কাজের তালিকা / Todos</h2>"
            "<div class='filters'>%s</div>%s</div>"
            "<div class='card'><h2>সাম্প্রতিক রিপোর্ট / Recent reports</h2>%s"
            "<p><a class='btn' href='%s/reports/new'>নতুন রিপোর্ট</a></p></div>"
        ) % (cards, "".join(fil), table, rsec, PREFIX)
        html_out = page("ড্যাশবোর্ড", body, user=ADMIN_USER, extra_nav=csrf)
        self._send(200, html_out)

    def _todo_form(self, tid, err=""):
        row = get_todo(tid) if tid else None
        if tid and not row:
            return self._send(404, page("মেলেনি", "<p>কাজটি মেলেনি।</p>", user=ADMIN_USER, extra_nav=session_csrf(self._sid())))
        csrf = session_csrf(self._sid())
        title = row["title"] if row else ""
        status = row["status"] if row else "todo"
        priority = row["priority"] if row else 0
        notes = row["notes"] if row else ""
        action = PREFIX + ("/todos/%d" % tid if tid else "/todos")
        opts = "".join(
            "<option value='%s'%s>%s (%s)</option>"
            % (s, " selected" if s == status else "", e(STATUS_BN[s]), s)
            for s in STATUSES
        )
        err_h = "<div class='err'>%s</div>" % e(err) if err else ""
        body = (
            "<div class='card'><h2>%s</h2>%s<form method='post' action='%s'>%s"
            "<label>শিরোনাম / Title</label><input name='title' required value='%s'>"
            "<label>অবস্থা / Status</label><select name='status'>%s</select>"
            "<label>অগ্রাধিকার / Priority</label><input name='priority' type='number' value='%s'>"
            "<label>নোট / Notes</label><textarea name='notes'>%s</textarea>"
            "<button type='submit'>সংরক্ষণ</button>"
            "<a class='btn sec' href='%s/'>বাতিল</a></form></div>"
        ) % (
            "কাজ সম্পাদনা" if tid else "নতুন কাজ",
            err_h,
            action,
            csrf_input(csrf),
            e(title),
            opts,
            e(priority),
            e(notes),
            PREFIX,
        )
        self._send(200, page("কাজ", body, user=ADMIN_USER, extra_nav=csrf))

    def _todo_save(self, tid):
        form = self._form()
        if not valid_csrf(form.get("csrf", ""), self._sid()):
            return self._send(403, page("নিষিদ্ধ", "<p class='err'>CSRF যাচাই ব্যর্থ।</p>", user=ADMIN_USER, extra_nav=session_csrf(self._sid())))
        try:
            upsert_todo(form.get("title"), form.get("status"), form.get("priority"), form.get("notes"), tid)
        except ValueError as exc:
            return self._todo_form(tid, str(exc))
        self._redir(PREFIX + "/")

    def _report_form(self, err=""):
        csrf = session_csrf(self._sid())
        err_h = "<div class='err'>%s</div>" % e(err) if err else ""
        body = (
            "<div class='card'><h2>নতুন রিপোর্ট / New report</h2>%s"
            "<form method='post' action='%s/reports'>%s"
            "<label>শিরোনাম / Title</label><input name='title' required>"
            "<label>বিবরণ / Body (markdown বা সাধারণ লেখা)</label>"
            "<textarea name='body'></textarea>"
            "<button type='submit'>সংরক্ষণ</button>"
            "<a class='btn sec' href='%s/'>বাতিল</a></form></div>"
        ) % (err_h, PREFIX, csrf_input(csrf), PREFIX)
        self._send(200, page("নতুন রিপোর্ট", body, user=ADMIN_USER, extra_nav=csrf))

    def _report_save(self):
        form = self._form()
        if not valid_csrf(form.get("csrf", ""), self._sid()):
            return self._send(403, page("নিষিদ্ধ", "<p class='err'>CSRF যাচাই ব্যর্থ।</p>", user=ADMIN_USER, extra_nav=session_csrf(self._sid())))
        try:
            row = add_report(form.get("title"), form.get("body"))
        except ValueError as exc:
            return self._report_form(str(exc))
        self._redir(PREFIX + "/reports/%d" % row["id"])

    def _report_view(self, rid):
        row = get_report(rid)
        csrf = session_csrf(self._sid())
        if not row:
            return self._send(404, page("মেলেনি", "<p>রিপোর্ট মেলেনি।</p>", user=ADMIN_USER, extra_nav=csrf))
        body = (
            "<div class='card'><h2>%s</h2><p class='hint'>%s</p><div class='md'>%s</div>"
            "<p><a class='btn sec' href='%s/'>ড্যাশবোর্ডে ফিরুন</a></p></div>"
        ) % (e(row["title"]), e((row["created_at"] or "").replace("T", " ")), render_md(row["body"] or ""), PREFIX)
        self._send(200, page(row["title"], body, user=ADMIN_USER, extra_nav=csrf))

    def _bearer(self) -> str:
        h = self.headers.get("Authorization", "")
        if h.lower().startswith("bearer "):
            return h[7:].strip()
        return ""

    def _api_auth(self) -> bool:
        if not api_token_ok(self._bearer()):
            self._send(401, json.dumps({"error": "unauthorized"}), "application/json; charset=utf-8")
            return False
        return True

    def _api_todos(self):
        if not self._api_auth():
            return
        try:
            data = self._json()
        except Exception:
            return self._send(400, json.dumps({"error": "invalid json"}), "application/json; charset=utf-8")
        tid = data.get("id")
        try:
            row = upsert_todo(data.get("title"), data.get("status", "todo"), data.get("priority", 0), data.get("notes", ""), tid)
        except ValueError as exc:
            return self._send(400, json.dumps({"error": str(exc)}), "application/json; charset=utf-8")
        self._send(200, json.dumps(dict(row), ensure_ascii=False), "application/json; charset=utf-8")

    def _api_reports(self):
        if not self._api_auth():
            return
        try:
            data = self._json()
        except Exception:
            return self._send(400, json.dumps({"error": "invalid json"}), "application/json; charset=utf-8")
        try:
            row = add_report(data.get("title"), data.get("body", ""))
        except ValueError as exc:
            return self._send(400, json.dumps({"error": str(exc)}), "application/json; charset=utf-8")
        self._send(200, json.dumps(dict(row), ensure_ascii=False), "application/json; charset=utf-8")


def serve():
    init_db()
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print("FH Planet Reporting on http://%s:%d%s/" % (HOST, PORT, PREFIX), flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


def cmd_set_password():
    import getpass

    init_db()
    a = getpass.getpass("New password for %s: " % ADMIN_USER)
    b = getpass.getpass("Repeat password: ")
    if not a or a != b:
        print("Passwords empty or did not match.", file=sys.stderr)
        sys.exit(1)
    if len(a) < 8:
        print("Password must be at least 8 characters.", file=sys.stderr)
        sys.exit(1)
    meta_set("password_hash", hash_password(a))
    print("Password saved.")


def cmd_create_token():
    init_db()
    tok = create_api_token()
    print(tok)
    print("Store this token now. It will not be shown again.", file=sys.stderr)


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0] in ("serve", "run"):
        serve()
        return
    if argv[0] == "set-password":
        cmd_set_password()
        return
    if argv[0] == "create-token":
        cmd_create_token()
        return
    print("Usage: app.py [serve|set-password|create-token]", file=sys.stderr)
    sys.exit(2)


if __name__ == "__main__":
    main()
