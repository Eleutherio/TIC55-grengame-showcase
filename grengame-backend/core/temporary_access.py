import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone

from .models import BadgeConfig, Game, Mission
from .verification_codes import generate_numeric_code

User = get_user_model()

TEMP_ACCESS_LIFETIME_HOURS = 24
TEMP_MANAGED_USERS_LIMIT = 2
TEMP_GAMES_LIMIT = 1
TEMP_MISSIONS_LIMIT = 10
TEMP_BADGE_CRITERIA_LIMIT = 3
TEMP_PASSWORD_SPECIAL_CHARS = "@#$%&*!?"
TEMP_ACCESS_ACTIVATION_CODE_LENGTH = 6


def is_global_admin(user) -> bool:
    return bool(
        user
        and getattr(user, "is_authenticated", False)
        and (
            getattr(user, "is_superuser", False)
            or getattr(user, "is_staff", False)
            or (
                getattr(user, "role", None) == "admin"
                and not getattr(user, "is_temporary_account", False)
            )
        )
    )


def is_temporary_admin(user) -> bool:
    return bool(
        user
        and getattr(user, "is_authenticated", False)
        and getattr(user, "role", None) == "admin"
        and getattr(user, "is_temporary_account", False)
    )


def can_access_admin_console(user) -> bool:
    return is_global_admin(user) or is_temporary_admin(user)


def visible_games_queryset_for(user, base_queryset=None):
    queryset = base_queryset if base_queryset is not None else Game.objects.all()

    if is_temporary_admin(user):
        return queryset.filter(
            Q(created_by=user)
            | Q(created_by__isnull=True)
            | Q(created_by__is_temporary_account=False)
        )

    return queryset


def editable_games_queryset_for(user, base_queryset=None):
    queryset = base_queryset if base_queryset is not None else Game.objects.all()
    if is_temporary_admin(user):
        return queryset.filter(created_by=user)
    return queryset


def visible_missions_queryset_for(user, base_queryset=None):
    queryset = base_queryset if base_queryset is not None else Mission.objects.all()
    visible_games = visible_games_queryset_for(user).values_list("id", flat=True)

    return queryset.filter(game_id__in=visible_games)


def editable_missions_queryset_for(user, base_queryset=None):
    queryset = base_queryset if base_queryset is not None else Mission.objects.all()
    if is_temporary_admin(user):
        return queryset.filter(created_by=user)
    return queryset


def build_temporary_expiration():
    return timezone.now() + timedelta(hours=TEMP_ACCESS_LIFETIME_HOURS)


def build_temporary_activation_code_expiration():
    try:
        code_minutes = int(
            getattr(settings, "TEMPORARY_ACCESS_ACTIVATION_CODE_MINUTES", 15)
        )
    except (TypeError, ValueError):
        code_minutes = 15

    return timezone.now() + timedelta(minutes=max(code_minutes, 1))


def generate_unique_username_from_email(email: str) -> str:
    local_part = email.split("@", 1)[0]
    candidate = local_part
    suffix = 2
    while User.objects.filter(username=candidate).exists():
        candidate = f"{local_part}{suffix}"
        suffix += 1
    return candidate


def generate_temporary_password(length: int = 14) -> str:
    """Gera senha temporaria forte com classes minimas de caracteres."""
    if length < 12:
        length = 12

    lower = "abcdefghijklmnopqrstuvwxyz"
    upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    digits = "0123456789"
    special = TEMP_PASSWORD_SPECIAL_CHARS
    all_chars = f"{lower}{upper}{digits}{special}"

    # Garante ao menos um caractere de cada classe.
    password_chars = [
        secrets.choice(lower),
        secrets.choice(upper),
        secrets.choice(digits),
        secrets.choice(special),
    ]

    while len(password_chars) < length:
        password_chars.append(secrets.choice(all_chars))

    # Embaralha para evitar padrao previsivel.
    secrets.SystemRandom().shuffle(password_chars)
    return "".join(password_chars)


def generate_temporary_activation_code(
    length: int = TEMP_ACCESS_ACTIVATION_CODE_LENGTH,
) -> str:
    return generate_numeric_code(length)


def purge_expired_temporary_accounts() -> int:
    now = timezone.now()
    expired_ids = list(
        User.objects.filter(
            is_temporary_account=True,
            temporary_expires_at__isnull=False,
            temporary_expires_at__lte=now,
        ).values_list("id", flat=True)
    )
    if not expired_ids:
        return 0

    # Remove dados de gestão vinculados às contas temporárias expiradas.
    User.objects.filter(created_by_temporary_admin_id__in=expired_ids).delete()
    Mission.objects.filter(created_by_id__in=expired_ids).delete()
    BadgeConfig.objects.filter(created_by_id__in=expired_ids).delete()
    Game.objects.filter(created_by_id__in=expired_ids).delete()

    deleted_count, _ = User.objects.filter(id__in=expired_ids).delete()
    return deleted_count
