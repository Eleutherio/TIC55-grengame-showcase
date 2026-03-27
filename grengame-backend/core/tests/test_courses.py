import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from core.models import Game, User


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username="admin",
        email="admin@grendene.com.br",
        password="admin123",
        role="admin",
    )


@pytest.fixture
def player_user(db):
    return User.objects.create_user(
        username="player",
        email="player@grendene.com.br",
        password="player123",
        role="user",
    )


@pytest.fixture
def api_client():
    return APIClient()


@pytest.mark.django_db
def test_admin_can_create_game(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    url = reverse("core:course-list-create")

    response = api_client.post(
        url,
        {
            "name": "Game Teste",
            "description": "Descricao",
            "category": "Treinamento",
        },
        format="json",
    )

    assert response.status_code == 201
    assert Game.objects.filter(name="Game Teste").exists()


@pytest.mark.django_db
def test_player_cannot_create_game(api_client, player_user):
    api_client.force_authenticate(user=player_user)
    url = reverse("core:course-list-create")

    response = api_client.post(
        url,
        {"name": "Game Player", "description": "Descricao"},
        format="json",
    )

    assert response.status_code == 403
    assert not Game.objects.filter(name="Game Player").exists()


@pytest.mark.django_db
def test_any_authenticated_user_can_list_games(api_client, admin_user, player_user):
    Game.objects.create(name="Game 1", description="Desc", category="Categoria")
    url = reverse("core:course-list-create")

    api_client.force_authenticate(user=admin_user)
    response_admin = api_client.get(url)
    assert response_admin.status_code == 200
    assert len(response_admin.data) == 1

    api_client.force_authenticate(user=player_user)
    response_player = api_client.get(url)
    assert response_player.status_code == 200
    assert len(response_player.data) == 1


@pytest.mark.django_db
def test_admin_can_edit_and_delete_game(api_client, admin_user):
    game = Game.objects.create(name="Game Edit", description="Desc")
    api_client.force_authenticate(user=admin_user)
    url = reverse("core:course-detail", args=[game.id])

    patch_response = api_client.patch(url, {"name": "Novo Nome"}, format="json")
    assert patch_response.status_code == 200
    assert Game.objects.get(id=game.id).name == "Novo Nome"

    delete_response = api_client.delete(url)
    assert delete_response.status_code == 204
    assert not Game.objects.filter(id=game.id).exists()


@pytest.mark.django_db
def test_player_cannot_edit_or_delete_game(api_client, player_user):
    game = Game.objects.create(name="Game Player Edit", description="Desc")
    api_client.force_authenticate(user=player_user)
    url = reverse("core:course-detail", args=[game.id])

    patch_response = api_client.patch(url, {"name": "Novo Nome"}, format="json")
    assert patch_response.status_code == 403

    delete_response = api_client.delete(url)
    assert delete_response.status_code == 403


@pytest.mark.django_db
def test_list_categories_returns_existing_values(api_client, player_user):
    Game.objects.create(name="Game 1", category="lgpd")
    Game.objects.create(name="Game 2", category="seguranca")
    api_client.force_authenticate(user=player_user)

    url = reverse("core:course-categories")
    response = api_client.get(url)

    assert response.status_code == 200
    assert "lgpd" in response.data
    assert "seguranca" in response.data
