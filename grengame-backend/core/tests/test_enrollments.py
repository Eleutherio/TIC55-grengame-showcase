import pytest
from rest_framework.test import APIClient

from core.models import Game, GameProgress, User


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="user",
        email="user@grendene.com.br",
        password="user123",
        role="user",
    )


@pytest.fixture
def other_user(db):
    return User.objects.create_user(
        username="other",
        email="other@grendene.com.br",
        password="other123",
        role="user",
    )


@pytest.fixture
def game(db):
    return Game.objects.create(name="Game Teste", description="Desc", category="Tech")


@pytest.fixture
def api_client():
    return APIClient()


@pytest.mark.django_db
def test_create_progress_enrollment(api_client, user, game):
    api_client.force_authenticate(user=user)

    response = api_client.post(
        "/auth/progress/",
        {"game": game.id, "progress_percentage": 0},
        format="json",
    )

    assert response.status_code == 201
    assert response.data["game"] == game.id
    assert response.data["game_name"] == "Game Teste"


@pytest.mark.django_db
def test_create_duplicate_progress_returns_existing(api_client, user, game):
    api_client.force_authenticate(user=user)

    first = api_client.post("/auth/progress/", {"game": game.id}, format="json")
    assert first.status_code == 201

    second = api_client.post(
        "/auth/progress/",
        {"game": game.id, "progress_percentage": 50},
        format="json",
    )

    assert second.status_code == 200
    assert "progress" in second.data
    assert second.data["progress"]["game"] == game.id


@pytest.mark.django_db
def test_delete_progress(api_client, user, game):
    api_client.force_authenticate(user=user)
    progress = GameProgress.objects.create(user=user, game=game, progress_percentage=10)

    response = api_client.delete(f"/auth/progress/{progress.id}/")
    assert response.status_code == 204
    assert not GameProgress.objects.filter(id=progress.id).exists()


@pytest.mark.django_db
def test_user_cannot_delete_other_user_progress(api_client, user, other_user, game):
    api_client.force_authenticate(user=user)
    progress = GameProgress.objects.create(
        user=other_user,
        game=game,
        progress_percentage=10,
    )

    response = api_client.delete(f"/auth/progress/{progress.id}/")
    assert response.status_code == 404


@pytest.mark.django_db
def test_unauthenticated_cannot_create_progress(api_client, game):
    response = api_client.post(
        "/auth/progress/",
        {"game": game.id, "progress_percentage": 0},
        format="json",
    )
    assert response.status_code == 401
