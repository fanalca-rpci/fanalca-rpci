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
    return {
        "changed": changed,
        "logo": changed and bool(settings.get("logo_file"))
                and settings.get("logo_version") != meta.get("logo_version"),
        "fichas": changed and bool(settings.get("fichas_file"))
                  and settings.get("fichas_version") != meta.get("fichas_version"),
    }


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
    CONFIG.write_text(json.dumps(apply_config(config, settings), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    public = f"{url}/storage/v1/object/public/site-sources/"
    if plan["logo"]:
        LOGO_DEST.parent.mkdir(parents=True, exist_ok=True)
        LOGO_DEST.write_bytes(_get(public + settings["logo_file"], key))
        print(f"🖼️  Logo actualizado ({settings['logo_file']}).")

    resources = json.loads(_get(f"{url}/rest/v1/tag_resources?select=*", key))
    if resources:
        write_resources_xlsx(resources, RESOURCES_XLSX)
        print(f"🔗 {len(resources)} TAGs con enlaces.")

    if plan["fichas"]:
        ext = Path(settings["fichas_file"]).suffix.lower() or ".xlsx"
        for old in REPO_ROOT.glob(f"{FICHAS_BASENAME}.*"):
            old.unlink()
        src = REPO_ROOT / f"{FICHAS_BASENAME}{ext}"
        src.write_bytes(_get(public + settings["fichas_file"], key))
        print(f"📄 Excel de fichas nuevo: {settings['fichas_file']}")
        subprocess.run([sys.executable, "convert_fichas_to_template.py", src.name], cwd=REPO_ROOT, check=True)

    env = dict(os.environ,
               SITE_SOURCE_VERSION=settings["version"],
               SITE_FICHAS_VERSION=settings.get("fichas_version") or "",
               SITE_LOGO_VERSION=settings.get("logo_version") or "")
    subprocess.run([sys.executable, "excel_migrator.py", "plantilla_sitio.xlsx", "docs/"],
                   cwd=REPO_ROOT, check=True, env=env)
    print("changed=true")
    return 0


if __name__ == "__main__":
    sys.exit(main())
