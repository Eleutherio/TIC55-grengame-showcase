import pytest
from rest_framework.test import APIClient

from core.models import User, Game, Mission, MissionCompletions


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def player_a(db):
    return User.objects.create_user(
        username="player_a",
        email="player_a@example.com",
        password="test123",
        role="user",
    )


@pytest.fixture
def player_b(db):
    return User.objects.create_user(
        username="player_b",
        email="player_b@example.com",
        password="test123",
        role="user",
    )


@pytest.mark.django_db
def test_global_leaderboard_orders_by_points(api_client, player_a, player_b):
    game = Game.objects.create(name="Game Global")
    mission = Mission.objects.create(game=game, title="M1", description="d1", points_value=100)

    MissionCompletions.objects.create(user=player_a, mission=mission, points_earned=120, status="completed")
    MissionCompletions.objects.create(user=player_b, mission=mission, points_earned=60, status="completed")

    api_client.force_authenticate(user=player_a)
    response = api_client.get("/auth/ranking/?limit=5")

    assert response.status_code == 200
    assert response.data[0]["user_id"] == player_a.id
    assert response.data[0]["position"] == 1
    assert response.data[1]["user_id"] == player_b.id
    assert response.data[1]["position"] == 2

@pytest.mark.django_db
def test_course_leaderboard_filters_by_game(api_client, player_a, player_b):
    game_one = Game.objects.create(name="Game One")
    game_two = Game.objects.create(name="Game Two")

    mission_one = Mission.objects.create(game=game_one, title="M1", description="d1", points_value=50)
    mission_two = Mission.objects.create(game=game_two, title="M2", description="d2", points_value=70)

    # Player A has more points on game_two
    MissionCompletions.objects.create(user=player_a, mission=mission_two, points_earned=70, status="completed")
    MissionCompletions.objects.create(user=player_b, mission=mission_two, points_earned=40, status="completed")
    # Extra completion on another game should not appear
    MissionCompletions.objects.create(user=player_b, mission=mission_one, points_earned=200, status="completed")

    api_client.force_authenticate(user=player_a)
    response = api_client.get(f"/auth/games/{game_two.id}/ranking/?limit=10")

    assert response.status_code == 200
    assert all(entry["game_id"] == game_two.id for entry in response.data)
    assert response.data[0]["user_id"] == player_a.id  # has highest points in game_two
    assert response.data[1]["user_id"] == player_b.id
