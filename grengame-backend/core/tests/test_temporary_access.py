from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from core.models import TemporaryAccessActivationToken, TemporaryAccessRequest
from core.verification_codes import hash_session_token

User = get_user_model()


def create_activation_token(user, raw_code="123456", **kwargs):
    expires_at = kwargs.pop("expires_at", timezone.now() + timedelta(minutes=15))
    raw_session_token = kwargs.pop("activation_session_token", None)
    token_obj = TemporaryAccessActivationToken(user=user, expires_at=expires_at, **kwargs)
    token_obj.set_code(raw_code)
    if raw_session_token:
        token_obj.activation_session_token = hash_session_token(raw_session_token)
    token_obj.save()
    return token_obj


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def global_admin_user(db):
    return User.objects.create_user(
        username="global_admin_temp_access",
        email="global.admin.temp.access@example.com",
        password="Senha123!Admin",
        role="admin",
    )


@pytest.mark.django_db
@override_settings(TEMPORARY_ACCESS_SELF_SERVICE_ENABLED=True)
def test_temporary_access_request_success_creates_pending_request_without_account(
    api_client,
):
    response = api_client.post(
        "/auth/temporary-access/request/",
        {
            "nome": "Maria Silva",
            "email": "maria.silva@gmail.com",
            "aceite_temporario": True,
            "aceite_formal": True,
        },
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    pending_request = TemporaryAccessRequest.objects.get(
        email="maria.silva@gmail.com",
        status=TemporaryAccessRequest.STATUS_PENDING,
    )

    assert pending_request.name == "Maria Silva"
    assert pending_request.accepted_temporary_terms is True
    assert pending_request.accepted_formal_terms is True
    assert User.objects.filter(email="maria.silva@gmail.com").exists() is False
    assert TemporaryAccessActivationToken.objects.count() == 0
    assert response.data["temporary_access_status"] == TemporaryAccessRequest.STATUS_PENDING


@pytest.mark.django_db
def test_temporary_access_request_disabled_by_default(api_client):
    response = api_client.post(
        "/auth/temporary-access/request/",
        {
            "nome": "Maria Silva",
            "email": "maria.silva@gmail.com",
            "aceite_temporario": True,
            "aceite_formal": True,
        },
        format="json",
    )

    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert User.objects.filter(is_temporary_account=True).count() == 0
    assert TemporaryAccessRequest.objects.count() == 0


@pytest.mark.django_db
@override_settings(TEMPORARY_ACCESS_SELF_SERVICE_ENABLED=True)
def test_temporary_access_request_requires_acceptance(api_client):
    response = api_client.post(
        "/auth/temporary-access/request/",
        {
            "nome": "Maria Silva",
            "email": "maria.silva@gmail.com",
            "aceite_temporario": False,
            "aceite_formal": True,
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert User.objects.filter(is_temporary_account=True).count() == 0
    assert TemporaryAccessRequest.objects.count() == 0


@pytest.mark.django_db
@override_settings(
    TEMPORARY_ACCESS_SELF_SERVICE_ENABLED=True,
    TEMPORARY_ACCESS_ALLOWED_EMAIL_DOMAINS=("empresa.com",),
)
def test_temporary_access_request_rejects_email_outside_allowed_domains(api_client):
    response = api_client.post(
        "/auth/temporary-access/request/",
        {
            "nome": "Maria Silva",
            "email": "maria.silva@gmail.com",
            "aceite_temporario": True,
            "aceite_formal": True,
        },
        format="json",
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert User.objects.filter(is_temporary_account=True).count() == 0
    assert TemporaryAccessRequest.objects.count() == 0


@pytest.mark.django_db
@override_settings(TEMPORARY_ACCESS_SELF_SERVICE_ENABLED=True)
def test_temporary_access_request_reuses_existing_pending_request(api_client):
    pending_request = TemporaryAccessRequest.objects.create(
        name="Nome Antigo",
        email="maria.silva@gmail.com",
        accepted_temporary_terms=True,
        accepted_formal_terms=True,
        status=TemporaryAccessRequest.STATUS_PENDING,
    )

    response = api_client.post(
        "/auth/temporary-access/request/",
        {
            "nome": "Maria Atualizada",
            "email": "maria.silva@gmail.com",
            "aceite_temporario": True,
            "aceite_formal": True,
        },
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    pending_request.refresh_from_db()
    assert pending_request.name == "Maria Atualizada"
    assert TemporaryAccessRequest.objects.filter(
        email="maria.silva@gmail.com",
        status=TemporaryAccessRequest.STATUS_PENDING,
    ).count() == 1


@pytest.mark.django_db
def test_global_admin_can_list_pending_temporary_access_requests(
    api_client,
    global_admin_user,
):
    TemporaryAccessRequest.objects.create(
        name="Maria Silva",
        email="maria.silva@gmail.com",
        accepted_temporary_terms=True,
        accepted_formal_terms=True,
        status=TemporaryAccessRequest.STATUS_PENDING,
    )

    api_client.force_authenticate(user=global_admin_user)
    response = api_client.get("/auth/temporary-access/requests/")

    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]["email"] == "maria.silva@gmail.com"
    assert response.data[0]["status"] == TemporaryAccessRequest.STATUS_PENDING


@pytest.mark.django_db
def test_temporary_admin_cannot_manage_pending_temporary_access_requests(api_client):
    temp_admin = User.objects.create_user(
        username="temp_admin_pending_queue",
        email="temp.admin.pending.queue@example.com",
        password="Senha123!Temp",
        role="admin",
        is_temporary_account=True,
    )

    api_client.force_authenticate(user=temp_admin)
    response = api_client.get("/auth/temporary-access/requests/")

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_global_admin_can_approve_pending_request_and_provision_hashed_activation(
    api_client,
    global_admin_user,
    monkeypatch,
):
    captured = {}
    access_request = TemporaryAccessRequest.objects.create(
        name="Maria Silva",
        email="maria.silva@gmail.com",
        accepted_temporary_terms=True,
        accepted_formal_terms=True,
        status=TemporaryAccessRequest.STATUS_PENDING,
    )

    def _mock_send_temporary_access_activation_email(**kwargs):
        captured.update(kwargs)
        return True

    monkeypatch.setattr(
        "core.views.send_temporary_access_activation_email",
        _mock_send_temporary_access_activation_email,
    )

    api_client.force_authenticate(user=global_admin_user)
    response = api_client.post(
        f"/auth/temporary-access/requests/{access_request.id}/approve/",
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    access_request.refresh_from_db()
    temp_user = User.objects.get(email="maria.silva@gmail.com")
    activation_token = TemporaryAccessActivationToken.objects.get(user=temp_user)

    assert access_request.status == TemporaryAccessRequest.STATUS_APPROVED
    assert access_request.reviewed_by_id == global_admin_user.id
    assert access_request.provisioned_user_id == temp_user.id
    assert temp_user.role == "admin"
    assert temp_user.is_temporary_account is True
    assert temp_user.has_usable_password() is False
    assert temp_user.temporary_activated_at is None
    assert activation_token.token != captured["code"]
    assert activation_token.matches_code(captured["code"]) is True
    assert "password" not in captured


@pytest.mark.django_db
def test_global_admin_can_reject_pending_request_without_provisioning_user(
    api_client,
    global_admin_user,
):
    access_request = TemporaryAccessRequest.objects.create(
        name="Maria Silva",
        email="maria.silva@gmail.com",
        accepted_temporary_terms=True,
        accepted_formal_terms=True,
        status=TemporaryAccessRequest.STATUS_PENDING,
    )

    api_client.force_authenticate(user=global_admin_user)
    response = api_client.post(
        f"/auth/temporary-access/requests/{access_request.id}/reject/",
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    access_request.refresh_from_db()
    assert access_request.status == TemporaryAccessRequest.STATUS_REJECTED
    assert access_request.reviewed_by_id == global_admin_user.id
    assert User.objects.filter(email="maria.silva@gmail.com").exists() is False


@pytest.mark.django_db
@override_settings(TEMPORARY_ACCESS_SELF_SERVICE_ENABLED=True)
def test_temporary_access_request_resends_activation_for_approved_unactivated_account(
    api_client,
    monkeypatch,
):
    captured = {}
    temp_user = User.objects.create_user(
        username="temp_resend_access",
        email="maria.silva@gmail.com",
        password="Senha123!Temp",
        role="admin",
        is_temporary_account=True,
    )
    temp_user.set_unusable_password()
    temp_user.save(update_fields=["password"])

    TemporaryAccessRequest.objects.create(
        name="Maria Silva",
        email=temp_user.email,
        accepted_temporary_terms=True,
        accepted_formal_terms=True,
        status=TemporaryAccessRequest.STATUS_APPROVED,
        provisioned_user=temp_user,
        reviewed_at=timezone.now(),
    )

    def _mock_send_temporary_access_activation_email(**kwargs):
        captured.update(kwargs)
        return True

    monkeypatch.setattr(
        "core.views.send_temporary_access_activation_email",
        _mock_send_temporary_access_activation_email,
    )

    response = api_client.post(
        "/auth/temporary-access/request/",
        {
            "nome": "Maria Silva",
            "email": temp_user.email,
            "aceite_temporario": True,
            "aceite_formal": True,
        },
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    activation_token = TemporaryAccessActivationToken.objects.get(user=temp_user)
    assert activation_token.token != captured["code"]
    assert activation_token.matches_code(captured["code"]) is True
    assert captured["to_email"] == temp_user.email


@pytest.mark.django_db
def test_temporary_access_verify_returns_pending_approval_message(api_client):
    TemporaryAccessRequest.objects.create(
        name="Maria Silva",
        email="maria.silva@gmail.com",
        accepted_temporary_terms=True,
        accepted_formal_terms=True,
        status=TemporaryAccessRequest.STATUS_PENDING,
    )

    response = api_client.post(
        "/auth/temporary-access/verify/",
        {
            "email": "maria.silva@gmail.com",
            "code": "123456",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "ainda nao aprovada" in response.data["error"]


@pytest.mark.django_db
def test_temporary_access_verify_success_returns_session_token(api_client):
    user = User.objects.create_user(
        username="temp_verify",
        email="temp.verify@example.com",
        password="Senha123!Temp",
        role="admin",
        is_temporary_account=True,
    )
    user.set_unusable_password()
    user.save(update_fields=["password"])

    token_obj = create_activation_token(user, raw_code="654321")

    response = api_client.post(
        "/auth/temporary-access/verify/",
        {
            "email": user.email,
            "code": "654321",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    token_obj.refresh_from_db()
    assert token_obj.is_used is True
    session_token = response.data["session_token"]
    assert token_obj.activation_session_token != session_token
    assert token_obj.activation_session_token == hash_session_token(session_token)
    assert token_obj.matches_code("654321") is False


@pytest.mark.django_db
@override_settings(TEMPORARY_ACCESS_ACTIVATION_MAX_ATTEMPTS=2)
def test_temporary_access_verify_locks_challenge_after_max_attempts(api_client):
    user = User.objects.create_user(
        username="temp_verify_lock",
        email="temp.verify.lock@example.com",
        password="Senha123!Temp",
        role="admin",
        is_temporary_account=True,
    )
    user.set_unusable_password()
    user.save(update_fields=["password"])

    token_obj = create_activation_token(user, raw_code="222222")

    first = api_client.post(
        "/auth/temporary-access/verify/",
        {
            "email": user.email,
            "code": "000000",
        },
        format="json",
    )
    second = api_client.post(
        "/auth/temporary-access/verify/",
        {
            "email": user.email,
            "code": "111111",
        },
        format="json",
    )

    token_obj.refresh_from_db()
    assert first.status_code == status.HTTP_400_BAD_REQUEST
    assert second.status_code == status.HTTP_400_BAD_REQUEST
    assert token_obj.failed_attempts == 2
    assert token_obj.is_used is True
    assert token_obj.matches_code("222222") is False


@pytest.mark.django_db
def test_temporary_access_confirm_sets_password_and_activation_timestamp(api_client):
    user = User.objects.create_user(
        username="temp_confirm",
        email="temp.confirm@example.com",
        password="Senha123!Temp",
        role="admin",
        is_temporary_account=True,
    )
    user.set_unusable_password()
    user.save(update_fields=["password"])

    token_obj = create_activation_token(
        user,
        raw_code="123456",
        is_used=True,
        activation_session_token="temp-session-token",
    )

    response = api_client.post(
        "/auth/temporary-access/confirm/",
        {
            "session_token": "temp-session-token",
            "new_password": "NovaSenha123!",
            "confirm_password": "NovaSenha123!",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    user.refresh_from_db()
    token_obj.refresh_from_db()
    assert user.check_password("NovaSenha123!")
    assert user.temporary_activated_at is not None
    assert token_obj.activation_session_token is None


@pytest.mark.django_db
def test_temporary_access_request_creates_account_that_cannot_login_before_activation(
    api_client,
):
    user = User.objects.create_user(
        username="temp_pending_login",
        email="temp.pending.login@example.com",
        password="Senha123!Temp",
        role="admin",
        is_temporary_account=True,
    )
    user.set_unusable_password()
    user.save(update_fields=["password"])

    response = api_client.post(
        "/auth/login/",
        {
            "email": user.email,
            "password": "Senha123!Temp",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "access" not in response.data


@pytest.mark.django_db
def test_temporary_admin_login_uses_scoped_role_claim(api_client):
    user = User.objects.create_user(
        username="temp_claims",
        email="temp.claims@example.com",
        password="Senha123!Temp",
        first_name="Temp",
        last_name="Claims",
        role="admin",
        is_temporary_account=True,
        temporary_activated_at=timezone.now(),
    )

    response = api_client.post(
        "/auth/login/",
        {
            "email": user.email,
            "password": "Senha123!Temp",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    access_token = AccessToken(response.data["access"])
    assert access_token["roles"] == ["temporary_admin"]
    assert access_token["admin_scope"] == "temporary"
    assert access_token["is_temporary_account"] is True


@pytest.mark.django_db
def test_temporary_admin_first_login_window_uses_activation_timestamp(api_client):
    activated_at = timezone.now()
    user = User.objects.create_user(
        username="temp_activation_window",
        email="temp.activation.window@example.com",
        password="Senha123!Temp",
        first_name="Temp",
        last_name="Window",
        role="admin",
        is_temporary_account=True,
        temporary_activated_at=activated_at,
    )
    User.objects.filter(id=user.id).update(
        created_at=timezone.now() - timedelta(days=2)
    )

    response = api_client.post(
        "/auth/login/",
        {
            "email": user.email,
            "password": "Senha123!Temp",
        },
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
