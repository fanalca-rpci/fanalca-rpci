"""Respaldo incremental de los archivos de Supabase Storage (fotos, audios, logos, PDF).

Lo corre el workflow del repo privado de respaldos. Baja SOLO los archivos que no
estén en `manifiesto.json` (los ya respaldados), los mete en un .zip y actualiza el
manifiesto. Así cada foto se guarda una sola vez y el espacio no se multiplica.

Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
Uso: python3 respaldar_archivos.py <salida.zip>  → imprime "nuevos=N"
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

BUCKETS = ("maintenance-attachments", "site-sources")
MANIFEST = Path("manifiesto.json")


def _req(url: str, key: str, body: dict | None = None) -> bytes:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers={
        "apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as res:
        return res.read()


def list_bucket(url: str, key: str, bucket: str, prefix: str = "") -> list[dict]:
    """Todos los objetos del bucket (recorre carpetas). [{path, size, updated_at}]"""
    out, offset = [], 0
    while True:
        page = json.loads(_req(f"{url}/storage/v1/object/list/{bucket}", key,
                               {"prefix": prefix, "limit": 1000, "offset": offset,
                                "sortBy": {"column": "name", "order": "asc"}}))
        for item in page:
            path = f"{prefix}{item['name']}"
            if item.get("id") is None:          # carpeta
                out.extend(list_bucket(url, key, bucket, path + "/"))
            else:
                meta = item.get("metadata") or {}
                out.append({"path": path, "size": meta.get("size", 0), "updated_at": item.get("updated_at")})
        if len(page) < 1000:
            return out
        offset += 1000


def pending(objects: dict[str, list[dict]], manifest: dict) -> list[tuple[str, dict]]:
    """Objetos que no están respaldados o cambiaron desde el último respaldo."""
    todo = []
    for bucket, items in objects.items():
        done = manifest.get(bucket, {})
        for it in items:
            if done.get(it["path"]) != it["updated_at"]:
                todo.append((bucket, it))
    return todo


def main() -> int:
    url, key = os.environ["SUPABASE_URL"].rstrip("/"), os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    out_zip = Path(sys.argv[1])
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    objects = {b: list_bucket(url, key, b) for b in BUCKETS}
    todo = pending(objects, manifest)
    total = sum(len(v) for v in objects.values())
    print(f"📦 {total} archivos en Supabase · {len(todo)} nuevos o cambiados")
    if todo:
        with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_STORED) as z:   # fotos/audio ya vienen comprimidos
            for bucket, it in todo:
                quoted = urllib.parse.quote(it["path"])
                z.writestr(f"{bucket}/{it['path']}", _req(f"{url}/storage/v1/object/{bucket}/{quoted}", key))
                manifest.setdefault(bucket, {})[it["path"]] = it["updated_at"]
        MANIFEST.write_text(json.dumps(manifest, indent=1, sort_keys=True))
        print(f"✅ {out_zip} ({out_zip.stat().st_size // 1024} KB)")
    print(f"nuevos={len(todo)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
