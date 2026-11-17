"""Detección automática del Excel de fichas en la raíz (xlsx o xlsm, sin la sábana)."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from excel_migrator import list_fichas_candidates  # noqa: E402


def _touch(path: Path, mtime: int) -> None:
    path.write_bytes(b"x")
    os.utime(path, (mtime, mtime))


def test_acepta_xlsm_e_ignora_archivos_que_no_son_fichas(tmp_path):
    for name in ("plantilla_sitio.xlsx", "TAG_RESOURCES.xlsx", "sabana_base.xlsx", "~$lock.xlsx"):
        _touch(tmp_path / name, 3000)
    _touch(tmp_path / "fichas.xlsm", 1000)
    assert list_fichas_candidates(tmp_path) == [tmp_path / "fichas.xlsm"]


def test_ordena_del_mas_reciente_al_mas_viejo(tmp_path):
    _touch(tmp_path / "vieja.xlsx", 1000)
    _touch(tmp_path / "nueva.xlsm", 2000)
    assert [p.name for p in list_fichas_candidates(tmp_path)] == ["nueva.xlsm", "vieja.xlsx"]
