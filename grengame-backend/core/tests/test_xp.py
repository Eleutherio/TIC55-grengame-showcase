import pytest
from rest_framework.test import APIClient

from core.models import (
    Game,
    Mission,
    MissionCompletions,
    User,
    WordleHintUsage,
)


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def player_user(db):
    return User.objects.create_user(
        username="player",
        email="player@grendene.com.br",
        password="player123",
        role="user",
    )


@pytest.fixture
def authenticated_client(api_client, player_user):
    api_client.force_authenticate(user=player_user)
    return api_client


def _create_completed_mission_for_user(user, points_earned=100):
    game = Game.objects.create(name="Game XP")
    mission = Mission.objects.create(
        game=game,
        title="Missao XP",
        description="Desc",
        mission_type="reading",
        icon="book",
        order=1,
        points_value=points_earned,
        content_data={"text": "conteudo"},
        is_active=True,
    )
    MissionCompletions.objects.create(
        user=user,
        mission=mission,
        status="completed",
        points_earned=points_earned,
    )
    return mission


@pytest.mark.django_db
def test_user_stats_total_xp_subtracts_wordle_hint_cost(authenticated_client, player_user):
    mission = _create_completed_mission_for_user(player_user, points_earned=120)
    WordleHintUsage.objects.create(
        user=player_user,
        mission=mission,
        hint_index=0,
        revealed_hint="dica",
        points_spent=10,
        is_free=False,
    )

    response = authenticated_client.get("/auth/me/stats/")
    assert response.status_code == 200
    assert response.data["total_xp"] == 110


@pytest.mark.django_db
def test_user_stats_total_xp_never_negative(authenticated_client, player_user):
    mission = _create_completed_mission_for_user(player_user, points_earned=5)
    WordleHintUsage.objects.create(
        user=player_user,
        mission=mission,
        hint_index=0,
        revealed_hint="dica",
        points_spent=50,
        is_free=False,
    )

    response = authenticated_client.get("/auth/me/stats/")
    assert response.status_code == 200
    assert response.data["total_xp"] == 0


@pytest.mark.django_db
def test_user_stats_unauthenticated_returns_401(api_client):
    response = api_client.get("/auth/me/stats/")
    assert response.status_code == 401
