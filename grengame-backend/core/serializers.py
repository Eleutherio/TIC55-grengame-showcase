from datetime import timedelta

from rest_framework import serializers
from django.conf import settings
from django.contrib.auth import get_user_model, authenticate
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models
from django.utils import timezone
from .badge_services import is_percentage_based_criterion
from .temporary_access import purge_expired_temporary_accounts
from .models import (
    BadgeConfig,
    BadgeTierRule,
    Game,
    GameProgress,
    Mission,
    MissionCompletions,
    UserBadgeUnlock,
)

User = get_user_model()

# --- Serializers de Autenticação e Usuário ---

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(
        required=True,
        help_text="Email do colaborador"
    )
    password = serializers.CharField(
        required=True,
        write_only=True,
        style={'input_type': 'password'},
        help_text="Senha do usuário"
    )

    def validate_email(self, value):
        return value.lower()

    def validate(self, data):
        email = data.get('email')
        password = data.get('password')

        purge_expired_temporary_accounts()

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise serializers.ValidationError("Email ou senha incorretos.")

        if not user.is_active:
            raise serializers.ValidationError("Esta conta está desativada.")

        authenticated_user = authenticate(
            request=self.context.get('request'),
            username=email,
            password=password
        )

        if authenticated_user is None:
            raise serializers.ValidationError("Email ou senha incorretos.")

        # Janela curta para o primeiro login do perfil temporario.
        first_login_window_minutes = getattr(
            settings,
            "TEMPORARY_FIRST_LOGIN_WINDOW_MINUTES",
            30,
        )
        if (
            getattr(authenticated_user, "is_temporary_account", False)
            and getattr(authenticated_user, "last_login", None) is None
            and first_login_window_minutes > 0
        ):
            created_at = getattr(authenticated_user, "created_at", None)
            if created_at is not None:
                first_login_deadline = created_at + timedelta(
                    minutes=first_login_window_minutes
                )
                if timezone.now() > first_login_deadline:
                    raise serializers.ValidationError(
                        "Credenciais temporarias expiraram para o primeiro acesso. Solicite um novo login temporario."
                    )

        data['user'] = authenticated_user
        return data

class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(
        required=True,
        help_text="Refresh token a ser invalidado"
    )

    def validate_refresh(self, value):
        if not value:
            raise serializers.ValidationError("Refresh token é obrigatório.")
        return value

class UserUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    avatar = serializers.FileField(required=False, allow_null=True)
    avatar_url = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=512,
    )

    def validate_avatar_url(self, value):
        if value is None or value == "":
            return value
        if len(value) > 512:
            raise serializers.ValidationError("URL muito longa (max 512).")
        field = User._meta.get_field("avatar_url")
        try:
            field.run_validators(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages)
        return value

# --- Serializers de Modelos Base ---

class GameSerializer(serializers.ModelSerializer):
    course_points = serializers.SerializerMethodField()
    class Meta:
        model = Game
        fields = ['id', 'name', 'description', 'category', 'image_url', 'video_url', 'banner', 'course_points', 'is_active', 'created_at', 'updated_at']

    def validate_image_url(self, arquivo):
        if arquivo:
            if arquivo.size > 5 * 1024 * 1024:
                raise serializers.ValidationError("Imagem deve ter no máximo 5MB.")
        return arquivo

    def validate_video_url(self, arquivo):
        if arquivo:
            extensoes = ('.mp4', '.webm', '.mov', '.avi')
            if not arquivo.name.lower().endswith(extensoes):
                raise serializers.ValidationError("Formato de vídeo inválido. Use: mp4, webm, mov ou avi.")
            if arquivo.size > 1 * 1024 * 1024 * 1024:
                raise serializers.ValidationError("Vídeo deve ter no máximo 1GB.")
        return arquivo

    def validate_description(self, value):
        if value is None:
            return value
        trimmed = value.strip()
        if not trimmed:
            return ""
        max_length = 500
        if len(trimmed) > max_length:
            raise serializers.ValidationError(
                f"Descrição deve ter no máximo {max_length} caracteres."
            )
        return trimmed

    def validate_banner(self, arquivo):
        if arquivo:
            if arquivo.size > 5 * 1024 * 1024:
                raise serializers.ValidationError("Banner deve ter no máximo 5MB.")
        return arquivo

    def get_course_points(self, obj):
        annotated_points = getattr(obj, "course_points", None)
        if annotated_points is not None:
            return int(annotated_points)
        total_points = Mission.objects.filter(
            game=obj,
        ).aggregate(total=models.Sum("points_value"))["total"]
        return total_points or 0


