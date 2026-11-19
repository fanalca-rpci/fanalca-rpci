"""Lógica pura de site_sync.py (sin red)."""
import sys
from pathlib import Path

from openpyxl import load_workbook

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import site_sync as S  # noqa: E402


def test_tema_de_color_oscuro_tiene_fondo_claro_y_texto_blanco():
    t = S.derive_theme("#081C49")
    assert t["accent"] == "#081c49"
    assert S.luminance(t["content_bg"]) > 0.85
    assert t["banner_text"] == "#ffffff"
    assert set(t) == {"accent", "accent_hover", "banner_gradient", "banner_text", "banner_shadow",
                      "content_bg", "card_bg", "text", "text_muted", "border"}


def test_tema_de_color_claro_usa_texto_oscuro():
    assert S.derive_theme("#ffd84d")["banner_text"] == "#1f2328"


def test_sin_cambios_si_la_version_coincide():
    plan = S.plan_sync({"version": "v1", "logo_file": "l.png", "logo_version": "a"}, {"source_version": "v1"})
    assert plan == {"changed": False, "logo": False, "fichas": False}


def test_solo_baja_lo_que_cambio():
    settings = {"version": "v2", "logo_file": "l.png", "logo_version": "a",
                "fichas_file": "f.xlsm", "fichas_version": "b"}
    meta = {"source_version": "v1", "logo_version": "a", "fichas_version": "x"}
    assert S.plan_sync(settings, meta) == {"changed": True, "logo": False, "fichas": True}


def test_sin_fila_de_settings_no_hace_nada():
    assert S.plan_sync({}, {})["changed"] is False


def test_apply_config_cambia_titulos_enlace_y_tema_sin_tocar_supabase():
    config = {"site_title": "A", "banner_title_full": "B", "banner_title_short": "C",
              "logos": {"left": "x"}, "supabase": {"url": "u", "anon_key": "k"}, "theme": {"accent": "#000000"}}
    out = S.apply_config(config, {"site_title": "QR Nuevo", "banner_title_full": "",
                                  "logo_href": "https://cliente.com", "accent": "#0f766e"})
    assert out["site_title"] == "QR Nuevo"
    assert out["banner_title_full"] == "B"
    assert out["logos"] == {"left": "x", "right_href": "https://cliente.com"}
    assert out["theme"]["accent"] == "#0f766e"
    assert out["supabase"] == {"url": "u", "anon_key": "k"}
    assert config["site_title"] == "A"


def test_write_resources_xlsx(tmp_path):
    p = tmp_path / "TAG_RESOURCES.xlsx"
    S.write_resources_xlsx([{"tag_id": "B", "handbook": "https://m"}, {"tag_id": "A", "specifications": "https://s"}], p)
    ws = load_workbook(p)["TAG_RESOURCES"]
    rows = [[c.value for c in r] for r in ws.iter_rows()]
    assert rows[0] == ["TAG_ID", "Specifications", "Handbook_Manual", "Maintenance"]
    assert rows[1][:2] == ["A", "https://s"]
    assert rows[2][2] == "https://m"


def test_merge_resources_editados_ganan():
    from_file = {"A": {"Specifications": "https://viejo", "Maintenance": "https://m"}, "B": {"Handbook_Manual": "https://h"}}
    rows = [{"tag_id": "A", "specifications": "https://nuevo", "handbook": None, "maintenance": None},
            {"tag_id": "C", "handbook": "https://c"}]
    out = {r["tag_id"]: r for r in S.merge_resources(from_file, rows)}
    assert out["A"]["specifications"] == "https://nuevo"
    assert out["A"]["maintenance"] == "https://m"
    assert out["B"]["handbook"] == "https://h"
    assert out["C"]["handbook"] == "https://c"


def test_photo_names_en_orden_con_extension():
    assert S.photo_names(["fotos/X/1.jpeg", "fotos/X/2.PNG", "fotos/X/3"]) == ["web-1.jpeg", "web-2.png", "web-3.jpg"]


def test_warnings_from_log_filtra_y_no_repite():
    log = "📖 Leyendo\n  ⊘ 52 imágenes descartadas\n  ✓ ok\n⚠️ Hoja3 ignorada\n⚠️ Hoja3 ignorada\n"
    assert S.warnings_from_log(log) == ["⊘ 52 imágenes descartadas", "⚠️ Hoja3 ignorada"]
