"""Edge Function admin-users contra el stack local.

Requiere: supabase start + supabase functions serve admin-users (en otra terminal).
"""
import re
import uuid

import httpx
import pytest
from supabase import create_client

from tests.supabase.conftest import SUPABASE_ANON_KEY, SUPABASE_URL

FN_URL = f"{SUPABASE_URL}/functions/v1/admin-users"
TEMP_RE = re.compile(r"^Ptar-[a-z2-9]{4}-[a-z2-9]{4}$")


def call(client, action: str, **body) -> httpx.Response:
    headers = {"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"}
    if client is not None:
        headers["Authorization"] = f"Bearer {client.auth.get_session().access_token}"
    return httpx.post(FN_URL, json={"action": action, **body}, headers=headers, timeout=30)


def new_email() -> str:
    return f"fn-{uuid.uuid4().hex[:8]}@test.local"


def can_login(email: str, password: str) -> bool:
    try:
        create_client(SUPABASE_URL, SUPABASE_ANON_KEY).auth.sign_in_with_password(
            {"email": email, "password": password})
        return True
    except Exception:
        return False


def create(oficina_client, role="tecnico", email=None):
    email = email or new_email()
    r = call(oficina_client, "create", email=email, full_name="Prueba Fn", role=role)
    assert r.status_code == 200, r.text
    return email.strip().lower(), r.json()["data"]


def test_anonimo_401():
    r = httpx.post(FN_URL, json={"action": "list"}, headers={"apikey": SUPABASE_ANON_KEY})
    assert r.status_code == 401


def test_tecnico_403(tecnico_client):
    r = call(tecnico_client, "list")
    assert r.status_code == 403
    assert r.json()["error"] == "Tu usuario no tiene perfil oficina."


def test_oficina_crea_usuario_con_perfil(oficina_client, service_client):
    raw = f"  {new_email().upper()}  "
    email, data = create(oficina_client, email=raw)
    assert TEMP_RE.match(data["temp_password"])
    assert can_login(email, data["temp_password"])
    prof = service_client.table("profiles").select("role, active").eq("user_id", data["user_id"]).single().execute().data
    assert prof == {"role": "tecnico", "active": True}


def test_correo_duplicado_409(oficina_client):
    email, _ = create(oficina_client)
    r = call(oficina_client, "create", email=email.upper(), full_name="Otra", role="tecnico")
    assert r.status_code == 409


@pytest.mark.parametrize("body", [
    {"email": "a@b.co", "full_name": "Ana", "role": "admin"},
    {"email": "a@b.co", "full_name": "   ", "role": "tecnico"},
    {"email": "sin-arroba", "full_name": "Ana", "role": "tecnico"},
])
def test_datos_invalidos_400(oficina_client, body):
    assert call(oficina_client, "create", **body).status_code == 400


def test_reset_password_cambia_la_clave(oficina_client):
    email, data = create(oficina_client)
    r = call(oficina_client, "reset_password", user_id=data["user_id"])
    new = r.json()["data"]["temp_password"]
    assert TEMP_RE.match(new) and new != data["temp_password"]
    assert not can_login(email, data["temp_password"])
    assert can_login(email, new)


def test_desactivar_bloquea_login_y_reactivar_lo_devuelve(oficina_client):
    email, data = create(oficina_client)
    assert call(oficina_client, "deactivate", user_id=data["user_id"]).status_code == 200
    assert not can_login(email, data["temp_password"])
    assert call(oficina_client, "reactivate", user_id=data["user_id"]).status_code == 200
    assert can_login(email, data["temp_password"])


def test_no_puede_desactivarse_a_si_mismo_409(oficina_client, oficina_id):
    assert call(oficina_client, "deactivate", user_id=oficina_id).status_code == 409


def test_no_quita_el_ultimo_oficina_409(oficina_client, oficina_id, service_client):
    others = service_client.table("profiles").select("user_id").eq("role", "oficina") \
        .eq("active", True).neq("user_id", oficina_id).execute().data
    ids = [o["user_id"] for o in others]
    try:
        if ids:
            service_client.table("profiles").update({"active": False}).in_("user_id", ids).execute()
        r = call(oficina_client, "set_role", user_id=oficina_id, role="tecnico")
        assert r.status_code == 409
    finally:
        if ids:
            service_client.table("profiles").update({"active": True}).in_("user_id", ids).execute()


def test_cada_accion_queda_en_bitacora(oficina_client, oficina_id, service_client):
    _, data = create(oficina_client)
    call(oficina_client, "deactivate", user_id=data["user_id"])
    rows = service_client.table("user_admin_log").select("action, actor_id, detail") \
        .eq("target_id", data["user_id"]).execute().data
    assert {r["action"] for r in rows} == {"create", "deactivate"}
    assert all(r["actor_id"] == oficina_id for r in rows)
    assert all("password" not in str(r["detail"]) for r in rows)


def test_list_trae_nombre_perfil_y_estado(oficina_client):
    email, _ = create(oficina_client, role="oficina")
    users = call(oficina_client, "list").json()["data"]
    me = next(u for u in users if u["email"] == email)
    assert me["role"] == "oficina" and me["active"] is True and me["full_name"] == "Prueba Fn"
