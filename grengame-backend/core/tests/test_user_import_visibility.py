import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.mark.django_db
def test_temporary_admin_lists_all_users_with_manage_flags(api_client):
    temp_admin = User.objects.create_user(
        username="temp_admin_list",
        email="temp.admin.list@test.local",
        password="Senha123!",
        role="admin",
        is_temporary_account=True,
    )
    managed_user = User.objects.create_user(
        username="managed_user_list",
        email="managed.user.list@test.local",
        password="Senha123!",
        role="user",
        created_by_temporary_admin=temp_admin,
    )
    external_admin = User.objects.create_user(
        username="external_admin_list",
        email="external.admin.list@test.local",
        password="Senha123!",
        role="admin",
    )

    api_client.force_authenticate(user=temp_admin)
    response = api_client.get("/auth/usuarios/")

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    by_email = {item["email"]: item for item in payload}

    assert temp_admin.email in by_email
    assert managed_user.email in by_email
    assert external_admin.email in by_email

    assert by_email[temp_admin.email]["can_manage"] is True
    assert by_email[managed_user.email]["can_manage"] is True
    assert by_email[external_admin.email]["can_manage"] is False


@pytest.mark.django_db
def test_temporary_admin_can_update_own_user(api_client):
    temp_admin = User.objects.create_user(
        username="temp_admin_self",
        email="temp.admin.self@test.local",
        password="OldPassword123!",
        role="admin",
        is_temporary_account=True,
    )

    api_client.force_authenticate(user=temp_admin)
    response = api_client.post(
        "/auth/usuarios/atualizar/",
        {
            "email": temp_admin.email,
            "password": "NovaSenha123!",
            "nome": "Temp Atualizado",
            "role": "admin",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    temp_admin.refresh_from_db()
    assert temp_admin.check_password("NovaSenha123!")
    assert temp_admin.first_name == "Temp Atualizado"


@pytest.mark.django_db
def test_temporary_admin_cannot_update_unmanaged_user(api_client):
    temp_admin = User.objects.create_user(
        username="temp_admin_block",
        email="temp.admin.block@test.local",
        password="Senha123!",
        role="admin",
        is_temporary_account=True,
    )
    unmanaged_user = User.objects.create_user(
        username="unmanaged_user_block",
        email="unmanaged.user.block@test.local",
        password="Senha123!",
        role="user",
    )

    api_client.force_authenticate(user=temp_admin)
    response = api_client.post(
        "/auth/usuarios/atualizar/",
        {
            "email": unmanaged_user.email,
            "password": "OutraSenha123!",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    unmanaged_user.refresh_from_db()
    assert unmanaged_user.check_password("Senha123!")
