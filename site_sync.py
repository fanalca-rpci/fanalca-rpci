"""Sincroniza el sitio con lo configurado desde la administración web.

Lo corre el Action `site-sync.yml` cada 15 min (o a mano). Lee de Supabase
(anon key pública de site_config.json) la fila `site_settings` y los enlaces
`tag_resources`; si `version` no coincide con la última publicada
(`docs/migration_metadata.json` → `source_version`), aplica los cambios y
regenera `docs/`. El commit + push lo hace el workflow.

Uso: python3 site_sync.py        → imprime "changed=true|false" al final
"""
from __future__ import annotations

import colorsys
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
CONFIG = REPO_ROOT / "site_config.json"
METADATA = REPO_ROOT / "docs" / "migration_metadata.json"
LOGO_DEST = REPO_ROOT / "docs" / "assets" / "logos" / "LogoCliente.png"
RESOURCES_XLSX = REPO_ROOT / "TAG_RESOURCES.xlsx"
FICHAS_BASENAME = "fichas_source"


# ── lógica pura (tests: tests/test_site_sync.py) ──────────────────────────
def _hex_to_rgb(c: str) -> tuple[float, float, float]:
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


def _hls_hex(h: float, l: float, s: float) -> str:
    r, g, b = colorsys.hls_to_rgb(h, max(0.0, min(1.0, l)), max(0.0, min(1.0, s)))
    return "#{:02x}{:02x}{:02x}".format(round(r * 255), round(g * 255), round(b * 255))


def luminance(c: str) -> float:
    def ch(v: float) -> float:
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = _hex_to_rgb(c)
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def derive_theme(accent: str) -> dict[str, str]:
    """Tema completo desde un color. Fondo siempre muy claro (legible aunque el color sea oscuro)."""
    accent = accent.lower()
    r, g, b = _hex_to_rgb(accent)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return {
        "accent": accent,
        "accent_hover": _hls_hex(h, l - 0.08 if l > 0.2 else l + 0.08, s),
        "banner_gradient": (
            f"linear-gradient(135deg, {_hls_hex(h, max(l - 0.10, 0.05), s)} 0%, "
            f"{accent} 55%, {_hls_hex(h, min(l + 0.14, 0.75), s)} 100%)"
        ),
        "banner_text": "#ffffff" if luminance(accent) < 0.45 else "#1f2328",
        "banner_shadow": f"0 4px 14px rgba({round(r*255)},{round(g*255)},{round(b*255)},0.30)",
        "content_bg": _hls_hex(h, 0.965, min(s, 0.6)),
        "card_bg": "#ffffff",
        "text": "#1f2328",
        "text_muted": "#57606a",
        "border": _hls_hex(h, 0.88, min(s, 0.5)),
    }


def plan_sync(settings: dict, meta: dict) -> dict[str, bool]:
    """Qué hay que hacer comparando lo configurado con lo último publicado."""
    changed = bool(settings) and settings.get("version") != meta.get("source_version")

    def new(kind: str) -> bool:
        return (changed and bool(settings.get(f"{kind}_file"))
                and settings.get(f"{kind}_version") != meta.get(f"{kind}_version"))

    return {"changed": changed, "logo": new("logo"), "fichas": new("fichas")}


def merge_resources(from_file: dict[str, dict[str, str]], rows: list[dict]) -> list[dict]:
    """Enlaces del Excel subido + los editados uno por uno (estos ganan)."""
    cols = {"Specifications": "specifications", "Handbook_Manual": "handbook", "Maintenance": "maintenance"}
    merged: dict[str, dict] = {}
    for tag, links in from_file.items():
        merged[tag] = {"tag_id": tag, **{cols[k]: v for k, v in links.items() if k in cols}}
    for r in rows:
        base = merged.setdefault(r["tag_id"], {"tag_id": r["tag_id"]})
        for k in cols.values():
            if r.get(k) is not None:
                base[k] = r[k]
    return list(merged.values())


def photo_names(paths: list[str]) -> list[str]:
    """Nombres locales de las fotos subidas desde la web, en orden (web-1.jpg, …)."""
    out = []
    for i, p in enumerate(paths, 1):
        ext = Path(p).suffix.lower() or ".jpg"
        out.append(f"web-{i}{ext}")
    return out


def warnings_from_log(log: str) -> list[str]:
    """Líneas del log que el usuario debería ver (hojas ignoradas, avisos, errores)."""
    keys = ("⚠", "⊘", "✗", "❌", "ignor", "descart", "sin categor")
    seen, out = set(), []
    for line in log.splitlines():
        t = line.strip()
        if t and any(k in t for k in keys) and t not in seen:
            seen.add(t)
            out.append(t)
    return out[:30]


def apply_config(config: dict, settings: dict) -> dict:
    """Devuelve site_config con títulos, enlace del logo y tema de `settings`."""
    out = json.loads(json.dumps(config))
    for key in ("site_title", "banner_title_full", "banner_title_short"):
        if settings.get(key):
            out[key] = settings[key]
    out.setdefault("logos", {})["right_href"] = settings.get("logo_href") or ""
    if settings.get("accent"):
        out["theme"] = derive_theme(settings["accent"])
    return out


