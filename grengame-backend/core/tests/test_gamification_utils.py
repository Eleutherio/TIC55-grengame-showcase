import pytest
from rest_framework.test import APIClient

from core.gamification_utils import calculate_tier_progress
from core.models import Game, Mission, MissionCompletions, User


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


@pytest.mark.parametrize(
    ("total_xp", "expected"),
    [
        (0, {"level": "Bronze", "xp": 0, "xpToNext": 500, "total_xp": 0}),
        (250, {"level": "Bronze", "xp": 250, "xpToNext": 250, "total_xp": 250}),
        (500, {"level": "Prata", "xp": 0, "xpToNext": 1000, "total_xp": 500}),
        (1000, {"level": "Prata", "xp": 500, "xpToNext": 500, "total_xp": 1000}),
        (1500, {"level": "Ouro", "xp": 0, "xpToNext": None, "total_xp": 1500}),
        (1700, {"level": "Ouro", "xp": 200, "xpToNext": None, "total_xp": 1700}),
    ],
)
def test_calculate_tier_progress(total_xp, expected):
    assert calculate_tier_progress(total_xp) == expected


@pytest.mark.django_db
def test_user_stats_view_sums_completed_missions(api_client, player_user):
    api_client.force_authenticate(user=player_user)
    game = Game.objects.create(name="Game XP")
    mission_a = Mission.objects.create(
        game=game,
        title="Missao A",
        description="Descricao A",
        order=1,
        points_value=200,
    )
    mission_b = Mission.objects.create(
        game=game,
        title="Missao B",
        description="Descricao B",
        order=2,
        points_value=350,
    )

    MissionCompletions.objects.create(
        user=player_user,
        mission=mission_a,
        status="completed",
        points_earned=200,
    )
    MissionCompletions.objects.create(
        user=player_user,
        mission=mission_b,
        status="completed",
        points_earned=350,
    )

    response = api_client.get("/auth/me/stats/")
    assert response.status_code == 200
    assert response.data["level"] == "Prata"
    assert response.data["xp"] == 50
    assert response.data["xpToNext"] == 950
    assert response.data["total_xp"] == 550
