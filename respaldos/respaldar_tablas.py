"""Respaldo de la base en JSON usando la API de Supabase (sin contraseña de la base).

Exporta TODAS las tablas del esquema public (las descubre en la API), página por
página, y los usuarios de login (sin contraseñas). Complementa al volcado pg_dump
cuando no hay SUPABASE_DB_URL. Variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

Uso: python3 respaldar_tablas.py <carpeta_salida>
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

PAGE = 1000


def _get(url: str, key: str, extra: dict | None = None) -> bytes:
    headers = {"apikey": key, "Authorization": f"Bearer {key}", **(extra or {})}
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120) as res:
        return res.read()


def tables(url: str, key: str) -> list[str]:
    """Tablas y vistas expuestas en public (de la descripción OpenAPI de PostgREST)."""
    spec = json.loads(_get(f"{url}/rest/v1/", key, {"Accept": "application/openapi+json"}))
    return sorted(p.strip("/") for p in spec.get("paths", {}) if p.count("/") == 1 and not p.startswith("/rpc"))


def dump_table(url: str, key: str, name: str) -> list[dict]:
    rows, start = [], 0
    while True:
        chunk = json.loads(_get(f"{url}/rest/v1/{name}?select=*", key,
                                {"Range-Unit": "items", "Range": f"{start}-{start + PAGE - 1}"}))
        rows.extend(chunk)
        if len(chunk) < PAGE:
            return rows
        start += PAGE


def dump_users(url: str, key: str) -> list[dict]:
    users, page = [], 1
    while True:
        data = json.loads(_get(f"{url}/auth/v1/admin/users?page={page}&per_page={PAGE}", key))
        batch = data.get("users", data if isinstance(data, list) else [])
        users.extend({k: u.get(k) for k in ("id", "email", "created_at", "last_sign_in_at",
                                              "email_confirmed_at", "banned_until")} for u in batch)
        if len(batch) < PAGE:
            return users
        page += 1


def main() -> int:
    url, key = os.environ["SUPABASE_URL"].rstrip("/"), os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    resumen = {}
    for name in tables(url, key):
        rows = dump_table(url, key, name)
        (out / f"{name}.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
        resumen[name] = len(rows)
    users = dump_users(url, key)
    (out / "auth_users.json").write_text(json.dumps(users, ensure_ascii=False), encoding="utf-8")
    resumen["auth_users"] = len(users)
    (out / "resumen.json").write_text(json.dumps(resumen, indent=1, ensure_ascii=False), encoding="utf-8")
    for k, v in resumen.items():
        print(f"   {k}: {v}")
    print(f"✅ {len(resumen)} tablas exportadas en JSON")
    return 0


if __name__ == "__main__":
    sys.exit(main())
