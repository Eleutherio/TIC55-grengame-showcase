import logging
from math import ceil
from uuid import uuid4
from django.contrib.auth import get_user_model
from django.contrib.auth.models import update_last_login
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.storage import default_storage
from django.core.validators import validate_email
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated, BasePermission
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.views import TokenRefreshView

from .serializers import (
    BadgeConfigSerializer,
    BadgeConfigUpsertSerializer,
    LoginSerializer,
    LogoutSerializer,
    UserUpdateSerializer,
    GameSerializer,
    GameListItemSerializer,
    GameProgressSerializer,
    MissionSerializer,
    MissionCompletionsSerializer,
    LeaderboardEntrySerializer,
    PlayerHistorySerializer,
    UserBadgeUnlockSerializer,
)
from .gamification_utils import calculate_tier_progress, update_game_progress
from .badge_services import (
    SUPPORTED_BADGE_CRITERIA,
    calculate_badge_config_current_value,
    ensure_default_badge_configs_for_game,
    evaluate_user_badges,
    resolve_badge_config_value_mode,
)
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView
from .models import (
    BadgeConfig,
    BadgeTierRule,
    Game,
    GameProgress,
    LeaderboardEntry,
    Mission,
    MissionCompletions,
    WordleHintUsage,
    UserBadgeUnlock,
)
from .tokens import CustomRefreshToken
from .temporary_access import (
    TEMP_BADGE_CRITERIA_LIMIT,
    TEMP_GAMES_LIMIT,
    TEMP_MISSIONS_LIMIT,
    build_temporary_expiration,
    editable_games_queryset_for,
    editable_missions_queryset_for,
    generate_temporary_password,
    generate_unique_username_from_email,
    is_temporary_admin,
    purge_expired_temporary_accounts,
    visible_games_queryset_for,
    visible_missions_queryset_for,
)
from django.utils import timezone
from django.db.models import Sum, Count, Min, Q
from django.db.models.functions import Coalesce
from django.db import transaction

logger = logging.getLogger(__name__)
User = get_user_model()

MAX_AVATAR_SIZE = 2 * 1024 * 1024
ALLOWED_AVATAR_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

BADGE_CRITERION_LABELS = {
    "course_points": "Conquistador do Curso",
    "perfect_missions": "Perfeccionista",
    "active_days": "Ritmo Constante",
}
WORDLE_HINT_COST_POINTS = 10


def _resolve_uploaded_file_url(request, raw_value):
    if raw_value is None:
        return None

    value = str(raw_value).strip()
    if not value:
        return None

    if value.startswith(("http://", "https://")):
        return value

    normalized = value.lstrip("/")
    if normalized.startswith("media/"):
        normalized = normalized[len("media/"):]

    for candidate in (normalized, value.lstrip("/")):
        if not candidate:
            continue
        try:
            resolved_url = default_storage.url(candidate)
        except Exception:
            continue

        if not resolved_url:
            continue
        if resolved_url.startswith(("http://", "https://")):
            return resolved_url
        if request is not None:
            return request.build_absolute_uri(resolved_url)
        return resolved_url

    fallback_relative = f"/media/{normalized}" if normalized else "/media/"
    if request is not None:
        return request.build_absolute_uri(fallback_relative)
    return fallback_relative


def _calculate_user_total_xp(user) -> int:
    earned = (
        MissionCompletions.objects.filter(user=user, status="completed")
        .aggregate(total=Coalesce(Sum("points_earned"), 0))
        .get("total", 0)
    )
    spent = (
        WordleHintUsage.objects.filter(user=user)
        .aggregate(total=Coalesce(Sum("points_spent"), 0))
        .get("total", 0)
    )
    return max(0, int(earned or 0) - int(spent or 0))


def _is_temporary_admin_request(request) -> bool:
    return is_temporary_admin(getattr(request, "user", None))

class LoginView(APIView):
    permission_classes = [AllowAny]  # Qualquer um pode tentar fazer login
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"
    serializer_class = LoginSerializer

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={'request': request})

        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data['user']

        # Mantem last_login atualizado para auditoria e controle de primeiro acesso.
        update_last_login(None, user)

        refresh = CustomRefreshToken.for_user(user)
        access = refresh.access_token

        return Response({
            'access': str(access),
            'refresh': str(refresh),
            'user': {
                'id': user.id,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'role': user.role,
                'is_temporary_account': bool(getattr(user, "is_temporary_account", False)),
                'temporary_expires_at': (
                    user.temporary_expires_at.isoformat()
                    if getattr(user, "temporary_expires_at", None)
                    else None
                ),
            }
        }, status=status.HTTP_200_OK)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]  # Precisa estar logado
    serializer_class = LogoutSerializer

    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            refresh_token = serializer.validated_data['refresh']
            token = RefreshToken(refresh_token)
            token.blacklist()  # Invalida o token permanentemente
            
            return Response({
                'message': 'Logout realizado com sucesso'
            }, status=status.HTTP_200_OK)
            
        except TokenError as e:
            return Response({
                'error': 'Token inválido ou expirado'
            }, status=status.HTTP_400_BAD_REQUEST)


class RefreshTokenView(TokenRefreshView):
    pass


class UserMeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        
        # Construir URL completa do avatar se existir
        avatar_url = _resolve_uploaded_file_url(request, user.avatar_url)
        
        return Response({
            'id': user.id,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'role': user.role,
            'avatar': avatar_url,
            'avatar_url': avatar_url,
            'is_temporary_account': bool(getattr(user, "is_temporary_account", False)),
            'temporary_expires_at': (
                user.temporary_expires_at.isoformat()
                if getattr(user, "temporary_expires_at", None)
                else None
            ),
        }, status=status.HTTP_200_OK)


class UserUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        serializer = UserUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        user = request.user

        current_password = serializer.validated_data.get("current_password")
        new_password = serializer.validated_data.get("new_password")
        confirm_password = serializer.validated_data.get("confirm_password")
        has_password_payload = any(
            value is not None
            for value in (current_password, new_password, confirm_password)
        )

        if has_password_payload:
            if not current_password or not new_password or not confirm_password:
                return Response(
                    {
                        "error": (
                            "Preencha senha atual, nova senha e "
                            "confirmação para alterar a senha."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not user.check_password(current_password):
                return Response(
                    {"error": "Senha atual incorreta."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if new_password != confirm_password:
                return Response(
                    {"error": "Nova senha e confirmação não coincidem."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if len(new_password) < 8:
                return Response(
                    {"error": "A nova senha deve ter no mínimo 8 caracteres."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.set_password(new_password)
        
        if 'first_name' in serializer.validated_data:
            user.first_name = serializer.validated_data['first_name']
        if 'last_name' in serializer.validated_data:
            user.last_name = serializer.validated_data['last_name']
        avatar_file = serializer.validated_data.get('avatar')
        if avatar_file:
            if avatar_file.size > MAX_AVATAR_SIZE:
                return Response(
                    {'error': 'Arquivo muito grande. Tamanho maximo: 2MB.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            content_type = getattr(avatar_file, 'content_type', '') or ''
            ext = ALLOWED_AVATAR_TYPES.get(content_type.lower())
            if not ext:
                return Response(
                    {'error': 'Formato invalido. Use JPG, PNG ou WEBP.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            filename = f"avatars/{uuid4().hex}{ext}"
            saved_path = default_storage.save(filename, avatar_file)
            user.avatar_url = saved_path
        elif 'avatar_url' in serializer.validated_data:
            user.avatar_url = serializer.validated_data['avatar_url']
        
        user.save()
        avatar_url = _resolve_uploaded_file_url(request, user.avatar_url)
        
        return Response({
            'id': user.id,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'role': user.role,
            'avatar': avatar_url,
            'avatar_url': avatar_url,
        }, status=status.HTTP_200_OK)


class UserStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # 1. Busca o total de pontos (ganhos - consumidos em dicas Wordle)
        total_xp = _calculate_user_total_xp(request.user)

        # 2. Aplica a matematica de divisao de niveis (Bronze/Prata/Ouro)
        stats = calculate_tier_progress(total_xp)

        # 3. Retorna para o Frontend
        return Response(
            {
                "level": stats["level"],  # Ex: "Prata"
                "xp": stats["xp"],  # Ex: 300 (dentro do Prata)
                "xpToNext": stats["xpToNext"],  # Ex: 1000 (meta do Prata)
                # Opcional: retornar o total se quiser mostrar em algum lugar
                "total_xp": stats["total_xp"],
            },
            status=status.HTTP_200_OK,
        )


class IsAdminOrReadOnly(BasePermission):
    """Permite apenas admins criarem/alterarem cursos. Players sÃ³ podem visualizar."""
    def has_permission(self, request, view):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        if request.user.is_superuser:
            return True
        return request.user.is_authenticated and getattr(request.user, "role", None) == "admin"


class GameListCreateView(ListCreateAPIView):
    queryset = Game.objects.all()
    serializer_class = GameSerializer
    permission_classes = [IsAuthenticated, IsAdminOrReadOnly]

    PAGE_DEFAULT = 1
    LIMIT_DEFAULT = 10
    LIMIT_MAX = 50

    @staticmethod
    def _normalize_positive_int(raw_value, default_value):
        try:
            parsed = int(raw_value)
        except (TypeError, ValueError):
            return default_value
        return parsed if parsed > 0 else default_value

    def _should_paginate(self):
        return (
            "page" in self.request.query_params
            or "limit" in self.request.query_params
        )

    def get_serializer_class(self):
        if self.request.method == "GET" and self._should_paginate():
            return GameListItemSerializer
        return GameSerializer

    def get_queryset(self):
        if self._should_paginate():
            queryset = Game.objects.only(
                "id",
                "name",
                "description",
                "category",
                "banner",
                "is_active",
                "created_at",
                "updated_at",
            )
        else:
            queryset = Game.objects.only(
                "id",
                "name",
                "description",
                "category",
                "image_url",
                "video_url",
                "banner",
                "is_active",
                "created_at",
                "updated_at",
            )
        queryset = queryset.annotate(
            course_points=Coalesce(
                Sum("missions__points_value"),
                0,
            )
        )
        queryset = visible_games_queryset_for(self.request.user, queryset)
        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(category__iexact=category)
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(description__icontains=search)
            )
        return queryset.order_by("-updated_at", "-created_at", "id")

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        if not self._should_paginate():
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

        page = self._normalize_positive_int(
            request.query_params.get("page"),
            self.PAGE_DEFAULT,
        )
        limit = self._normalize_positive_int(
            request.query_params.get("limit"),
            self.LIMIT_DEFAULT,
        )
        limit = min(limit, self.LIMIT_MAX)

        total = queryset.count()
        total_pages = ceil(total / limit) if total > 0 else 0

        if total_pages > 0 and page > total_pages:
            page = total_pages

        start = (page - 1) * limit if total > 0 else 0
        end = start + limit
        page_queryset = queryset[start:end]

        serializer = self.get_serializer(page_queryset, many=True)
        payload = {
            "results": serializer.data,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": total_pages,
                "has_next": total_pages > 0 and page < total_pages,
                "has_previous": total_pages > 0 and page > 1,
            },
        }
        return Response(payload, status=status.HTTP_200_OK)

    def perform_create(self, serializer):
        if _is_temporary_admin_request(self.request):
            owned_games = Game.objects.filter(created_by=self.request.user).count()
            if owned_games >= TEMP_GAMES_LIMIT:
                raise DRFValidationError(
                    f"Conta temporaria pode criar no maximo {TEMP_GAMES_LIMIT} game."
                )

        game = serializer.save(created_by=self.request.user)
        ensure_default_badge_configs_for_game(
            game=game,
            actor=self.request.user,
            is_active=False,
        )

class GameRetrieveUpdateDestroyView(RetrieveUpdateDestroyAPIView):
    queryset = Game.objects.all()
    serializer_class = GameSerializer
    permission_classes = [IsAuthenticated, IsAdminOrReadOnly]

    def get_queryset(self):
        queryset = Game.objects.all()
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return visible_games_queryset_for(self.request.user, queryset)
        return editable_games_queryset_for(self.request.user, queryset)


class GameCategoriesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        categorias = visible_games_queryset_for(
            request.user,
            Game.objects.all(),
        ).values_list('category', flat=True).distinct()
        return Response([c.strip() for c in categorias if c and c.strip()])


class GameBadgeConfigView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrReadOnly]

    def _get_game_or_404(self, request, game_id, for_write=False):
        queryset = Game.objects.all()
        if for_write:
            queryset = editable_games_queryset_for(request.user, queryset)
        else:
            queryset = visible_games_queryset_for(request.user, queryset)
        try:
            return queryset.get(pk=game_id)
        except Game.DoesNotExist:
            return None

    def get(self, request, game_id):
        game = self._get_game_or_404(request, game_id, for_write=False)
        if game is None:
            return Response(
                {"error": "Game nÃ£o encontrado."},
                status=status.HTTP_404_NOT_FOUND,
            )

        configs = (
            BadgeConfig.objects.filter(game=game)
            .select_related("game")
            .prefetch_related("tier_rules")
            .order_by("criterion")
        )
        serializer = BadgeConfigSerializer(configs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request, game_id):
        game = self._get_game_or_404(request, game_id, for_write=True)
        if game is None:
            return Response(
                {"error": "Game nÃ£o encontrado."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = BadgeConfigUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        criterion = validated["criterion"]
        tiers = validated["tiers"]
        is_active = validated.get("is_active", False)

        if _is_temporary_admin_request(request):
            has_existing_criterion = BadgeConfig.objects.filter(
                game=game,
                criterion=criterion,
            ).exists()
            distinct_criteria = (
                BadgeConfig.objects.filter(game=game)
                .values_list("criterion", flat=True)
                .distinct()
                .count()
            )
            if not has_existing_criterion and distinct_criteria >= TEMP_BADGE_CRITERIA_LIMIT:
                return Response(
                    {
                        "error": (
                            f"Conta temporaria pode configurar no maximo "
                            f"{TEMP_BADGE_CRITERIA_LIMIT} criterios de badge por game."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        with transaction.atomic():
            badge_config, created = BadgeConfig.objects.get_or_create(
                game=game,
                criterion=criterion,
                defaults={
                    "is_active": is_active,
                    "created_by": request.user,
                    "updated_by": request.user,
                },
            )

            if not created:
                badge_config.is_active = is_active
                badge_config.updated_by = request.user
                badge_config.save(update_fields=["is_active", "updated_by", "updated_at"])

            incoming_tiers = {item["tier"] for item in tiers}
            BadgeTierRule.objects.filter(badge_config=badge_config).exclude(
                tier__in=incoming_tiers
            ).delete()

            existing_rules = {
                rule.tier: rule
                for rule in BadgeTierRule.objects.filter(badge_config=badge_config)
            }
            for item in tiers:
                tier = item["tier"]
                required_value = item["required_value"]
                existing_rule = existing_rules.get(tier)
                if existing_rule is None:
                    BadgeTierRule.objects.create(
                        badge_config=badge_config,
                        tier=tier,
                        required_value=required_value,
                    )
                    continue

                if existing_rule.required_value != required_value:
                    existing_rule.required_value = required_value
                    existing_rule.save(update_fields=["required_value", "updated_at"])

        response_serializer = BadgeConfigSerializer(
            BadgeConfig.objects.select_related("game")
            .prefetch_related("tier_rules")
            .get(pk=badge_config.pk)
        )
        return Response(response_serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, game_id):
        game = self._get_game_or_404(request, game_id, for_write=True)
        if game is None:
            return Response(
                {"error": "Game nÃ£o encontrado."},
                status=status.HTTP_404_NOT_FOUND,
            )

        criterion = request.query_params.get("criterion")
        if criterion not in SUPPORTED_BADGE_CRITERIA:
            return Response(
                {"error": "criterion invÃ¡lido."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        deleted, _ = BadgeConfig.objects.filter(game=game, criterion=criterion).delete()
        if deleted == 0:
            return Response(
                {"error": "ConfiguraÃ§Ã£o de badge nÃ£o encontrada."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)


class GameProgressCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = GameProgressSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        game = serializer.validated_data['game']
        user = request.user
        if not visible_games_queryset_for(user, Game.objects.filter(pk=game.pk)).exists():
            return Response(
                {"error": "Game nao disponivel para este perfil."},
                status=status.HTTP_403_FORBIDDEN,
            )
    
        progress, created = GameProgress.objects.get_or_create(
            user=user,
            game=game,
            defaults={
                'progress_percentage': serializer.validated_data.get('progress_percentage', 0),
                'game_points': serializer.validated_data.get('game_points', 0)
            }
        )
        
        if created:
            response_serializer = GameProgressSerializer(progress)
            return Response(response_serializer.data, status=status.HTTP_201_CREATED)
        else:
            response_serializer = GameProgressSerializer(progress)
            return Response(
                {
                    'message': 'Progresso já existe para este game',
                    'progress': response_serializer.data
                },
                status=status.HTTP_200_OK
            )


class GameProgressListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        visible_games = visible_games_queryset_for(user, Game.objects.all()).values_list("id", flat=True)
        
        # Recalcula progresso de todos os games já iniciados para evitar
        # inconsistências históricas entre missões concluídas e GameProgress.
        existing_progresses = list(
            GameProgress.objects.filter(user=user, game_id__in=visible_games).select_related('game')
        )
        for progress_entry in existing_progresses:
            update_game_progress(user, progress_entry.game)

        queryset = GameProgress.objects.filter(user=user, game_id__in=visible_games)
        
        game_id = request.query_params.get('game_id')
        if game_id:
            queryset = queryset.filter(game_id=game_id)
        
        completed = request.query_params.get('completed')
        if completed is not None:
            is_completed = completed.lower() in ('true', '1', 'yes')
            queryset = queryset.filter(completed_at__isnull=not is_completed)
        
        serializer = GameProgressSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class GameProgressUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        user = request.user
        visible_games = visible_games_queryset_for(user, Game.objects.all()).values_list("id", flat=True)
        
        try:
            progress = GameProgress.objects.get(pk=pk, user=user, game_id__in=visible_games)
        except GameProgress.DoesNotExist:
            return Response(
                {'error': 'Progresso não encontrado ou você não tem permissão para acessá-lo.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        if progress.completed_at and request.data.get('progress_percentage') == 100:
            return Response(
                {'error': 'Esse game já foi concluído.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        serializer = GameProgressSerializer(progress, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        
        if serializer.validated_data.get('progress_percentage') == 100 and not progress.completed_at:
            from django.utils import timezone
            serializer.validated_data['completed_at'] = timezone.now()
            logger.info(f"GAME_COMPLETED: user={user.id} email={user.email} game={progress.game.id}")
        
        serializer.save()
        
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        user = request.user
        visible_games = visible_games_queryset_for(user, Game.objects.all()).values_list("id", flat=True)
        
        try:
            progress = GameProgress.objects.get(pk=pk, user=user, game_id__in=visible_games)
        except GameProgress.DoesNotExist:
            return Response(
                {'error': 'Progresso não encontrado ou você não tem permissão para deletá-lo.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        game_name = progress.game.name
        progress.delete()
        logger.info(f"GAME_ABANDONED: user={user.id} email={user.email} game={progress.game.id}")
        
        return Response(
            {'message': f'Você abandonou o jogo "{game_name}".'},
            status=status.HTTP_204_NO_CONTENT
        )


class RecalculateProgressView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        visible_games = visible_games_queryset_for(user, Game.objects.all()).values_list("id", flat=True)
        
        # Buscar todos os games que o usuário tem progresso iniciado
        user_game_progresses = GameProgress.objects.filter(
            user=user,
            game_id__in=visible_games,
        ).select_related('game')
        
        if not user_game_progresses.exists():
            return Response({
                'message': 'Você ainda não iniciou nenhum game.',
                'games_updated': 0
            }, status=status.HTTP_200_OK)
        
        updated_count = 0
        for game_progress in user_game_progresses:
            update_game_progress(user, game_progress.game)
            updated_count += 1
        
        return Response({
            'message': f'Progresso recalculado com sucesso para {updated_count} game(s).',
            'games_updated': updated_count
        }, status=status.HTTP_200_OK)


class MissionListCreateView(ListCreateAPIView):
    serializer_class = MissionSerializer
    permission_classes = [IsAuthenticated, IsAdminOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        queryset = visible_missions_queryset_for(user, Mission.objects.all())
        
        if not (hasattr(user, 'role') and user.role == 'admin'):
            queryset = queryset.filter(is_active=True)
        
        game_id = self.request.query_params.get('game_id')
        if game_id:
            queryset = queryset.filter(game_id=game_id)
        
        return queryset

    def perform_create(self, serializer):
        if _is_temporary_admin_request(self.request):
            owned_missions = Mission.objects.filter(created_by=self.request.user).count()
            if owned_missions >= TEMP_MISSIONS_LIMIT:
                raise DRFValidationError(
                    f"Conta temporaria pode criar no maximo {TEMP_MISSIONS_LIMIT} missoes."
                )

            game = serializer.validated_data.get("game")
            if game is None or game.created_by_id != self.request.user.id:
                raise DRFValidationError(
                    "Conta temporaria pode criar missoes apenas no game criado por ela."
                )

        serializer.save(created_by=self.request.user)


class MissionRetrieveUpdateDestroyView(RetrieveUpdateDestroyAPIView):
    queryset = Mission.objects.all()
    serializer_class = MissionSerializer
    permission_classes = [IsAuthenticated, IsAdminOrReadOnly]

    def get_queryset(self):
        queryset = Mission.objects.all()
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return visible_missions_queryset_for(self.request.user, queryset)
        return editable_missions_queryset_for(self.request.user, queryset)


class MissionCompletionsListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        # Buscar todas as missões ativas
        missions = visible_missions_queryset_for(
            user,
            Mission.objects.filter(is_active=True),
        ).order_by('game', 'order')
        # Usar MissionSerializer que já inclui o campo 'completion'
        serializer = MissionSerializer(missions, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class MissionCompletionsStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, mission_id):
        user = request.user
        
        try:
            mission = visible_missions_queryset_for(
                user,
                Mission.objects.all(),
            ).get(pk=mission_id)
        except Mission.DoesNotExist:
            return Response(
                {'error': 'Missão não encontrada.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        if not mission.is_active:
            return Response(
                {'error': 'Esta missão não está ativa.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if MissionCompletions.objects.filter(user=user, mission=mission).exists():
            return Response(
                {'error': 'Você já iniciou esta missão.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Cria a conclusão da missão em progresso
        mission_completion = MissionCompletions.objects.create(
            user=user,
            mission=mission,
            status='in_progress',
            points_earned=0
        )
        
        serializer = MissionCompletionsSerializer(mission_completion)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class MissionCompletionsCompleteView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, mission_id):
        user = request.user
        
        try:
            mission_completion = MissionCompletions.objects.select_related('mission').get(
                user=user,
                mission_id=mission_id
            )
        except MissionCompletions.DoesNotExist:
            return Response(
                {'error': 'Você ainda não iniciou esta missão.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        if not mission_completion.mission.is_active:
            return Response(
                {'error': 'Esta missão não está mais ativa.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if mission_completion.status == 'completed':
            return Response(
                {'error': 'Você já completou esta missão.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Marca como concluída e registra pontos ganhos
        mission_completion.status = 'completed'
        mission_completion.points_earned = mission_completion.mission.points_value
        mission_completion.save()
        
        # Atualizar progresso do game automaticamente
        game = mission_completion.mission.game
        update_game_progress(user, game)
        evaluate_user_badges(user=user, game=game)
        
        serializer = MissionCompletionsSerializer(mission_completion)
        return Response({
            'message': 'Missão completada com sucesso!',
            'points_awarded': mission_completion.points_earned,
            'mission': serializer.data
        }, status=status.HTTP_200_OK)


class MissionValidateView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request, mission_id):
        user = request.user
        
        try:
            mission = visible_missions_queryset_for(
                user,
                Mission.objects.filter(is_active=True),
            ).get(pk=mission_id)
        except Mission.DoesNotExist:
            return Response(
                {'error': 'Missão não encontrada.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            mission_completion = MissionCompletions.objects.get(
                user=user,
                mission=mission
            )
        except MissionCompletions.DoesNotExist:
            return Response(
                {'error': 'Você precisa iniciar esta missão primeiro.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if mission_completion.status == 'completed':
            return Response(
                {'error': 'Você já completou esta missão.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        content_data = mission.content_data or {}
        is_correct = False
        points_earned = 0
        message = ""
        
        if mission.mission_type == 'quiz':
            # Validar respostas do quiz
            user_answers = request.data.get('answers', [])
            questions = content_data.get('questions', [])
            
            if not questions:
                return Response(
                    {'error': 'Quiz sem perguntas configuradas.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            if len(user_answers) != len(questions):
                return Response(
                    {'error': f'Esperado {len(questions)} respostas, recebido {len(user_answers)}.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Contar acertos
            correct_count = 0
            for i, question in enumerate(questions):
                if i < len(user_answers) and user_answers[i] == question.get('correct_answer'):
                    correct_count += 1
            
            total_questions = len(questions)
            percentage = (correct_count / total_questions) * 100
            
          
            points_earned = int((correct_count / total_questions) * mission.points_value)
            is_correct = correct_count == total_questions
            
            message = f"Você acertou {correct_count} de {total_questions} questões."
            
            if is_correct:
                message = "Parabéns! Você acertou todas as perguntas!"
            
            mission_completion.status = 'completed'
            mission_completion.points_earned = points_earned
            mission_completion.completed_at = timezone.now()
            mission_completion.save()
        
        elif mission.mission_type == 'game':
            # Validar wordle
            user_word = request.data.get('word', '').upper()
            correct_word = content_data.get('word', '').upper()
            
            if not correct_word:
                return Response(
                    {'error': 'Palavra não configurada para este jogo.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            if user_word == correct_word:
                is_correct = True
                points_earned = mission.points_value
                message = "Parabéns! Você acertou a palavra!"
        
                mission_completion.status = 'completed'
                mission_completion.points_earned = points_earned
                mission_completion.completed_at = timezone.now()
                mission_completion.save()
            else:
                message = "Palavra incorreta. Tente novamente!"
        
        else:
            return Response(
                {'error': 'Tipo de missão não suporta validação.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Mantém GameProgress sincronizado quando quiz/game conclui missão.
        if mission_completion.status == 'completed':
            update_game_progress(user, mission.game)
            evaluate_user_badges(user=user, game=mission.game)
        
        response_data = {
            'success': is_correct,
            'points_earned': points_earned,
            'status': mission_completion.status,
            'message': message
        }
        
        if mission.mission_type == 'quiz':
            response_data['correct_answers'] = correct_count
            response_data['total_questions'] = total_questions
        
        return Response(response_data, status=status.HTTP_200_OK)


class MissionWordleHintUseView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, mission_id):
        user = request.user

        try:
            mission = visible_missions_queryset_for(
                user,
                Mission.objects.filter(is_active=True),
            ).get(pk=mission_id)
        except Mission.DoesNotExist:
            return Response(
                {"error": "Missão não encontrada."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if mission.mission_type != "game":
            return Response(
                {"error": "Apenas missão Wordle possui uso de dicas."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not MissionCompletions.objects.filter(user=user, mission=mission).exists():
            return Response(
                {"error": "Você precisa iniciar esta missão primeiro."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_hint_index = request.data.get("hint_index")
        try:
            hint_index = int(raw_hint_index)
        except (TypeError, ValueError):
            return Response(
                {"error": "hint_index inválido."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        content_data = mission.content_data or {}
        raw_hints = content_data.get("hints", [])
        if isinstance(raw_hints, str):
            raw_hints = [line.strip() for line in raw_hints.splitlines() if line.strip()]
        elif not isinstance(raw_hints, list):
            raw_hints = []

        hints = [str(item).strip() for item in raw_hints if str(item).strip()]
        if not hints:
            return Response(
                {"error": "Esta missão não possui dicas cadastradas."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if hint_index < 0 or hint_index >= len(hints):
            return Response(
                {"error": "hint_index fora do intervalo de dicas."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        hint_text = hints[hint_index]

        with transaction.atomic():
            # Bloqueia a linha do usuário para serializar consumos concorrentes.
            User.objects.select_for_update().filter(pk=user.pk).first()

            existing_usage = WordleHintUsage.objects.filter(
                user=user,
                mission=mission,
                hint_index=hint_index,
            ).first()
            if existing_usage is not None:
                return Response(
                    {
                        "status": "already_revealed",
                        "hint_index": hint_index,
                        "hint_text": existing_usage.revealed_hint or hint_text,
                        "points_charged": 0,
                        "remaining_total_xp": _calculate_user_total_xp(user),
                        "free_hint_remaining": not WordleHintUsage.objects.filter(
                            user=user,
                            mission=mission,
                            is_free=True,
                        ).exists(),
                    },
                    status=status.HTTP_200_OK,
                )

            previous_uses_count = WordleHintUsage.objects.filter(
                user=user,
                mission=mission,
            ).count()
            is_free = previous_uses_count == 0
            points_charged = 0 if is_free else WORDLE_HINT_COST_POINTS

            current_total_xp = _calculate_user_total_xp(user)
            if points_charged > 0 and current_total_xp < points_charged:
                return Response(
                    {
                        "error": "Pontos insuficientes para revelar esta dica.",
                        "required_points": points_charged,
                        "current_total_xp": current_total_xp,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            WordleHintUsage.objects.create(
                user=user,
                mission=mission,
                hint_index=hint_index,
                revealed_hint=hint_text,
                points_spent=points_charged,
                is_free=is_free,
            )

            remaining_total_xp = max(0, current_total_xp - points_charged)

        return Response(
            {
                "status": "revealed",
                "hint_index": hint_index,
                "hint_text": hint_text,
                "points_charged": points_charged,
                "remaining_total_xp": remaining_total_xp,
                "free_hint_remaining": False,
            },
            status=status.HTTP_200_OK,
        )


class LeaderboardMixin(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def _normalize_limit(raw_limit):
        try:
            parsed = int(raw_limit)
        except (TypeError, ValueError):
            return 20
        return max(1, min(parsed, 100))

    @staticmethod
    def _badge_image_url(request, tier):
        image_path = f"/tier{tier}.png"
        if request is None:
            return image_path
        return request.build_absolute_uri(image_path)

    @staticmethod
    def _avatar_url(request, user):
        if user is None:
            return ""
        return _resolve_uploaded_file_url(request, getattr(user, "avatar_url", None)) or ""

    def _build_user_badges_map(self, user_ids, request, game=None):
        if not user_ids:
            return {}

        unlocks_qs = UserBadgeUnlock.objects.filter(user_id__in=user_ids)
        if game is not None:
            unlocks_qs = unlocks_qs.filter(badge_config__game=game)

        unlocks = (
            unlocks_qs
            .select_related("badge_config__game")
            .order_by("user_id", "-tier", "-unlocked_at", "id")
        )

        config_ids = {unlock.badge_config_id for unlock in unlocks}
        tier_rules = BadgeTierRule.objects.filter(
            badge_config_id__in=config_ids
        ).values("badge_config_id", "tier", "required_value")
        required_by_config_tier = {
            (int(rule["badge_config_id"]), int(rule["tier"])): int(rule["required_value"])
            for rule in tier_rules
        }
        top_required_by_config = {}
        for rule in tier_rules:
            config_id = int(rule["badge_config_id"])
            required_value = int(rule["required_value"])
            current_top = top_required_by_config.get(config_id, -1)
            if required_value > current_top:
                top_required_by_config[config_id] = required_value

        badges_map = {user_id: [] for user_id in user_ids}
        for unlock in unlocks:
            current = badges_map.setdefault(unlock.user_id, [])
            if len(current) >= 5:
                continue
            criterion = unlock.badge_config.criterion
            config_top_required = top_required_by_config.get(unlock.badge_config_id, 0)
            if criterion == "active_days":
                value_mode = "absolute"
            else:
                value_mode = "percentage" if config_top_required == 100 else "absolute"

            current.append(
                {
                    "game_id": unlock.badge_config.game_id,
                    "game_name": unlock.badge_config.game.name,
                    "criterion": criterion,
                    "criterion_label": BADGE_CRITERION_LABELS.get(criterion, criterion),
                    "value_mode": value_mode,
                    "required_value": required_by_config_tier.get(
                        (unlock.badge_config_id, unlock.tier)
                    ),
                    "tier": unlock.tier,
                    "image_url": self._badge_image_url(request, unlock.tier),
                    "unlocked_at": unlock.unlocked_at,
                }
            )

        return badges_map

    def _build_leaderboard(self, game=None, limit=20, request=None):
        scope = "global" if game is None else "course"
        limit = self._normalize_limit(limit)

        # Agregar pontos de missões completadas
        base_qs = MissionCompletions.objects.filter(status="completed")
        if game:
            base_qs = base_qs.filter(mission__game=game)

        aggregated = (
            base_qs.values("user_id")
            .annotate(
                total_points=Coalesce(Sum("points_earned"), 0),
                missions_completed=Count("id"),
            )
            .order_by("-total_points", "user_id")
        )

        if game:
            # COURSE: incluir usuários que se inscreveram (GameProgress) mesmo com 0 pontos
            enrolled_data = GameProgress.objects.filter(game=game).values("user_id", "started_at")
            
            points_map = {row["user_id"]: row for row in aggregated}
            
            # Adicionar usuários inscritos que não têm pontos, preservando data de inscrição
            result_dict = dict(points_map)
            for entry in enrolled_data:
                user_id = entry["user_id"]
                if user_id not in result_dict:
                    result_dict[user_id] = {
                        "user_id": user_id,
                        "total_points": 0,
                        "missions_completed": 0,
                        "created_at": entry["started_at"],
                    }
            
            # Re-ordenar por pontos descendente, depois por data de inscrição (mais antigo primeiro)
            rows = sorted(
                result_dict.values(),
                key=lambda x: (-x["total_points"], x.get("created_at", "2999-12-31"))
            )[:limit]
        else:
            # GLOBAL: incluir todos os usuários que têm GameProgress (inscritos em algum game)
            # Buscar todos os user_ids e data de primeira inscrição (mais antiga)
            enrolled_data = GameProgress.objects.values("user_id").annotate(
                first_enrolled=Min("started_at")
            ).values("user_id", "first_enrolled")
            
            points_map = {row["user_id"]: row for row in aggregated}
            
            # Adicionar usuários inscritos que não têm pontos
            result_dict = dict(points_map)
            for entry in enrolled_data:
                user_id = entry["user_id"]
                if user_id not in result_dict:
                    result_dict[user_id] = {
                        "user_id": user_id,
                        "total_points": 0,
                        "missions_completed": 0,
                        "created_at": entry["first_enrolled"],
                    }
            
            # Re-ordenar por pontos descendente, depois por data de primeira inscrição
            rows = sorted(
                result_dict.values(),
                key=lambda x: (-x["total_points"], x.get("created_at", "2999-12-31"))
            )[:limit]

        user_ids = [row["user_id"] for row in rows]
        users = {user.id: user for user in User.objects.filter(id__in=user_ids)}
        totals_all_games = (
            MissionCompletions.objects.filter(
                status="completed",
                user_id__in=user_ids,
            )
            .values("user_id")
            .annotate(total_points=Coalesce(Sum("points_earned"), 0))
        )
        total_points_all_games_map = {
            int(item["user_id"]): int(item["total_points"] or 0)
            for item in totals_all_games
        }
        badges_map = self._build_user_badges_map(
            user_ids=user_ids,
            request=request,
            game=game,
        )

        payload = []
        for index, row in enumerate(rows, start=1):
            user = users.get(row["user_id"])
            full_name = " ".join(filter(None, [getattr(user, "first_name", ""), getattr(user, "last_name", "")])).strip() if user else ""
            display_name = full_name or (user.email if user else "Jogador")
            total_points = row.get("total_points") or 0
            missions_completed = row.get("missions_completed") or 0
            user_total_points_all_games = total_points_all_games_map.get(
                row["user_id"],
                0,
            )
            user_level = calculate_tier_progress(user_total_points_all_games).get("level", "")

            payload.append({
                "position": index,
                "user_id": row["user_id"],
                "name": display_name,
                "avatar_url": self._avatar_url(request, user),
                "total_points": total_points,
                "missions_completed": missions_completed,
                "scope": scope,
                "game_id": game.id if game else None,
                "game_name": game.name if game else "",
                "tier": user_level,
                "nivel": user_level,
                "badges": badges_map.get(row["user_id"], []),
            })

        return payload


class GlobalLeaderboardView(LeaderboardMixin):
    def get(self, request):
        limit = request.query_params.get("limit", 20)
        leaderboard = self._build_leaderboard(limit=limit, request=request)
        serializer = LeaderboardEntrySerializer(leaderboard, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CourseLeaderboardView(LeaderboardMixin):
    def get(self, request, game_id):
        try:
            game = visible_games_queryset_for(
                request.user,
                Game.objects.all(),
            ).get(pk=game_id)
        except Game.DoesNotExist:
            return Response({"error": "Game não encontrado."}, status=status.HTTP_404_NOT_FOUND)

        limit = request.query_params.get("limit", 20)
        leaderboard = self._build_leaderboard(game=game, limit=limit, request=request)
        serializer = LeaderboardEntrySerializer(leaderboard, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class UserBadgesView(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def _badge_image_url(request, tier):
        image_path = f"/tier{tier}.png"
        if request is None:
            return image_path
        return request.build_absolute_uri(image_path)

    @classmethod
    def _build_progress_entry(cls, user, badge_config, unlocked_tiers, request):
        tier_rules = sorted(badge_config.tier_rules.all(), key=lambda rule: rule.tier)
        value_mode = resolve_badge_config_value_mode(badge_config)
        current_value = calculate_badge_config_current_value(
            user=user,
            badge_config=badge_config,
            value_mode=value_mode,
        )

        tiers_payload = []
        next_tier = None
        next_required_value = None
        for rule in tier_rules:
            required = int(rule.required_value)
            achieved = current_value >= required
            unlocked = rule.tier in unlocked_tiers
            progress_percentage = 100 if required <= 0 else min(
                100, int((current_value / required) * 100)
            )
            tiers_payload.append(
                {
                    "tier": rule.tier,
                    "required_value": required,
                    "is_achieved": achieved,
                    "is_unlocked": unlocked,
                    "progress_percentage": progress_percentage,
                    "image_url": cls._badge_image_url(request, rule.tier),
                }
            )
            if not achieved and next_tier is None:
                next_tier = rule.tier
                next_required_value = required

        progress_to_next = 100
        if next_required_value:
            progress_to_next = min(100, int((current_value / next_required_value) * 100))

        return {
            "badge_config_id": badge_config.id,
            "game_id": badge_config.game_id,
            "game_name": badge_config.game.name,
            "criterion": badge_config.criterion,
            "value_mode": value_mode,
            "criterion_label": BADGE_CRITERION_LABELS.get(
                badge_config.criterion, badge_config.criterion
            ),
            "current_value": current_value,
            "next_tier": next_tier,
            "next_required_value": next_required_value,
            "progress_to_next_percentage": progress_to_next,
            "is_active": badge_config.is_active,
            "tiers": tiers_payload,
        }

    def get(self, request):
        user = request.user
        game_id = request.query_params.get("game_id")
        visible_game_ids = visible_games_queryset_for(
            user,
            Game.objects.all(),
        ).values_list("id", flat=True)

        configs_qs = (
            BadgeConfig.objects.filter(is_active=True, game_id__in=visible_game_ids)
            .select_related("game")
            .prefetch_related("tier_rules")
        )
        if game_id:
            configs_qs = configs_qs.filter(game_id=game_id)

        configs = list(configs_qs.order_by("game_id", "criterion"))
        games_to_evaluate = {}
        for config in configs:
            games_to_evaluate[config.game_id] = config.game

        for game in games_to_evaluate.values():
            evaluate_user_badges(user=user, game=game)

        config_ids = [config.id for config in configs]
        unlocks = (
            UserBadgeUnlock.objects.filter(user=user, badge_config_id__in=config_ids)
            .select_related("badge_config__game")
            .order_by("-unlocked_at", "-tier", "id")
        )

        unlocks_serializer = UserBadgeUnlockSerializer(
            unlocks,
            many=True,
            context={"request": request},
        )

        unlocked_tiers_map = {}
        for unlock in unlocks:
            unlocked_tiers_map.setdefault(unlock.badge_config_id, set()).add(unlock.tier)

        progress_payload = [
            self._build_progress_entry(
                user=user,
                badge_config=config,
                unlocked_tiers=unlocked_tiers_map.get(config.id, set()),
                request=request,
            )
            for config in configs
        ]

        return Response(
            {
                "unlocked": unlocks_serializer.data,
                "progress": progress_payload,
            },
            status=status.HTTP_200_OK,
        )


class AvailableBadgesView(UserBadgesView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        raw_game_id = request.query_params.get("game_id")
        if not raw_game_id:
            return Response(
                {"error": "game_id é obrigatório."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            game_id = int(raw_game_id)
        except (TypeError, ValueError):
            return Response(
                {"error": "game_id inválido."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            game = visible_games_queryset_for(
                request.user,
                Game.objects.all(),
            ).get(pk=game_id)
        except Game.DoesNotExist:
            return Response(
                {"error": "Game não encontrado."},
                status=status.HTTP_404_NOT_FOUND,
            )

        evaluate_user_badges(user=request.user, game=game)

        configs = list(
            BadgeConfig.objects.filter(game=game, is_active=True)
            .select_related("game")
            .prefetch_related("tier_rules")
            .order_by("criterion")
        )
        config_ids = [config.id for config in configs]
        unlocks = UserBadgeUnlock.objects.filter(
            user=request.user,
            badge_config_id__in=config_ids,
        )

        unlocked_tiers_map = {}
        for unlock in unlocks:
            unlocked_tiers_map.setdefault(unlock.badge_config_id, set()).add(unlock.tier)

        badges_payload = [
            self._build_progress_entry(
                user=request.user,
                badge_config=config,
                unlocked_tiers=unlocked_tiers_map.get(config.id, set()),
                request=request,
            )
            for config in configs
        ]

        return Response(
            {
                "game_id": game.id,
                "game_name": game.name,
                "badges": badges_payload,
            },
            status=status.HTTP_200_OK,
        )

class CourseTrailView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, course_id):
        from .serializers import CourseTrailSerializer
        
        # Buscar o curso
        try:
            game = visible_games_queryset_for(
                request.user,
                Game.objects.filter(is_active=True),
            ).get(id=course_id)
        except Game.DoesNotExist:
            return Response(
                {'error': 'Curso não encontrado.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        progress = GameProgress.objects.filter(
            user=request.user,
            game=game
        ).first()
        
        missions_qs = visible_missions_queryset_for(
            request.user,
            Mission.objects.filter(
                game=game,
                is_active=True
            ),
        )
        missions = missions_qs.order_by('order', 'created_at')
        
        user_completions = MissionCompletions.objects.filter(
            user=request.user,
            mission__in=missions_qs
        ).select_related('mission')
        
        completions_map = {
            completion.mission_id: completion 
            for completion in user_completions
        }
        
        from .models import calculate_stars
        
        missions_with_status = []
        previous_completed = True  
        
        for mission in missions:
            completion = completions_map.get(mission.id)
            mission_data = {
                'mission': mission,
                'completion': completion
            }
            
            if completion and completion.status == 'completed':
                mission_data['status'] = 'completed'
                mission_data['completed_at'] = completion.completed_at
                mission_data['points_earned'] = completion.points_earned
                mission_data['stars_earned'] = calculate_stars(
                    completion.points_earned,
                    mission.points_value
                )
                previous_completed = True
            elif previous_completed:
                # Missão disponível se a anterior foi concluída
                mission_data['status'] = 'available'
                mission_data['stars_earned'] = 0
                mission_data['completed_at'] = None
                previous_completed = False 
            else:
                mission_data['status'] = 'locked'
                mission_data['stars_earned'] = 0
                mission_data['completed_at'] = None
            
            mission_data['stars_total'] = 3
            missions_with_status.append(mission_data)
        
        # Preparar dados para serializer
        data = {
            'game': game,
            'progress': progress,
            'missions': missions_with_status
        }
        
        serializer = CourseTrailSerializer(data)
        return Response(serializer.data, status=status.HTTP_200_OK)
class PlayerHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        
        game_progress = GameProgress.objects.filter(user=user).select_related('game')
        mission_completions = MissionCompletions.objects.filter(user=user).select_related('mission')
        
        data = {'games': game_progress, 'missions': mission_completions}
        serializer = PlayerHistorySerializer(data)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ProgressSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        
        progress_qs = GameProgress.objects.filter(user=user)
        courses_in_progress = progress_qs.filter(completed_at__isnull=True).count()
        courses_completed = progress_qs.filter(completed_at__isnull=False).count()
        
        missions_qs = MissionCompletions.objects.filter(user=user, status='completed')
        missions_completed = missions_qs.count()
        total_points = missions_qs.aggregate(total=Coalesce(Sum('points_earned'), 0))['total']
        
        return Response({
            'courses_in_progress': courses_in_progress,
            'courses_completed': courses_completed,
            'missions_completed': missions_completed,
            'total_points': total_points,
        }, status=status.HTTP_200_OK)


class TemporaryAccessRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "temporary_access_request"

    def post(self, request):
        from .email_service import send_temporary_access_email

        purge_expired_temporary_accounts()

        payload = request.data if isinstance(request.data, dict) else {}
        nome = str(payload.get("nome", "")).strip()
        contato_email = str(payload.get("email", "")).strip().lower()
        aceite_temporario = bool(payload.get("aceite_temporario", False))
        aceite_formal = bool(payload.get("aceite_formal", False))

        if not nome:
            return Response(
                {"error": "Nome obrigatorio. Atualize a pagina e tente novamente."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            validate_email(contato_email)
        except DjangoValidationError:
            return Response(
                {"error": "E-mail invalido. Atualize a pagina e tente novamente."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not aceite_temporario or not aceite_formal:
            return Response(
                {"error": "Aceites obrigatorios nao confirmados. Atualize a pagina e tente novamente."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(email=contato_email).exists():
            return Response(
                {"error": "Ja existe um usuario com este e-mail."},
                status=status.HTTP_409_CONFLICT,
            )

        temporary_email = contato_email
        temporary_username = generate_unique_username_from_email(temporary_email)
        temporary_password = generate_temporary_password()
        expires_at = build_temporary_expiration()
        expires_at_display = timezone.localtime(expires_at).strftime("%d/%m/%Y %H:%M")

        try:
            with transaction.atomic():
                temp_user = User(
                    email=temporary_email,
                    username=temporary_username,
                    first_name=nome,
                    role="admin",
                    is_temporary_account=True,
                    temporary_expires_at=expires_at,
                )
                temp_user.set_password(temporary_password)
                temp_user.save()

                email_sent = send_temporary_access_email(
                    to_email=contato_email,
                    name=nome,
                    password=temporary_password,
                    expires_at=expires_at_display,
                )

                if not email_sent:
                    raise DRFValidationError(
                        "Nao foi possivel enviar o e-mail no momento. Atualize a pagina e tente novamente."
                    )
        except DRFValidationError as exc:
            detail = exc.detail
            if isinstance(detail, list) and detail:
                message = str(detail[0])
            else:
                message = str(detail)
            return Response({"error": message}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception:
            logger.exception(
                "TEMP_ACCESS_REQUEST_FAILED: contato_email=%s nome=%s",
                contato_email,
                nome,
            )
            return Response(
                {"error": "Falha ao processar solicitacao. Atualize a pagina e tente novamente."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        logger.info(
            "TEMP_ACCESS_REQUEST_SUCCESS: contato_email=%s temp_user=%s expires_at=%s",
            contato_email,
            temporary_email,
            expires_at.isoformat(),
        )
        return Response(
            {
                "message": "Solicitacao processada com sucesso. Verifique seu e-mail para acessar a plataforma.",
            },
            status=status.HTTP_201_CREATED,
        )


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset_request"

    def post(self, request):
        from .models import PasswordResetToken
        from .email_service import send_password_reset_email
        import secrets
        from datetime import timedelta

        email = request.data.get('email')
        if not email:
            return Response({'error': 'Email é obrigatório.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            logger.warning(f"PASSWORD_RESET_ATTEMPT_FAILED: email={email} reason=user_not_found")
            return Response({'message': 'Se o email estiver cadastrado, você receberá um código.'}, status=status.HTTP_200_OK)

        PasswordResetToken.objects.filter(user=user, is_used=False).update(is_used=True)

        token = ''.join([str(secrets.randbelow(10)) for _ in range(6)])
        expires_at = timezone.now() + timedelta(minutes=15)

        PasswordResetToken.objects.create(user=user, token=token, expires_at=expires_at)

        name = user.first_name or user.email.split('@')[0]
        email_sent = send_password_reset_email(email, name, token)
        if not email_sent:
            logger.error(f"PASSWORD_RESET_REQUEST_EMAIL_NOT_SENT: user={user.id} email={email}")

        logger.info(f"PASSWORD_RESET_REQUEST: user={user.id} email={email}")

        return Response({'message': 'Se o email estiver cadastrado, você receberá um código.'}, status=status.HTTP_200_OK)


class PasswordResetVerifyView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset_verify"

    def post(self, request):
        from .models import PasswordResetToken
        import uuid

        email = request.data.get('email')
        code = request.data.get('code')

        if not email or not code:
            return Response({'error': 'Email e código são obrigatórios.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({'error': 'Usuário não encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            token_obj = PasswordResetToken.objects.get(user=user, token=code, is_used=False)
        except PasswordResetToken.DoesNotExist:
            return Response({'error': 'Código inválido.'}, status=status.HTTP_400_BAD_REQUEST)

        if timezone.now() > token_obj.expires_at:
            return Response({'error': 'Código expirado.'}, status=status.HTTP_400_BAD_REQUEST)

        token_obj.is_used = True
        token_obj.reset_session_token = str(uuid.uuid4())
        token_obj.save()

        logger.info(f"PASSWORD_RESET_VERIFY: user={user.id} email={email}")

        return Response({'session_token': token_obj.reset_session_token}, status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset_confirm"

    def post(self, request):
        from .models import PasswordResetToken
        from datetime import timedelta

        session_token = request.data.get('session_token')
        new_password = request.data.get('new_password')
        confirm_password = request.data.get('confirm_password')

        if not session_token or not new_password or not confirm_password:
            return Response({'error': 'Todos os campos são obrigatórios.'}, status=status.HTTP_400_BAD_REQUEST)

        if new_password != confirm_password:
            return Response({'error': 'As senhas não coincidem.'}, status=status.HTTP_400_BAD_REQUEST)

        if len(new_password) < 8:
            return Response({'error': 'A senha deve ter no mínimo 8 caracteres.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            token_obj = PasswordResetToken.objects.get(
                reset_session_token=session_token,
                is_used=True
            )
        except PasswordResetToken.DoesNotExist:
            return Response({'error': 'Sessão inválida ou expirada.'}, status=status.HTTP_400_BAD_REQUEST)

        if timezone.now() > token_obj.expires_at + timedelta(minutes=15):
            return Response({'error': 'Sessão expirada.'}, status=status.HTTP_400_BAD_REQUEST)

        user = token_obj.user
        user.set_password(new_password)
        user.save()

        token_obj.reset_session_token = None
        token_obj.save()

        logger.info(f"PASSWORD_RESET_CONFIRM: user={user.id} email={user.email}")

        return Response({'message': 'Senha alterada com sucesso.'}, status=status.HTTP_200_OK)


class IsAdminRole(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_superuser:
            return True
        if is_temporary_admin(request.user):
            return False
        return request.user.is_authenticated and getattr(request.user, "role", None) == "admin"


class DashboardActiveUsersView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        from datetime import timedelta
        now = timezone.now()
        one_week_ago = now - timedelta(days=7)
        one_month_ago = now - timedelta(days=30)

        # Usuários com atividade recente (login ou progresso atualizado)
        weekly_active = User.objects.filter(
            Q(last_login__gte=one_week_ago) |
            Q(game_progress__updated_at__gte=one_week_ago) |
            Q(mission_completions__completed_at__gte=one_week_ago)
        ).distinct().count()

        monthly_active = User.objects.filter(
            Q(last_login__gte=one_month_ago) |
            Q(game_progress__updated_at__gte=one_month_ago) |
            Q(mission_completions__completed_at__gte=one_month_ago)
        ).distinct().count()

        return Response({
            'usuarios_ativos_semana': weekly_active,
            'usuarios_ativos_mes': monthly_active,
        }, status=status.HTTP_200_OK)


class DashboardAverageTimeView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        from datetime import timedelta
        now = timezone.now()
        inicio_mes = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # Estimar tempo baseado em atividades do mês
        usuarios_ativos = User.objects.filter(
            Q(mission_completions__completed_at__gte=inicio_mes) |
            Q(game_progress__updated_at__gte=inicio_mes)
        ).distinct()

        total_usuarios = usuarios_ativos.count()

        if total_usuarios == 0:
            return Response({
                'tempo_medio_minutos': 0,
                'tempo_medio_horas': 0,
                'total_usuarios': 0,
            }, status=status.HTTP_200_OK)

        # Contar atividades do mês - cada missão concluída = ~10 minutos (estimativa)
        missoes_concluidas = MissionCompletions.objects.filter(
            completed_at__gte=inicio_mes,
            status='completed'
        ).count()

        tempo_total_estimado = missoes_concluidas * 10
        tempo_medio_minutos = round(tempo_total_estimado / total_usuarios, 2)
        tempo_medio_horas = round(tempo_medio_minutos / 60, 2)

        return Response({
            'tempo_medio_minutos': tempo_medio_minutos,
            'tempo_medio_horas': tempo_medio_horas,
            'total_usuarios': total_usuarios,
        }, status=status.HTTP_200_OK)


class DashboardCompletionRateView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        total_inscricoes = GameProgress.objects.count()

        if total_inscricoes == 0:
            return Response({
                'taxa_conclusao_percentual': 0,
                'games_concluidos': 0,
                'total_inscricoes': 0,
            }, status=status.HTTP_200_OK)

        games_concluidos = GameProgress.objects.filter(
            completed_at__isnull=False
        ).count()

        taxa_conclusao = round((games_concluidos / total_inscricoes) * 100, 2)

        return Response({
            'taxa_conclusao_percentual': taxa_conclusao,
            'games_concluidos': games_concluidos,
            'total_inscricoes': total_inscricoes,
        }, status=status.HTTP_200_OK)


class DashboardAverageXpView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        from django.db.models import Avg

        # XP total está armazenado nas entradas de leaderboard global
        leaderboard_entries = LeaderboardEntry.objects.filter(scope='global')

        total_usuarios = leaderboard_entries.count()

        if total_usuarios == 0:
            return Response({
                'xp_medio': 0,
                'total_usuarios': 0,
            }, status=status.HTTP_200_OK)

        xp_medio = leaderboard_entries.aggregate(
            media=Avg('total_points')
        )['media'] or 0

        return Response({
            'xp_medio': round(xp_medio, 2),
            'total_usuarios': total_usuarios,
        }, status=status.HTTP_200_OK)


class DashboardCompletedMissionsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        from datetime import timedelta
        now = timezone.now()
        one_week_ago = now - timedelta(days=7)
        one_month_ago = now - timedelta(days=30)
        one_year_ago = now - timedelta(days=365)

        missoes_semana = MissionCompletions.objects.filter(
            completed_at__gte=one_week_ago,
            status='completed'
        ).count()

        missoes_mes = MissionCompletions.objects.filter(
            completed_at__gte=one_month_ago,
            status='completed'
        ).count()

        missoes_ano = MissionCompletions.objects.filter(
            completed_at__gte=one_year_ago,
            status='completed'
        ).count()

        return Response({
            'missoes_concluidas_semana': missoes_semana,
            'missoes_concluidas_mes': missoes_mes,
            'missoes_concluidas_ano': missoes_ano,
        }, status=status.HTTP_200_OK)


class DashboardTopCollaboratorsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        top_usuarios = LeaderboardEntry.objects.filter(
            scope='global'
        ).select_related('user').order_by('-total_points')[:10]

        ranking = []
        for idx, entry in enumerate(top_usuarios, start=1):
            ranking.append({
                'posicao': idx,
                'nome': f"{entry.user.first_name} {entry.user.last_name}".strip() or entry.user.email,
                'email': entry.user.email,
                'avatar_url': _resolve_uploaded_file_url(request, entry.user.avatar_url),
                'xp_total': entry.total_points,
                'missoes_concluidas': entry.missions_completed,
            })

        return Response({
            'ranking': ranking,
        }, status=status.HTTP_200_OK)