class GameListItemSerializer(serializers.ModelSerializer):
    course_points = serializers.SerializerMethodField()
    class Meta:
        model = Game
        fields = ['id', 'name', 'description', 'category', 'banner', 'course_points', 'is_active', 'created_at', 'updated_at']

    def get_course_points(self, obj):
        annotated_points = getattr(obj, "course_points", None)
        if annotated_points is not None:
            return int(annotated_points)
        total_points = Mission.objects.filter(
            game=obj,
        ).aggregate(total=models.Sum("points_value"))["total"]
        return total_points or 0


class GameProgressSerializer(serializers.ModelSerializer):
    game_name = serializers.CharField(source='game.name', read_only=True)
    game_category = serializers.CharField(source='game.category', read_only=True)
    game_points = serializers.SerializerMethodField()
    
    class Meta:
        model = GameProgress
        fields = [
            'id', 'game', 'game_name', 'game_category', 'progress_percentage',
            'game_points', 'started_at', 'completed_at', 'updated_at'
        ]
        read_only_fields = ['id', 'started_at', 'completed_at', 'updated_at']

    def get_game_points(self, obj):
        total_points = MissionCompletions.objects.filter(
            user=obj.user,
            mission__game=obj.game,
            status='completed'
        ).aggregate(total=models.Sum('points_earned'))['total']
        
        return total_points or 0

    def validate_progress_percentage(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("A porcentagem de progresso deve estar entre 0 e 100.")
        return value

class MissionSerializer(serializers.ModelSerializer):
    game_name = serializers.CharField(source='game.name', read_only=True)
    game_category = serializers.CharField(source='game.category', read_only=True)
    completion = serializers.SerializerMethodField()
    
    class Meta:
        model = Mission
        fields = ['id', 'game', 'game_name', 'game_category', 'title', 'description', 'mission_type', 'icon', 'order', 'points_value', 'content_data', 'is_active', 'created_at', 'updated_at', 'completion']
        read_only_fields = ['id', 'created_at', 'updated_at', 'completion']

    def get_completion(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            try:
                completion = MissionCompletions.objects.get(mission=obj, user=request.user)
                return {
                    'completed': completion.status == 'completed',
                    'points_earned': completion.points_earned,
                    'completed_at': completion.completed_at
                }
            except MissionCompletions.DoesNotExist:
                return None
        return None

    def validate_points_value(self, value):
        if value < 0:
            raise serializers.ValidationError("Os pontos devem ser maiores ou iguais a zero.")
        return value
    
    def validate(self, data):
        # Se a missão está ativa, content_data deve estar preenchido
        is_active = data.get('is_active', True)
        content_data = data.get('content_data')
        mission_type = data.get('mission_type')
        
        if is_active and not content_data:
            raise serializers.ValidationError({
                'content_data': 'Missões ativas devem ter conteúdo definido.'
            })
        
        if content_data and mission_type:
            if mission_type == 'video':
                if 'url' not in content_data:
                    raise serializers.ValidationError({
                        'content_data': 'o video deve conter campo url.'
                    })
                url = content_data['url']
                if not isinstance(url, str) or not (url.startswith('http://') or url.startswith('https://')):
                    raise serializers.ValidationError({
                        'content_data': 'a url do video deve começar com http:// ou https://.'
                    })
            elif mission_type == 'quiz':
                if 'questions' not in content_data or not isinstance(content_data['questions'], list):
                    raise serializers.ValidationError({
                        'content_data': 'o quiz deve conter campo questions como lista.'
                    })
                for i, question in enumerate(content_data['questions']):
                    if 'options' not in question or not isinstance(question['options'], list):
                        raise serializers.ValidationError({
                            'content_data': f'questao {i} deve conter options como lista.'
                        })
                    num_options = len(question['options'])
                    if num_options < 2 or num_options > 5:
                        raise serializers.ValidationError({
                            'content_data': f'questao {i} deve ter entre 2 e 5 opcoes.'
                        })
                    if 'correct_answer' not in question:
                        raise serializers.ValidationError({
                            'content_data': f'questao {i} deve conter correct_answer.'
                        })
                    if not isinstance(question['correct_answer'], int) or question['correct_answer'] < 0 or question['correct_answer'] >= num_options:
                        raise serializers.ValidationError({
                            'content_data': f'questao {i} correct_answer deve ser inteiro entre 0 e {num_options - 1}.'
                        })
            elif mission_type == 'game':
                if 'word' not in content_data:
                    raise serializers.ValidationError({
                        'content_data': 'o wordle deve conter campo word.'
                    })
                word = content_data['word']
                if not isinstance(word, str) or len(word) != 5:
                    raise serializers.ValidationError({
                        'content_data': 'a palavra do wordle deve ter exatamente 5 letras.'
                    })
                if not word.isalpha():
                    raise serializers.ValidationError({
                        'content_data': 'a palavra do wordle deve conter apenas letras.'
                    })
        
        game = data.get('game')
        order = data.get('order')
        if game and order is not None:
            existing = Mission.objects.filter(game=game, order=order)
            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise serializers.ValidationError({
                    'order': f'Já existe uma missão com order {order} nesse game.'
                })
        
        return data

class MissionCompletionsSerializer(serializers.ModelSerializer):
    mission_title = serializers.CharField(source='mission.title', read_only=True)
    mission_points_value = serializers.IntegerField(source='mission.points_value', read_only=True)
    mission_description = serializers.CharField(source='mission.description', read_only=True)
    
    class Meta:
        model = MissionCompletions
        fields = [
            'id', 'mission', 'mission_title', 'mission_description',
            'mission_points_value', 'points_earned', 'status', 'completed_at'
        ]
        read_only_fields = ['id', 'completed_at']

    def validate_points_earned(self, value):
        if value < 0:
            raise serializers.ValidationError("Os pontos ganhos não podem ser negativos.")
        return value

class BadgeTierRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = BadgeTierRule
        fields = ["tier", "required_value"]


class BadgeConfigSerializer(serializers.ModelSerializer):
    game_id = serializers.IntegerField(source="game.id", read_only=True)
    game_name = serializers.CharField(source="game.name", read_only=True)
    tiers = serializers.SerializerMethodField()
    value_mode = serializers.SerializerMethodField()

    class Meta:
        model = BadgeConfig
        fields = [
            "id",
            "game_id",
            "game_name",
            "criterion",
            "value_mode",
            "is_active",
            "tiers",
            "created_at",
            "updated_at",
        ]

    def get_tiers(self, obj):
        rules = list(obj.tier_rules.all())
        rules.sort(key=lambda item: item.tier)
        return BadgeTierRuleSerializer(rules, many=True).data

    def get_value_mode(self, obj):
        rules = list(obj.tier_rules.all())
        if obj.criterion == "active_days":
            return "absolute"
        if not rules:
            return "percentage"
        top_required_value = max(int(rule.required_value) for rule in rules)
        return "percentage" if top_required_value == 100 else "absolute"


class BadgeTierInputSerializer(serializers.Serializer):
    tier = serializers.IntegerField(min_value=1, max_value=5)
    required_value = serializers.IntegerField(min_value=0, required=False)
    required_count = serializers.IntegerField(min_value=0, required=False)

    def validate(self, attrs):
        required_value = attrs.get("required_value")
        required_count = attrs.get("required_count")
        if required_value is None and required_count is None:
            raise serializers.ValidationError(
                "Informe required_value (ou required_count) para cada tier."
            )
        attrs["required_value"] = (
            required_value if required_value is not None else required_count
        )
        return attrs


class BadgeConfigUpsertSerializer(serializers.Serializer):
    criterion = serializers.ChoiceField(
        choices=[choice[0] for choice in BadgeConfig.CRITERION_CHOICES]
    )
    is_active = serializers.BooleanField(required=False)
    tiers = BadgeTierInputSerializer(many=True)

    def validate_tiers(self, value):
        if len(value) != 5:
            raise serializers.ValidationError(
                "Envie exatamente 5 tiers (1 a 5)."
            )

        tiers_set = {item["tier"] for item in value}
        expected_tiers = {1, 2, 3, 4, 5}
        if tiers_set != expected_tiers:
            raise serializers.ValidationError(
                "Os tiers devem conter exatamente os niveis 1, 2, 3, 4 e 5."
            )

        return sorted(value, key=lambda item: item["tier"])

    def validate(self, attrs):
        criterion = attrs["criterion"]
        tiers = attrs["tiers"]
        previous_value = -1 if is_percentage_based_criterion(criterion) else 0

        for item in tiers:
            required_value = item["required_value"]

            if is_percentage_based_criterion(criterion):
                if required_value > 100:
                    raise serializers.ValidationError(
                        {
                            "tiers": (
                                "Para este criterio, required_value deve ficar entre 0 e 100 (%)."
                            )
                        }
                    )
            elif required_value <= 0:
                raise serializers.ValidationError(
                    {
                        "tiers": (
                            "Para este criterio, required_value deve ser maior que zero."
                        )
                    }
                )

            if required_value <= previous_value:
                raise serializers.ValidationError(
                    {
                        "tiers": (
                            "required_value deve ser estritamente crescente do tier 1 ao 5."
                        )
                    }
                )
            previous_value = required_value

        if is_percentage_based_criterion(criterion):
            if tiers[-1]["required_value"] != 100:
                raise serializers.ValidationError(
                    {
                        "tiers": (
                            "Para criterios percentuais, o tier 5 deve ser 100."
                        )
                    }
                )

        return attrs


class LeaderboardBadgeSerializer(serializers.Serializer):
    game_id = serializers.IntegerField()
    game_name = serializers.CharField()
    criterion = serializers.CharField()
    criterion_label = serializers.CharField(required=False, allow_blank=True)
    value_mode = serializers.CharField(required=False, allow_blank=True)
    required_value = serializers.IntegerField(required=False, allow_null=True)
    tier = serializers.IntegerField()
    image_url = serializers.CharField()
    unlocked_at = serializers.DateTimeField()


# --- Serializers de Ranking (Vindo da feature/API_Ranking) ---

class LeaderboardEntrySerializer(serializers.Serializer):
    position = serializers.IntegerField()
    user_id = serializers.IntegerField()
    name = serializers.CharField()
    avatar_url = serializers.CharField(required=False, allow_blank=True)
    total_points = serializers.IntegerField()
    missions_completed = serializers.IntegerField()
    scope = serializers.CharField()
    game_id = serializers.IntegerField(allow_null=True, required=False)
    game_name = serializers.CharField(allow_blank=True, required=False)
    tier = serializers.CharField(required=False, allow_blank=True)
    nivel = serializers.CharField(required=False, allow_blank=True)
    badges = LeaderboardBadgeSerializer(many=True, required=False)


class UserBadgeUnlockSerializer(serializers.ModelSerializer):
    game_id = serializers.IntegerField(source="badge_config.game.id", read_only=True)
    game_name = serializers.CharField(source="badge_config.game.name", read_only=True)
    criterion = serializers.CharField(source="badge_config.criterion", read_only=True)
    badge_config_id = serializers.IntegerField(source="badge_config.id", read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = UserBadgeUnlock
        fields = [
            "id",
            "badge_config_id",
            "game_id",
            "game_name",
            "criterion",
            "tier",
            "unlocked_at",
            "image_url",
        ]

    def get_image_url(self, obj):
        request = self.context.get("request")
        image_path = f"/tier{obj.tier}.png"
        if request is None:
            return image_path
        return request.build_absolute_uri(image_path)

# --- Serializers de Trilha e Histórico (Vindo da dev) ---

class TrailMissionSerializer(serializers.Serializer):
    id = serializers.IntegerField(source='mission.id')
    title = serializers.CharField(source='mission.title')
    description = serializers.CharField(source='mission.description')
    mission_type = serializers.CharField(source='mission.mission_type')
    icon = serializers.CharField(source='mission.icon')
    order = serializers.IntegerField(source='mission.order')
    points_value = serializers.IntegerField(source='mission.points_value')
    points_earned = serializers.IntegerField(default=0)
    status = serializers.CharField()
    stars_earned = serializers.IntegerField(default=0)
    stars_total = serializers.IntegerField(default=3)
    completed_at = serializers.DateTimeField(allow_null=True, required=False)

class CourseTrailSerializer(serializers.Serializer):
    course = serializers.SerializerMethodField()
    missions = TrailMissionSerializer(many=True)
    summary = serializers.SerializerMethodField()
    
    def get_course(self, obj):
        game = obj.get('game')
        progress = obj.get('progress')
        return {
            'id': game.id,
            'name': game.name,
            'category': game.category,
            'description': game.description,
            'image_url': game.image_url.url if game.image_url else None,
            'user_progress_percentage': progress.progress_percentage if progress else 0
        }
    
    def get_summary(self, obj):
        missions = obj.get('missions', [])
        earned_points = sum(
            m.get('points_earned', 0)
            for m in missions
            if m.get('status') == 'completed'
        )
        return {
            'total_missions': len(missions),
            'completed_missions': sum(1 for m in missions if m.get('status') == 'completed'),
            'total_points': sum(m['mission'].points_value for m in missions),
            'earned_points': earned_points
        }

class PlayerHistorySerializer(serializers.Serializer):
    games = GameProgressSerializer(many=True)
    missions = MissionCompletionsSerializer(many=True)
