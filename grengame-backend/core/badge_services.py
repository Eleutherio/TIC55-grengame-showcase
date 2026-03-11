from typing import Dict, Iterable, List, Tuple

from django.db import IntegrityError
from django.db.models import Count, F, Sum
from django.db.models.functions import Coalesce, TruncDate

from .models import BadgeConfig, BadgeTierRule, Game, MissionCompletions, User, UserBadgeUnlock

CRITERION_COURSE_POINTS = "course_points"
CRITERION_PERFECT_MISSIONS = "perfect_missions"
CRITERION_ACTIVE_DAYS = "active_days"
VALUE_MODE_PERCENTAGE = "percentage"
VALUE_MODE_ABSOLUTE = "absolute"

SUPPORTED_BADGE_CRITERIA: Tuple[str, ...] = (
    CRITERION_COURSE_POINTS,
    CRITERION_PERFECT_MISSIONS,
    CRITERION_ACTIVE_DAYS,
)

BADGE_TIER_IMAGE_TEMPLATE = "/tier{tier}.png"

DEFAULT_BADGE_TIER_MATRIX: Dict[str, List[int]] = {
    CRITERION_COURSE_POINTS: [25, 45, 65, 85, 100],
    CRITERION_PERFECT_MISSIONS: [20, 40, 60, 80, 100],
    CRITERION_ACTIVE_DAYS: [2, 3, 4, 5, 7],
}


def _coerce_criterion(criterion: str) -> str:
    if criterion not in SUPPORTED_BADGE_CRITERIA:
        raise ValueError(f"Unsupported badge criterion: {criterion}")
    return criterion


def calculate_course_points_value(user: User, game: Game) -> int:
    total_points = MissionCompletions.objects.filter(
        user=user,
        mission__game=game,
        status="completed",
    ).aggregate(total=Coalesce(Sum("points_earned"), 0))["total"]
    return int(total_points or 0)


def calculate_perfect_missions_value(user: User, game: Game) -> int:
    total_perfect = MissionCompletions.objects.filter(
        user=user,
        mission__game=game,
        status="completed",
        points_earned=F("mission__points_value"),
    ).count()
    return int(total_perfect)


def calculate_active_days_value(user: User, game: Game) -> int:
    total_days = (
        MissionCompletions.objects.filter(
            user=user,
            mission__game=game,
            status="completed",
            completed_at__isnull=False,
        )
        .annotate(day=TruncDate("completed_at"))
        .values("day")
        .distinct()
        .count()
    )
    return int(total_days)


def calculate_total_course_points(game: Game) -> int:
    total_points = game.missions.filter(is_active=True).aggregate(
        total=Coalesce(Sum("points_value"), 0),
    )["total"] or 0
    return int(total_points)


def calculate_total_active_missions(game: Game) -> int:
    total_missions = game.missions.filter(is_active=True).aggregate(
        total=Count("id"),
    )["total"] or 0
    return int(total_missions)


def _calculate_percentage(current_value: int, total_value: int) -> int:
    if total_value <= 0:
        return 0
    return min(100, int((current_value * 100) / total_value))


def calculate_course_points_percentage(user: User, game: Game) -> int:
    earned_points = calculate_course_points_value(user=user, game=game)
    total_points = calculate_total_course_points(game=game)
    return _calculate_percentage(earned_points, total_points)


def calculate_perfect_missions_percentage(user: User, game: Game) -> int:
    perfect_missions = calculate_perfect_missions_value(user=user, game=game)
    total_missions = calculate_total_active_missions(game=game)
    return _calculate_percentage(perfect_missions, total_missions)


def calculate_badge_criterion_value(user: User, game: Game, criterion: str) -> int:
    normalized = _coerce_criterion(criterion)
    if normalized == CRITERION_COURSE_POINTS:
        return calculate_course_points_value(user, game)
    if normalized == CRITERION_PERFECT_MISSIONS:
        return calculate_perfect_missions_value(user, game)
    return calculate_active_days_value(user, game)


def resolve_default_tier_values_for_game(game: Game, criterion: str) -> Dict[int, int]:
    normalized = _coerce_criterion(criterion)
    matrix = DEFAULT_BADGE_TIER_MATRIX[normalized]

    return {index: value for index, value in enumerate(matrix, start=1)}


