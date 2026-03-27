from __future__ import annotations

from typing import TypedDict

from .models import GamificationLevel


class LevelRule(TypedDict):
    name: str
    min_xp: int
    min_completed_games: int


def _normalize_non_negative_int(value: object) -> int:
    try:
        parsed = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        parsed = 0
    return max(0, parsed)


def _load_level_rules() -> list[LevelRule]:
    active_levels = list(
        GamificationLevel.objects.filter(is_active=True)
        .order_by("position", "min_xp", "id")
        .values("name", "min_xp", "min_completed_games")
    )
    if active_levels:
        return [
            {
                "name": str(item["name"]),
                "min_xp": _normalize_non_negative_int(item["min_xp"]),
                "min_completed_games": _normalize_non_negative_int(item["min_completed_games"]),
            }
            for item in active_levels
        ]

    fallback_levels = list(
        GamificationLevel.objects.order_by("position", "min_xp", "id").values(
            "name", "min_xp", "min_completed_games"
        )
    )
    if fallback_levels:
        return [
            {
                "name": str(item["name"]),
                "min_xp": _normalize_non_negative_int(item["min_xp"]),
                "min_completed_games": _normalize_non_negative_int(item["min_completed_games"]),
            }
            for item in fallback_levels
        ]

    # Fallback defensivo caso a tabela ainda nao tenha sido populada.
    return [{"name": "Bronze", "min_xp": 0, "min_completed_games": 0}]


def calculate_tier_progress(total_xp, games_completed=0):
    total_xp = _normalize_non_negative_int(total_xp)
    games_completed = _normalize_non_negative_int(games_completed)

    levels = _load_level_rules()
    current_index = 0

    for index, level_rule in enumerate(levels):
        if (
            total_xp >= level_rule["min_xp"]
            and games_completed >= level_rule["min_completed_games"]
        ):
            current_index = index

    current_level = levels[current_index]
    next_level = levels[current_index + 1] if current_index + 1 < len(levels) else None

    if next_level is None:
        xp_to_next = None
        games_required_for_next = None
        is_next_level_locked = False
    else:
        xp_to_next = max(0, next_level["min_xp"] - total_xp)
        games_required_for_next = next_level["min_completed_games"]
        games_missing_for_next = max(0, games_required_for_next - games_completed)
        is_next_level_locked = xp_to_next == 0 and games_missing_for_next > 0

    return {
        "level": current_level["name"],
        "xp": max(0, total_xp - current_level["min_xp"]),
        "xpToNext": xp_to_next,
        "total_xp": total_xp,
        "games_completed": games_completed,
        "games_required_for_next": games_required_for_next,
        "is_next_level_locked": is_next_level_locked,
    }


def update_game_progress(user, game):
    from django.utils import timezone
    from .models import GameProgress, MissionCompletions

    # Buscar ou criar o progresso do game
    game_progress, created = GameProgress.objects.get_or_create(
        user=user,
        game=game,
        defaults={"progress_percentage": 0, "game_points": 0},
    )

    # Contar total de missoes ativas no game
    total_missions = game.missions.filter(is_active=True).count()

    if total_missions == 0:
        # Se nao ha missoes, progresso e 0%
        game_progress.progress_percentage = 0
        game_progress.completed_at = None
        game_progress.save()
        return game_progress

    # Contar missoes completadas pelo usuario neste game
    completed_missions = MissionCompletions.objects.filter(
        user=user,
        mission__game=game,
        mission__is_active=True,
        status="completed",
    ).count()

    # Calcular porcentagem de progresso
    progress_percentage = int((completed_missions / total_missions) * 100)
    game_progress.progress_percentage = progress_percentage

    # Se atingiu 100% e ainda nao foi marcado como concluido, marcar
    if progress_percentage >= 100 and not game_progress.completed_at:
        game_progress.completed_at = timezone.now()
    # Se caiu abaixo de 100% (missao desativada, por exemplo), limpar conclusao
    elif progress_percentage < 100 and game_progress.completed_at:
        game_progress.completed_at = None

    game_progress.save()
    return game_progress
