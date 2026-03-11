import pytest
from datetime import timedelta
from django.utils import timezone

from core.badge_services import (
    CRITERION_ACTIVE_DAYS,
    CRITERION_COURSE_POINTS,
    CRITERION_PERFECT_MISSIONS,
    calculate_badge_criterion_value,
    ensure_default_badge_configs_for_game,
    resolve_default_tier_values_for_game,
)
from core.models import BadgeConfig, BadgeTierRule, Game, Mission, MissionCompletions, User


@pytest.fixture
def player_user(db):
    return User.objects.create_user(
        username="badge_player",
        email="badge_player@grendene.com.br",
        password="player123",
        role="user",
    )


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username="badge_admin",
        email="badge_admin@grendene.com.br",
        password="admin123",
        role="admin",
    )


@pytest.fixture
def game_with_missions(db):
    game = Game.objects.create(name="Game Badge", category="Categoria")
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
def test_calculate_badge_criteria_values(player_user, game_with_missions):
    game, mission_1, mission_2, _ = game_with_missions

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

    first_day = timezone.now().replace(hour=9, minute=0, second=0, microsecond=0)
    second_day = first_day + timedelta(days=1)
    MissionCompletions.objects.filter(pk=completion_1.pk).update(completed_at=first_day)
    MissionCompletions.objects.filter(pk=completion_2.pk).update(completed_at=second_day)

    assert calculate_badge_criterion_value(player_user, game, CRITERION_COURSE_POINTS) == 150
    assert calculate_badge_criterion_value(player_user, game, CRITERION_PERFECT_MISSIONS) == 1
    assert calculate_badge_criterion_value(player_user, game, CRITERION_ACTIVE_DAYS) == 2


@pytest.mark.django_db
def test_resolve_default_tier_values_for_game(game_with_missions):
    game, *_ = game_with_missions

    assert resolve_default_tier_values_for_game(game, CRITERION_COURSE_POINTS) == {
        1: 25,
        2: 45,
        3: 65,
        4: 85,
        5: 100,
    }
    assert resolve_default_tier_values_for_game(game, CRITERION_PERFECT_MISSIONS) == {
        1: 20,
        2: 40,
        3: 60,
        4: 80,
        5: 100,
    }
    assert resolve_default_tier_values_for_game(game, CRITERION_ACTIVE_DAYS) == {
        1: 2,
        2: 3,
        3: 4,
        4: 5,
        5: 7,
    }


@pytest.mark.django_db
def test_ensure_default_badge_configs_for_game_creates_configs_and_tiers(
    admin_user,
    game_with_missions,
):
    game, *_ = game_with_missions

    ensure_default_badge_configs_for_game(game=game, actor=admin_user)

    configs = BadgeConfig.objects.filter(game=game)
    assert configs.count() == 3
    assert BadgeTierRule.objects.filter(badge_config__game=game).count() == 15

    course_config = configs.get(criterion=CRITERION_COURSE_POINTS)
    assert course_config.created_by == admin_user
    assert course_config.updated_by == admin_user

    tier_5 = BadgeTierRule.objects.get(badge_config=course_config, tier=5)
    assert tier_5.required_value == 100


@pytest.mark.django_db
def test_ensure_default_badge_configs_does_not_override_existing_tier_rule(game_with_missions):
    game, *_ = game_with_missions
    config = BadgeConfig.objects.create(
        game=game,
        criterion=CRITERION_COURSE_POINTS,
        is_active=True,
    )
    BadgeTierRule.objects.create(
        badge_config=config,
        tier=1,
        required_value=999,
    )

    ensure_default_badge_configs_for_game(game=game, actor=None)

    config.refresh_from_db()
    tier_1 = BadgeTierRule.objects.get(badge_config=config, tier=1)
    assert tier_1.required_value == 999
    assert BadgeTierRule.objects.filter(badge_config=config).count() == 5
