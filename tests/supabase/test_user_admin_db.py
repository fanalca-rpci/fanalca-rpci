"""Usuarios activos/desactivados y bitácora de administración (migración 20261117120000)."""
from datetime import date

import pytest
from postgrest.exceptions import APIError


def _set_active(service_client, user_id: str, active: bool) -> None:
    service_client.table("profiles").update({"active": active}).eq("user_id", user_id).execute()


def test_desactivado_con_sesion_abierta_no_puede_registrar(service_client, tecnico_client, tecnico_id, random_tag_id):
    _set_active(service_client, tecnico_id, False)
    try:
        with pytest.raises(APIError):
            tecnico_client.table("maintenance_records").insert({
                "tag_id": random_tag_id,
                "performed_at": date.today().isoformat(),
                "type": "preventivo",
                "description": "no debería guardarse",
                "created_by": tecnico_id,
            }).execute()
    finally:
        _set_active(service_client, tecnico_id, True)


def test_oficina_desactivado_pierde_is_oficina(service_client, oficina_client, oficina_id):
    assert oficina_client.rpc("is_oficina").execute().data is True
    _set_active(service_client, oficina_id, False)
    try:
        assert oficina_client.rpc("is_oficina").execute().data is False
    finally:
        _set_active(service_client, oficina_id, True)


def test_bitacora_solo_lectura_oficina(service_client, oficina_client, tecnico_client, oficina_id):
    row = service_client.table("user_admin_log").insert(
        {"actor_id": oficina_id, "action": "create", "detail": {"nota": "test"}}
    ).execute().data[0]
    ids = [r["id"] for r in oficina_client.table("user_admin_log").select("id").execute().data]
    assert row["id"] in ids
    assert tecnico_client.table("user_admin_log").select("id").execute().data == []
    with pytest.raises(APIError):
        tecnico_client.table("user_admin_log").insert(
            {"actor_id": oficina_id, "action": "create"}
        ).execute()