def write_resources_xlsx(rows: list[dict], path: Path) -> None:
    """TAG_RESOURCES.xlsx con las URLs como texto (excel_migrator acepta http(s) en texto)."""
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "TAG_RESOURCES"
    ws.append(["TAG_ID", "Specifications", "Handbook_Manual", "Maintenance"])
    for r in sorted(rows, key=lambda r: r["tag_id"]):
        ws.append([r["tag_id"], r.get("specifications") or "", r.get("handbook") or "", r.get("maintenance") or ""])
    wb.save(path)


# ── red y efectos ─────────────────────────────────────────────────────────
def _get(url: str, key: str) -> bytes:
    req = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()


STATUS = REPO_ROOT / "docs" / "publish_status.json"


def _run(args: list[str], log: list[str], env: dict | None = None) -> None:
    res = subprocess.run([sys.executable, *args], cwd=REPO_ROOT, env=env, capture_output=True, text=True)
    log.append(res.stdout + res.stderr)
    print(res.stdout + res.stderr)
    if res.returncode != 0:
        raise RuntimeError(f"Falló {args[0]}: " + (res.stderr.strip().splitlines() or ["sin detalle"])[-1])


def main() -> int:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    url, key = config["supabase"]["url"], config["supabase"]["anon_key"]
    rows = json.loads(_get(f"{url}/rest/v1/site_settings?id=eq.1&select=*", key))
    settings = rows[0] if rows else {}
    meta = json.loads(METADATA.read_text(encoding="utf-8")) if METADATA.exists() else {}
    plan = plan_sync(settings, meta)
    if not plan["changed"]:
        print("✅ Sin cambios desde la administración web.")
        print("changed=false")
        return 0

    print(f"🔄 Cambios desde la web (versión {settings['version']}).")
    log: list[str] = []
    status = {"version": settings["version"], "ok": False,
              "at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    try:
        CONFIG.write_text(json.dumps(apply_config(config, settings), ensure_ascii=False, indent=2) + "\n",
                          encoding="utf-8")
        public = f"{url}/storage/v1/object/public/site-sources/"
        if plan["logo"]:
            LOGO_DEST.parent.mkdir(parents=True, exist_ok=True)
            LOGO_DEST.write_bytes(_get(public + settings["logo_file"], key))
            log.append(f"🖼️ Logo actualizado.")

        if plan["fichas"]:
            ext = Path(settings["fichas_file"]).suffix.lower() or ".xlsx"
            for old in REPO_ROOT.glob(f"{FICHAS_BASENAME}.*"):
                old.unlink()
            src = REPO_ROOT / f"{FICHAS_BASENAME}{ext}"
            src.write_bytes(_get(public + settings["fichas_file"], key))
            log.append(f"📄 Excel de fichas nuevo: {Path(settings['fichas_file']).name}")
            _run(["convert_fichas_to_template.py", src.name], log)

        # Enlaces: Excel subido (si hay) + editados uno por uno
        from_file: dict = {}
        if settings.get("resources_file"):
            tmp = REPO_ROOT / "_resources_upload.xlsx"
            tmp.write_bytes(_get(public + settings["resources_file"], key))
            sys.path.insert(0, str(REPO_ROOT))
            from excel_migrator import load_tag_resources
            from_file = load_tag_resources(tmp)
            tmp.unlink()
        resources = merge_resources(from_file, json.loads(_get(f"{url}/rest/v1/tag_resources?select=*", key)))
        if resources:
            write_resources_xlsx(resources, RESOURCES_XLSX)
            log.append(f"🔗 {len(resources)} TAGs con enlaces.")

        # Fotos tomadas desde el celular: van primero en la ficha
        photos = json.loads(_get(f"{url}/rest/v1/tag_photos?select=tag_id,path&order=created_at", key))
        images_dir = REPO_ROOT / "docs" / "assets" / "images"
        manifest_path = images_dir / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
        by_tag: dict[str, list[str]] = {}
        for ph in photos:
            by_tag.setdefault(ph["tag_id"], []).append(ph["path"])
        for tag in set(manifest) | set(by_tag):
            tag_dir = images_dir / tag
            for old in tag_dir.glob("web-*"):
                old.unlink()
            names = photo_names(by_tag.get(tag, []))
            if names:
                tag_dir.mkdir(parents=True, exist_ok=True)
                for name, path in zip(names, by_tag[tag]):
                    (tag_dir / name).write_bytes(_get(public + path, key))
            rest = [n for n in manifest.get(tag, []) if not n.startswith("web-")]
            if names or rest:
                manifest[tag] = names + rest
            else:
                manifest.pop(tag, None)
        if photos:
            log.append(f"📷 {len(photos)} fotos tomadas desde el celular.")
        images_dir.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

        env = dict(os.environ,
                   SITE_SOURCE_VERSION=settings["version"],
                   SITE_FICHAS_VERSION=settings.get("fichas_version") or "",
                   SITE_LOGO_VERSION=settings.get("logo_version") or "")
        _run(["excel_migrator.py", "plantilla_sitio.xlsx", "docs/"], log, env)
        new_meta = json.loads(METADATA.read_text(encoding="utf-8"))
        status.update(ok=True, tags=new_meta.get("total_tags"), categories=new_meta.get("categories"))
    except Exception as e:  # el error queda visible en la administración
        status["error"] = str(e)
        print(f"❌ {e}")
    full = "\n".join(log)
    status["warnings"] = warnings_from_log(full)
    status["log"] = full.splitlines()[-40:]
    STATUS.write_text(json.dumps(status, ensure_ascii=False, indent=2), encoding="utf-8")
    print("changed=true")
    return 0


if __name__ == "__main__":
    sys.exit(main())
