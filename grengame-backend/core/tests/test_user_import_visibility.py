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


@pytest.mark.django_db
def test_global_admin_cannot_create_user_with_weak_password(api_client):
    admin_user = User.objects.create_user(
        username="global_admin_create",
        email="global.admin.create@test.local",
        password="Senha123!Admin",
        role="admin",
    )

    api_client.force_authenticate(user=admin_user)
    response = api_client.post(
        "/auth/usuarios/criar/",
        {
            "nome": "Novo Usuario",
            "email": "novo.usuario@test.local",
            "password": "12345678",
            "role": "user",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert User.objects.filter(email="novo.usuario@test.local").exists() is False


@pytest.mark.django_db
def test_global_admin_cannot_create_user_with_html_name(api_client):
    admin_user = User.objects.create_user(
        username="global_admin_html_name",
        email="global.admin.html.name@test.local",
        password="Senha123!Admin",
        role="admin",
    )

    api_client.force_authenticate(user=admin_user)
    response = api_client.post(
        "/auth/usuarios/criar/",
        {
            "nome": "<b>Novo Usuario</b>",
            "email": "novo.usuario.html@test.local",
            "password": "Senha123!Forte",
            "role": "user",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "texto puro" in response.json()["error"].lower()
    assert User.objects.filter(email="novo.usuario.html@test.local").exists() is False


@pytest.mark.django_db
def test_global_admin_cannot_update_user_with_weak_password(api_client):
    admin_user = User.objects.create_user(
        username="global_admin_update",
        email="global.admin.update@test.local",
        password="Senha123!Admin",
        role="admin",
    )
    managed_user = User.objects.create_user(
        username="managed_user_update",
        email="managed.user.update@test.local",
        password="Senha123!Inicial",
        role="user",
    )

    api_client.force_authenticate(user=admin_user)
    response = api_client.post(
        "/auth/usuarios/atualizar/",
        {
            "email": managed_user.email,
            "password": "12345678",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    managed_user.refresh_from_db()
    assert managed_user.check_password("Senha123!Inicial")


@pytest.mark.django_db
def test_temporary_admin_cannot_update_own_user_with_html_name(api_client):
    temp_admin = User.objects.create_user(
        username="temp_admin_html_update",
        email="temp.admin.html.update@test.local",
        password="Senha123!",
        role="admin",
        is_temporary_account=True,
    )

    api_client.force_authenticate(user=temp_admin)
    response = api_client.post(
        "/auth/usuarios/atualizar/",
        {
            "email": temp_admin.email,
            "nome": '<img src=x onerror=alert(1)>Temp',
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "texto puro" in response.json()["error"].lower()


@pytest.mark.django_db
def test_global_admin_import_rejects_html_name(api_client):
    admin_user = User.objects.create_user(
        username="global_admin_import_html",
        email="global.admin.import.html@test.local",
        password="Senha123!Admin",
        role="admin",
    )

    api_client.force_authenticate(user=admin_user)
    response = api_client.post(
        "/auth/usuarios/importacao/",
        {
            "usuarios": [
                {
                    "nome": "<script>alert(1)</script>Maria",
                    "email": "maria.import.html@test.local",
                }
            ]
        },
        format="json",
    )

    assert response.status_code == status.HTTP_409_CONFLICT
    assert "texto puro" in response.json()["errors"][0]["motivo"].lower()
    assert User.objects.filter(email="maria.import.html@test.local").exists() is False
