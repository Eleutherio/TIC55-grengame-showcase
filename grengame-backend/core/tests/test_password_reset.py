from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from core.models import PasswordResetToken
from core.verification_codes import hash_session_token

User = get_user_model()


def create_reset_token(user, raw_code="123456", **kwargs):
    expires_at = kwargs.pop("expires_at", timezone.now() + timedelta(minutes=15))
    raw_session_token = kwargs.pop("reset_session_token", None)
    token_obj = PasswordResetToken(user=user, expires_at=expires_at, **kwargs)
    token_obj.set_code(raw_code)
    if raw_session_token:
        token_obj.reset_session_token = hash_session_token(raw_session_token)
    token_obj.save()
    return token_obj


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def create_user(db):
    def make_user(email="usuario@grendene.com.br", password="senha123"):
        username = email.split("@")[0]
        return User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name="Test",
            last_name="User",
        )

    return make_user


@pytest.fixture(autouse=True)
def clear_throttle_cache():
    cache.clear()


@pytest.mark.django_db
class TestPasswordResetRequest:
    def test_request_success_stores_only_hashed_code(
        self,
        api_client,
        create_user,
        monkeypatch,
    ):
        user = create_user(email="admin@grendene.com.br")
        captured = {}

        def _mock_send_password_reset_email(to_email, name, code):
            captured.update(
                {
                    "to_email": to_email,
                    "name": name,
                    "code": code,
                }
            )
            return True

        monkeypatch.setattr(
            "core.email_service.send_password_reset_email",
            _mock_send_password_reset_email,
        )

        response = api_client.post(
            "/auth/password-reset/request/",
            {
                "email": "admin@grendene.com.br",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        token_obj = PasswordResetToken.objects.get(user=user)
        assert token_obj.token != captured["code"]
        assert token_obj.matches_code(captured["code"]) is True

    def test_request_user_not_found(self, api_client):
        response = api_client.post(
            "/auth/password-reset/request/",
            {
                "email": "naoexiste@grendene.com.br",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert "Se o email estiver cadastrado" in response.data.get("message", "")

    def test_request_does_not_reveal_email_existence(self, api_client, create_user):
        create_user(email="existe@grendene.com.br")

        response_exists = api_client.post(
            "/auth/password-reset/request/",
            {"email": "existe@grendene.com.br"},
            format="json",
        )

        response_not_exists = api_client.post(
            "/auth/password-reset/request/",
            {"email": "naoexiste@grendene.com.br"},
            format="json",
        )

        assert response_exists.status_code == response_not_exists.status_code == 200
        assert response_exists.data == response_not_exists.data

    def test_request_invalidates_previous_active_tokens(self, api_client, create_user):
        user = create_user(email="usuario1@grendene.com.br")
        old_tokens = [create_reset_token(user, raw_code=f"12345{i}") for i in range(3)]

        response = api_client.post(
            "/auth/password-reset/request/",
            {"email": "usuario1@grendene.com.br"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert PasswordResetToken.objects.filter(user=user).count() == 4
        for token_obj in old_tokens:
            token_obj.refresh_from_db()
            assert token_obj.is_used is True
            assert token_obj.reset_session_token is None


@pytest.mark.django_db
class TestPasswordResetVerify:
    def test_verify_success(self, api_client, create_user):
        user = create_user(email="usuario2@grendene.com.br")
        create_reset_token(user, raw_code="654321")

        response = api_client.post(
            "/auth/password-reset/verify/",
            {
                "email": "usuario2@grendene.com.br",
                "code": "654321",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        session_token = response.data["session_token"]
        token_obj = PasswordResetToken.objects.get(user=user)
        assert token_obj.reset_session_token != session_token
        assert token_obj.reset_session_token == hash_session_token(session_token)

    def test_verify_invalid_code_increments_failed_attempts(self, api_client, create_user):
        user = create_user(email="usuario3@grendene.com.br")
        token_obj = create_reset_token(user, raw_code="111111")

        response = api_client.post(
            "/auth/password-reset/verify/",
            {
                "email": "usuario3@grendene.com.br",
                "code": "999999",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        token_obj.refresh_from_db()
        assert token_obj.failed_attempts == 1
        assert token_obj.is_used is False

    @override_settings(PASSWORD_RESET_CODE_MAX_ATTEMPTS=2)
    def test_verify_locks_challenge_after_max_attempts(self, api_client, create_user):
        user = create_user(email="usuario4@grendene.com.br")
        token_obj = create_reset_token(user, raw_code="222222")

        first = api_client.post(
            "/auth/password-reset/verify/",
            {
                "email": "usuario4@grendene.com.br",
                "code": "999999",
            },
            format="json",
        )
        second = api_client.post(
            "/auth/password-reset/verify/",
            {
                "email": "usuario4@grendene.com.br",
                "code": "888888",
            },
            format="json",
        )
        token_obj.refresh_from_db()

        assert first.status_code == status.HTTP_400_BAD_REQUEST
        assert second.status_code == status.HTTP_400_BAD_REQUEST
        assert token_obj.failed_attempts == 2
        assert token_obj.is_used is True
        assert token_obj.matches_code("222222") is False

    def test_verify_expired_token(self, api_client, create_user):
        user = create_user(email="usuario5@grendene.com.br")
        create_reset_token(
            user,
            raw_code="222222",
            expires_at=timezone.now() - timedelta(minutes=1),
        )

        response = api_client.post(
            "/auth/password-reset/verify/",
            {
                "email": "usuario5@grendene.com.br",
                "code": "222222",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_does_not_reveal_user_existence(self, api_client):
        response = api_client.post(
            "/auth/password-reset/verify/",
            {
                "email": "naoexiste@grendene.com.br",
                "code": "222222",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "inválido" in response.data["error"].lower()


@pytest.mark.django_db
class TestPasswordResetConfirm:
    def test_confirm_success(self, api_client, create_user):
        user = create_user(email="usuario6@grendene.com.br", password="senhaantiga")
        token_obj = create_reset_token(
            user,
            raw_code="123456",
            is_used=True,
            reset_session_token="test-session-token",
        )

        response = api_client.post(
            "/auth/password-reset/confirm/",
            {
                "session_token": "test-session-token",
                "new_password": "novasenha123",
                "confirm_password": "novasenha123",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        token_obj.refresh_from_db()
        assert user.check_password("novasenha123")
        assert token_obj.reset_session_token is None

    def test_confirm_weak_password(self, api_client, create_user):
        user = create_user(email="usuario7@grendene.com.br")
        create_reset_token(
            user,
            raw_code="123456",
            is_used=True,
            reset_session_token="test-session",
        )
        response = api_client.post(
            "/auth/password-reset/confirm/",
            {
                "session_token": "test-session",
                "new_password": "123",
                "confirm_password": "123",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_confirm_passwords_mismatch(self, api_client, create_user):
        user = create_user(email="usuario8@grendene.com.br")
        create_reset_token(
            user,
            raw_code="123456",
            is_used=True,
            reset_session_token="test-session",
        )
        response = api_client.post(
            "/auth/password-reset/confirm/",
            {
                "session_token": "test-session",
                "new_password": "novasenha123",
                "confirm_password": "outrasenha456",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_confirm_invalid_session(self, api_client):
        response = api_client.post(
            "/auth/password-reset/confirm/",
            {
                "session_token": "token-invalido",
                "new_password": "novasenha123",
                "confirm_password": "novasenha123",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestPasswordResetFullFlow:
    def test_complete_password_reset_flow(
        self,
        api_client,
        create_user,
        monkeypatch,
    ):
        user = create_user(email="flowtest@grendene.com.br", password="senhaantiga123")
        monkeypatch.setattr("core.views.generate_numeric_code", lambda length=6: "654321")

        response_request = api_client.post(
            "/auth/password-reset/request/",
            {"email": "flowtest@grendene.com.br"},
            format="json",
        )
        assert response_request.status_code == status.HTTP_200_OK

        token_obj = PasswordResetToken.objects.filter(user=user, is_used=False).first()
        assert token_obj is not None
        assert token_obj.token != "654321"
        assert token_obj.matches_code("654321") is True

        response_verify = api_client.post(
            "/auth/password-reset/verify/",
            {
                "email": "flowtest@grendene.com.br",
                "code": "654321",
            },
            format="json",
        )
        assert response_verify.status_code == status.HTTP_200_OK
        session_token = response_verify.data.get("session_token")
        assert session_token is not None

        response_confirm = api_client.post(
            "/auth/password-reset/confirm/",
            {
                "session_token": session_token,
                "new_password": "novasenha123",
                "confirm_password": "novasenha123",
            },
            format="json",
        )
        assert response_confirm.status_code == status.HTTP_200_OK

        user.refresh_from_db()
        assert user.check_password("novasenha123")
        assert not user.check_password("senhaantiga123")

    def test_cannot_reuse_session_token(
        self,
        api_client,
        create_user,
        monkeypatch,
    ):
        user = create_user(email="reuse@grendene.com.br", password="senha123")
        monkeypatch.setattr("core.views.generate_numeric_code", lambda length=6: "321654")

        api_client.post(
            "/auth/password-reset/request/",
            {"email": "reuse@grendene.com.br"},
            format="json",
        )

        response_verify = api_client.post(
            "/auth/password-reset/verify/",
            {
                "email": "reuse@grendene.com.br",
                "code": "321654",
            },
            format="json",
        )
        session_token = response_verify.data.get("session_token")

        response_first = api_client.post(
            "/auth/password-reset/confirm/",
            {
                "session_token": session_token,
                "new_password": "primeirasenha123",
                "confirm_password": "primeirasenha123",
            },
            format="json",
        )
        assert response_first.status_code == status.HTTP_200_OK

        response_second = api_client.post(
            "/auth/password-reset/confirm/",
            {
                "session_token": session_token,
                "new_password": "segundasenha123",
                "confirm_password": "segundasenha123",
            },
            format="json",
        )
        assert response_second.status_code == status.HTTP_400_BAD_REQUEST
