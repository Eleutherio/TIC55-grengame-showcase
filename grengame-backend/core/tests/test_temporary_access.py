import pytest
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.mark.django_db
def test_temporary_access_request_success(api_client, monkeypatch):
    captured = {}

    def _mock_send_temporary_access_email(**kwargs):
        captured.update(kwargs)
        return True

    monkeypatch.setattr(
        "core.email_service.send_temporary_access_email",
        _mock_send_temporary_access_email,
    )

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
    temp_user = User.objects.get(is_temporary_account=True)
    assert temp_user.role == "admin"
    assert temp_user.email == "maria.silva@gmail.com"
    assert "password" in captured
    assert len(captured["password"]) >= 12
    assert temp_user.check_password(captured["password"])
    assert temp_user.temporary_expires_at is not None


@pytest.mark.django_db
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


@pytest.mark.django_db
def test_temporary_access_request_rolls_back_when_email_fails(api_client, monkeypatch):
    monkeypatch.setattr("core.email_service.send_temporary_access_email", lambda **kwargs: False)

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

    assert response.status_code == status.HTTP_502_BAD_GATEWAY
    assert User.objects.filter(is_temporary_account=True).count() == 0
