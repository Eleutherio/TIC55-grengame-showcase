import pytest
from rest_framework.test import APIClient

from core.gamification_utils import calculate_tier_progress
from core.models import Game, GameProgress, GamificationLevel, Mission, MissionCompletions, User


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


@pytest.fixture(autouse=True)
def configured_levels(db):
    GamificationLevel.objects.all().delete()
    GamificationLevel.objects.bulk_create(
        [
            GamificationLevel(
                name="Bronze",
                position=1,
                min_xp=0,
                min_completed_games=0,
                is_active=True,
            ),
            GamificationLevel(
                name="Prata",
                position=2,
                min_xp=800,
                min_completed_games=3,
                is_active=True,
            ),
            GamificationLevel(
                name="Ouro",
                position=3,
                min_xp=2500,
                min_completed_games=5,
                is_active=True,
            ),
            GamificationLevel(
                name="Platina",
                position=4,
                min_xp=5500,
                min_completed_games=8,
                is_active=True,
            ),
            GamificationLevel(
                name="Diamante",
                position=5,
                min_xp=10000,
                min_completed_games=16,
                is_active=True,
            ),
        ]
    )


@pytest.mark.parametrize(
    ("total_xp", "games_completed", "expected"),
    [
        (
            0,
            0,
            {
                "level": "Bronze",
                "xp": 0,
                "xpToNext": 800,
                "total_xp": 0,
                "games_completed": 0,
                "games_required_for_next": 3,
                "is_next_level_locked": False,
            },
        ),
        (
            800,
            0,
            {
                "level": "Bronze",
                "xp": 800,
                "xpToNext": 0,
                "total_xp": 800,
                "games_completed": 0,
                "games_required_for_next": 3,
                "is_next_level_locked": True,
            },
        ),
        (
            800,
            3,
            {
                "level": "Prata",
                "xp": 0,
                "xpToNext": 1700,
                "total_xp": 800,
                "games_completed": 3,
                "games_required_for_next": 5,
                "is_next_level_locked": False,
            },
        ),
        (
            2500,
            3,
            {
                "level": "Prata",
                "xp": 1700,
                "xpToNext": 0,
                "total_xp": 2500,
                "games_completed": 3,
                "games_required_for_next": 5,
                "is_next_level_locked": True,
            },
        ),
        (
            2500,
            5,
            {
                "level": "Ouro",
                "xp": 0,
                "xpToNext": 3000,
                "total_xp": 2500,
                "games_completed": 5,
                "games_required_for_next": 8,
                "is_next_level_locked": False,
            },
        ),
        (
            10000,
            16,
            {
                "level": "Diamante",
                "xp": 0,
                "xpToNext": None,
                "total_xp": 10000,
                "games_completed": 16,
                "games_required_for_next": None,
                "is_next_level_locked": False,
            },
        ),
    ],
)
def test_calculate_tier_progress(total_xp, games_completed, expected):
    assert calculate_tier_progress(total_xp, games_completed) == expected


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
    assert response.data["level"] == "Bronze"
    assert response.data["xp"] == 550
    assert response.data["xpToNext"] == 250
    assert response.data["total_xp"] == 550
    assert response.data["games_completed"] == 0
    assert response.data["games_required_for_next"] == 3
    assert response.data["is_next_level_locked"] is False


@pytest.mark.django_db
def test_user_stats_view_locks_next_level_when_missing_completed_games(
    api_client,
    player_user,
):
    api_client.force_authenticate(user=player_user)

    target_game = Game.objects.create(name="Game Alvo")
    mission = Mission.objects.create(
        game=target_game,
        title="Missao",
        description="Descricao",
        order=1,
        points_value=900,
    )
    MissionCompletions.objects.create(
        user=player_user,
        mission=mission,
        status="completed",
        points_earned=900,
    )

    GameProgress.objects.create(
        user=player_user,
        game=target_game,
        progress_percentage=80,
    )

    response = api_client.get("/auth/me/stats/")
    assert response.status_code == 200
    assert response.data["level"] == "Bronze"
    assert response.data["xp"] == 900
    assert response.data["xpToNext"] == 0
    assert response.data["games_completed"] == 0
    assert response.data["games_required_for_next"] == 3
    assert response.data["is_next_level_locked"] is True