def is_percentage_based_criterion(criterion: str) -> bool:
    normalized = _coerce_criterion(criterion)
    return normalized in (CRITERION_COURSE_POINTS, CRITERION_PERFECT_MISSIONS)


def resolve_badge_config_value_mode(badge_config: BadgeConfig) -> str:
    if not is_percentage_based_criterion(badge_config.criterion):
        return VALUE_MODE_ABSOLUTE

    tier_rules = list(badge_config.tier_rules.all())
    if not tier_rules:
        return VALUE_MODE_PERCENTAGE

    top_required_value = max(int(rule.required_value) for rule in tier_rules)
    if top_required_value == 100:
        return VALUE_MODE_PERCENTAGE

    return VALUE_MODE_ABSOLUTE


def calculate_badge_config_current_value(
    user: User,
    badge_config: BadgeConfig,
    value_mode: str | None = None,
) -> int:
    mode = value_mode or resolve_badge_config_value_mode(badge_config)
    criterion = badge_config.criterion
    game = badge_config.game

    if criterion == CRITERION_COURSE_POINTS:
        if mode == VALUE_MODE_PERCENTAGE:
            return calculate_course_points_percentage(user=user, game=game)
        return calculate_course_points_value(user=user, game=game)

    if criterion == CRITERION_PERFECT_MISSIONS:
        if mode == VALUE_MODE_PERCENTAGE:
            return calculate_perfect_missions_percentage(user=user, game=game)
        return calculate_perfect_missions_value(user=user, game=game)

    return calculate_active_days_value(user=user, game=game)


def ensure_default_badge_configs_for_game(
    game: Game,
    actor: User | None = None,
    is_active: bool = True,
) -> None:
    for criterion in SUPPORTED_BADGE_CRITERIA:
        badge_config, created = BadgeConfig.objects.get_or_create(
            game=game,
            criterion=criterion,
            defaults={
                "is_active": is_active,
                "created_by": actor,
                "updated_by": actor,
            },
        )

        if not created and actor is not None:
            updates = []
            if badge_config.updated_by_id != actor.id:
                badge_config.updated_by = actor
                updates.append("updated_by")
            if updates:
                badge_config.save(update_fields=updates)

        default_tier_values = resolve_default_tier_values_for_game(game, criterion)
        for tier, required_value in default_tier_values.items():
            BadgeTierRule.objects.get_or_create(
                badge_config=badge_config,
                tier=tier,
                defaults={"required_value": required_value},
            )


def ensure_default_badge_configs_for_games(
    games: Iterable[Game],
    actor: User | None = None,
    is_active: bool = True,
) -> None:
    for game in games:
        ensure_default_badge_configs_for_game(game, actor=actor, is_active=is_active)


def badge_tier_image_path(tier: int) -> str:
    return BADGE_TIER_IMAGE_TEMPLATE.format(tier=tier)


def evaluate_user_badges(user: User, game: Game) -> List[UserBadgeUnlock]:
    """
    Avalia e concede tiers de badges para um usuario no game informado.
    A concessao e idempotente via unique(user, badge_config, tier).
    """
    created_unlocks: List[UserBadgeUnlock] = []
    badge_configs = (
        BadgeConfig.objects.filter(game=game, is_active=True)
        .prefetch_related("tier_rules")
        .order_by("criterion", "id")
    )

    existing_unlock_keys = set(
        UserBadgeUnlock.objects.filter(
            user=user,
            badge_config__game=game,
        ).values_list("badge_config_id", "tier")
    )

    for badge_config in badge_configs:
        value_mode = resolve_badge_config_value_mode(badge_config)
        current_value = calculate_badge_config_current_value(
            user=user,
            badge_config=badge_config,
            value_mode=value_mode,
        )
        tier_rules = sorted(badge_config.tier_rules.all(), key=lambda rule: rule.tier)

        for rule in tier_rules:
            if current_value < rule.required_value:
                continue

            unlock_key = (badge_config.id, rule.tier)
            if unlock_key in existing_unlock_keys:
                continue

            try:
                unlock, created = UserBadgeUnlock.objects.get_or_create(
                    user=user,
                    badge_config=badge_config,
                    tier=rule.tier,
                )
            except IntegrityError:
                # Em corrida concorrente, outro processo pode criar primeiro.
                created = False
                unlock = None

            if created and unlock is not None:
                created_unlocks.append(unlock)
                existing_unlock_keys.add(unlock_key)

    return created_unlocks
