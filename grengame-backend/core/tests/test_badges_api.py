from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from core.badge_services import ensure_default_badge_configs_for_game, evaluate_user_badges
from core.models import BadgeConfig, BadgeTierRule, Game, Mission, MissionCompletions, User, UserBadgeUnlock


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username="badge_admin_api",
        email="badge_admin_api@grendene.com.br",
        password="admin123",
        role="admin",
    )


@pytest.fixture
def player_user(db):
    return User.objects.create_user(
        username="badge_player_api",
        email="badge_player_api@grendene.com.br",
        password="player123",
        role="user",
    )


@pytest.fixture
def game_with_missions(db):
    game = Game.objects.create(name="Game Badge API", category="Categoria")
    mission_1 = Mission.objects.create(
        game=game,
        title="Missao 1",
        description="Desc",
        order=1,
        points_value=100,
        is_active=True,
    )
    mission_2 = Mission.objects.create(
        game=game,
        title="Missao 2",
        description="Desc",
        order=2,
        points_value=100,
        is_active=True,
    )
    mission_3 = Mission.objects.create(
        game=game,
        title="Missao 3",
        description="Desc",
        order=3,
        points_value=50,
        is_active=True,
    )
    return game, mission_1, mission_2, mission_3


@pytest.mark.django_db
def test_game_create_seeds_default_badges_as_draft(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    response = api_client.post(
        "/auth/games/",
        {
            "name": "Game Draft Auto Badge",
            "description": "Desc",
            "category": "Categoria",
        },
        format="json",
    )

    assert response.status_code == 201
    game_id = response.data["id"]
    configs = BadgeConfig.objects.filter(game_id=game_id).order_by("criterion")
    assert configs.count() == 3
    assert all(config.is_active is False for config in configs)
    assert BadgeTierRule.objects.filter(badge_config__game_id=game_id).count() == 15


@pytest.mark.django_db
def test_badge_config_get_does_not_autocreate(api_client, admin_user):
    game = Game.objects.create(name="Game Sem Auto Badge", category="Categoria")
    api_client.force_authenticate(user=admin_user)

    assert BadgeConfig.objects.filter(game=game).count() == 0

    response = api_client.get(f"/auth/games/{game.id}/badge-config/")
    assert response.status_code == 200
    assert response.data == []
    assert BadgeConfig.objects.filter(game=game).count() == 0


@pytest.mark.django_db
def test_badge_config_upsert_and_delete(api_client, admin_user, game_with_missions):
    game, *_ = game_with_missions
    api_client.force_authenticate(user=admin_user)

    response = api_client.put(
        f"/auth/games/{game.id}/badge-config/",
        {
            "criterion": "course_points",
            "tiers": [
                {"tier": 1, "required_value": 20},
                {"tier": 2, "required_value": 40},
                {"tier": 3, "required_value": 60},
                {"tier": 4, "required_value": 80},
                {"tier": 5, "required_value": 100},
            ],
        },
        format="json",
    )

    assert response.status_code == 200
    config = BadgeConfig.objects.get(game=game, criterion="course_points")
    assert BadgeTierRule.objects.filter(badge_config=config).count() == 5
    assert BadgeTierRule.objects.get(badge_config=config, tier=5).required_value == 100
    assert BadgeConfig.objects.filter(game=game, criterion="course_points").count() == 1

    update_response = api_client.put(
        f"/auth/games/{game.id}/badge-config/",
        {
            "criterion": "course_points",
            "tiers": [
                {"tier": 1, "required_value": 0},
                {"tier": 2, "required_value": 25},
                {"tier": 3, "required_value": 50},
                {"tier": 4, "required_value": 75},
                {"tier": 5, "required_value": 100},
            ],
        },
        format="json",
    )

    assert update_response.status_code == 200
    assert BadgeConfig.objects.filter(game=game, criterion="course_points").count() == 1
    assert BadgeTierRule.objects.get(badge_config=config, tier=1).required_value == 0

    delete_response = api_client.delete(
        f"/auth/games/{game.id}/badge-config/?criterion=course_points"
    )
    assert delete_response.status_code == 204
    assert not BadgeConfig.objects.filter(game=game, criterion="course_points").exists()


@pytest.mark.django_db
def test_badge_config_upsert_validates_tiers(api_client, admin_user, game_with_missions):
    game, *_ = game_with_missions
    api_client.force_authenticate(user=admin_user)

    response = api_client.put(
        f"/auth/games/{game.id}/badge-config/",
        {
            "criterion": "course_points",
            "tiers": [
                {"tier": 1, "required_value": 20},
                {"tier": 2, "required_value": 10},
                {"tier": 3, "required_value": 30},
                {"tier": 4, "required_value": 40},
                {"tier": 5, "required_value": 50},
            ],
        },
        format="json",
    )

    assert response.status_code == 400
    assert "tiers" in response.data


@pytest.mark.django_db
def test_badge_config_upsert_rejects_percentage_above_hundred(
    api_client,
    admin_user,
    game_with_missions,
):
    game, *_ = game_with_missions
    api_client.force_authenticate(user=admin_user)

    response = api_client.put(
        f"/auth/games/{game.id}/badge-config/",
        {
            "criterion": "course_points",
            "tiers": [
                {"tier": 1, "required_value": 0},
                {"tier": 2, "required_value": 20},
                {"tier": 3, "required_value": 40},
                {"tier": 4, "required_value": 60},
                {"tier": 5, "required_value": 101},
            ],
        },
        format="json",
    )

    assert response.status_code == 400
    assert "tiers" in response.data


@pytest.mark.django_db
def test_gamification_badges_returns_expected_criteria_values(
    api_client,
    admin_user,
    player_user,
    game_with_missions,
):
    game, mission_1, mission_2, _ = game_with_missions
    ensure_default_badge_configs_for_game(game=game, actor=admin_user)

    first_day = timezone.now().replace(hour=9, minute=0, second=0, microsecond=0)
    second_day = first_day + timedelta(days=1)

    completion_1 = MissionCompletions.objects.create(
        user=player_user,
        mission=mission_1,
        status="completed",
        points_earned=100,
    )
    completion_2 = MissionCompletions.objects.create(
        user=player_user,
        mission=mission_2,
        status="completed",
        points_earned=50,
    )
    MissionCompletions.objects.filter(pk=completion_1.pk).update(completed_at=first_day)
    MissionCompletions.objects.filter(pk=completion_2.pk).update(completed_at=second_day)

    api_client.force_authenticate(user=player_user)
    response = api_client.get(f"/gamification/badges/?game_id={game.id}")

    assert response.status_code == 200
    assert "unlocked" in response.data
    assert "progress" in response.data

    progress_by_criterion = {
        item["criterion"]: item for item in response.data["progress"]
    }
    assert progress_by_criterion["course_points"]["current_value"] == 60
    assert progress_by_criterion["perfect_missions"]["current_value"] == 33
    assert progress_by_criterion["active_days"]["current_value"] == 2


@pytest.mark.django_db
def test_mission_completion_triggers_badges_and_is_idempotent(
    api_client,
    admin_user,
    player_user,
):
    game = Game.objects.create(name="Game Trigger Badge")
    mission = Mission.objects.create(
        game=game,
        title="Missao Trigger",
        description="Desc",
        order=1,
        points_value=100,
        is_active=True,
    )
    ensure_default_badge_configs_for_game(game=game, actor=admin_user)

    MissionCompletions.objects.create(
        user=player_user,
        mission=mission,
        status="in_progress",
        points_earned=0,
    )

    api_client.force_authenticate(user=player_user)
    complete_response = api_client.patch(f"/auth/missoes/{mission.id}/completar/")
    assert complete_response.status_code == 200

    first_unlock_count = UserBadgeUnlock.objects.filter(
        user=player_user,
        badge_config__game=game,
    ).count()
    assert first_unlock_count > 0

    second_complete_response = api_client.patch(f"/auth/missoes/{mission.id}/completar/")
    assert second_complete_response.status_code == 400

    second_unlock_count = UserBadgeUnlock.objects.filter(
        user=player_user,
        badge_config__game=game,
    ).count()
    assert second_unlock_count == first_unlock_count


@pytest.mark.django_db
def test_ranking_includes_user_badges_limited_to_five(
    api_client,
    admin_user,
    player_user,
):
    another_user = User.objects.create_user(
        username="badge_player_other",
        email="badge_player_other@grendene.com.br",
        password="player123",
        role="user",
    )
    game = Game.objects.create(name="Game Ranking Badge")
    mission = Mission.objects.create(
        game=game,
        title="Missao Ranking",
        description="Desc",
        order=1,
        points_value=200,
        is_active=True,
    )

    MissionCompletions.objects.create(
        user=player_user,
        mission=mission,
        status="completed",
        points_earned=200,
    )
    MissionCompletions.objects.create(
        user=another_user,
        mission=mission,
        status="completed",
        points_earned=100,
    )

    ensure_default_badge_configs_for_game(game=game, actor=admin_user)
    configs = list(BadgeConfig.objects.filter(game=game).order_by("criterion"))

    for tier in (1, 2, 3, 4, 5):
        UserBadgeUnlock.objects.create(
            user=player_user,
            badge_config=configs[0],
            tier=tier,
        )
    UserBadgeUnlock.objects.create(
        user=player_user,
        badge_config=configs[1],
        tier=1,
    )

    api_client.force_authenticate(user=player_user)
    response = api_client.get("/auth/ranking/?limit=5")

    assert response.status_code == 200
    player_entry = next(item for item in response.data if item["user_id"] == player_user.id)
    assert "badges" in player_entry
    assert len(player_entry["badges"]) == 5
    assert all("image_url" in badge for badge in player_entry["badges"])
    assert player_entry.get("tier")
    assert all("criterion_label" in badge for badge in player_entry["badges"])
    assert all("value_mode" in badge for badge in player_entry["badges"])
    assert all("required_value" in badge for badge in player_entry["badges"])


@pytest.mark.django_db
def test_course_ranking_includes_only_badges_from_same_game(
    api_client,
    admin_user,
    player_user,
):
    game_one = Game.objects.create(name="Game Ranking A")
    game_two = Game.objects.create(name="Game Ranking B")
    mission_one = Mission.objects.create(
        game=game_one,
        title="Missao A",
        description="Desc",
        order=1,
        points_value=100,
        is_active=True,
    )
    mission_two = Mission.objects.create(
        game=game_two,
        title="Missao B",
        description="Desc",
        order=1,
        points_value=100,
        is_active=True,
    )

    MissionCompletions.objects.create(
        user=player_user,
        mission=mission_one,
        status="completed",
        points_earned=100,
    )
    MissionCompletions.objects.create(
        user=player_user,
        mission=mission_two,
        status="completed",
        points_earned=100,
    )

    ensure_default_badge_configs_for_game(game=game_one, actor=admin_user)
    ensure_default_badge_configs_for_game(game=game_two, actor=admin_user)

    config_game_one = BadgeConfig.objects.filter(game=game_one).order_by("criterion").first()
    config_game_two = BadgeConfig.objects.filter(game=game_two).order_by("criterion").first()
    assert config_game_one is not None
    assert config_game_two is not None

    UserBadgeUnlock.objects.create(
        user=player_user,
        badge_config=config_game_one,
        tier=2,
    )
    UserBadgeUnlock.objects.create(
        user=player_user,
        badge_config=config_game_two,
        tier=5,
    )

    api_client.force_authenticate(user=player_user)
    response = api_client.get(f"/auth/games/{game_one.id}/ranking/?limit=5")

    assert response.status_code == 200
    player_entry = next(item for item in response.data if item["user_id"] == player_user.id)
    assert "badges" in player_entry
    assert len(player_entry["badges"]) >= 1
    assert all(badge["game_id"] == game_one.id for badge in player_entry["badges"])
    assert player_entry.get("tier")


@pytest.mark.django_db
def test_gamification_badges_available_returns_game_scoped_badges(
    api_client,
    admin_user,
    player_user,
    game_with_missions,
):
    game, *_ = game_with_missions
    ensure_default_badge_configs_for_game(game=game, actor=admin_user)
    evaluate_user_badges(user=player_user, game=game)

    api_client.force_authenticate(user=player_user)
    response = api_client.get(f"/gamification/badges/available/?game_id={game.id}")

    assert response.status_code == 200
    assert response.data["game_id"] == game.id
    assert response.data["game_name"] == game.name
    assert len(response.data["badges"]) == 3
    assert all(len(item["tiers"]) == 5 for item in response.data["badges"])
