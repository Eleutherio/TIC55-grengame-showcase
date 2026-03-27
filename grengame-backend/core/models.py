from django.contrib.auth.models import AbstractUser
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator, RegexValidator


def calculate_stars(points_earned, points_value):
    if points_earned >= points_value:
        return 3
    elif points_earned >= points_value * 0.7:
        return 2
    elif points_earned > 0:
        return 1
    return 0


class User(AbstractUser):
    email = models.EmailField(unique=True, verbose_name="E-mail")
    
    ROLE_CHOICES = [
        ("admin", "Administrador"),
        ("user", "Usuário"),
    ]

    # name será derivado de first_name/last_name do AbstractUser
    avatar_url = models.CharField(
        max_length=512,
        blank=True,
        null=True,
        verbose_name="Avatar URL",
        validators=[
            RegexValidator(
                regex=r"^(https?://[^\s]+|/?[A-Za-z0-9._/-]+\.(?:png|jpe?g|webp))$",
                message=(
                    "Forneca uma URL http(s) ou caminho relativo terminando em "
                    "png/jpg/jpeg/webp."
                ),
            )
        ],
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="user", verbose_name="Papel no sistema")
    is_temporary_account = models.BooleanField(default=False, verbose_name="Conta temporaria")
    temporary_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Expira em",
    )
    created_by_temporary_admin = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="temporary_managed_users",
        verbose_name="Criado por admin temporario",
    )
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Criado em")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Atualizado em")
    
    USERNAME_FIELD = 'email'  # Login será feito com email
    REQUIRED_FIELDS = ['username']  # username é obrigatório mas não usado para login

    class Meta:
        verbose_name = "Usuário"
        verbose_name_plural = "Usuários"
        ordering = ['-created_at']

    def __str__(self):
        return self.email


class Game(models.Model):
    name = models.CharField(max_length=100, verbose_name="Nome do Game")
    description = models.TextField(blank=True, verbose_name="Descrição")
    category = models.CharField(max_length=50, blank=True, verbose_name="Categoria")
    image_url = models.ImageField(upload_to='cursos/imagens/', blank=True, null=True, verbose_name="Imagem")
    video_url = models.FileField(upload_to='cursos/videos/', blank=True, null=True, verbose_name="Vídeo")
    banner = models.ImageField(upload_to='cursos/banners/', blank=True, null=True, verbose_name="Banner")
    is_active = models.BooleanField(default=True, verbose_name="Ativo")
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="games_created",
        verbose_name="Criado por",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Criado em")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Atualizado em")

    class Meta:
        verbose_name = "Game"
        verbose_name_plural = "Games"
        ordering = ["-created_at"]
        db_table = "core_course"  # Mantém compatibilidade com tabela existente
        indexes = [
            models.Index(fields=["updated_at"], name="idx_course_updated_at"),
            models.Index(fields=["created_by", "updated_at"], name="idx_course_owner_updated"),
        ]

    def __str__(self):
        return self.name

class GameProgress(models.Model):
    user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        related_name='game_progress',
        verbose_name="Usuário"
    )
    game = models.ForeignKey(
        Game, 
        on_delete=models.CASCADE, 
        related_name='user_progress',
        verbose_name="Game"
    )
    progress_percentage = models.IntegerField(
        default=0,
        verbose_name="Porcentagem de Progresso",
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    game_points = models.IntegerField(
        default=0,
        verbose_name="Pontos do Curso"
    )
    started_at = models.DateTimeField(auto_now_add=True, verbose_name="Iniciado em")
    completed_at = models.DateTimeField(null=True, blank=True, verbose_name="Concluído em")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Atualizado em")

    class Meta:
        verbose_name = "Progresso do Game"
        verbose_name_plural = "Progressos dos Games"
        ordering = ["-started_at"]
        db_table = "core_courseprogress"  # Mantém compatibilidade com tabela existente
        # Constraint única: cada usuário só pode ter um progresso por game
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'game'], 
                name='unique_user_game_progress'
            )
        ]

    def __str__(self):
        return f"{self.user.email} - {self.game.name} ({self.progress_percentage}%)"


class Mission(models.Model):
    MISSION_TYPE_CHOICES = [
        ("video", "Vídeo"),
        ("reading", "Leitura"),
        ("quiz", "Quiz"),
        ("game", "Jogo"),
    ]
    
    ICON_CHOICES = [
        ("play", "Play"),
        ("book", "Livro"),
        ("quiz", "Quiz"),
        ("gamepad", "Controle"),
    ]
    
    game = models.ForeignKey(
        Game,
        on_delete=models.CASCADE,
        related_name='missions',
        verbose_name="Game"
    )
    title = models.CharField(max_length=200, verbose_name="Título")
    description = models.TextField(verbose_name="Descrição")
    mission_type = models.CharField(
        max_length=20,
        choices=MISSION_TYPE_CHOICES,
        default="video",
        verbose_name="Tipo de Missão"
    )
    icon = models.CharField(
        max_length=20,
        choices=ICON_CHOICES,
        default="play",
        verbose_name="Ícone"
    )
    order = models.IntegerField(
        default=0,
        verbose_name="Ordem na Trilha",
        help_text="Ordem de exibição na trilha do curso"
    )
    points_value = models.IntegerField(
        default=0,
        verbose_name="Valor em Pontos",
        validators=[MinValueValidator(0)]
    )
    content_data = models.JSONField(
        blank=True,
        null=True,
        verbose_name="Dados do Conteúdo",
        help_text="Conteúdo específico da missão (vídeo_url, quiz_questions, game_config, etc)"
    )
    is_active = models.BooleanField(default=True, verbose_name="Ativa")
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="missions_created",
        verbose_name="Criada por",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Criado em")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Atualizado em")

    class Meta:
        verbose_name = "Missão"
        verbose_name_plural = "Missões"
        ordering = ["game", "order", "-created_at"]
        unique_together = [['game', 'order']]  # Garante ordem única por curso
        indexes = [
            models.Index(fields=["game", "is_active"], name="idx_mission_game_active"),
            models.Index(fields=["created_by", "updated_at"], name="idx_mission_owner_updated"),
        ]

    def __str__(self):
        return f"{self.title} ({self.game.name})"


class MissionCompletions(models.Model):
    STATUS_CHOICES = [
        ("completed", "Completa"),
        ("in_progress", "Em Progresso"),
        ("failed", "Falhou"),
    ]
    
    user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        related_name='mission_completions',
        verbose_name="Usuário"
    )
    mission = models.ForeignKey(
        Mission, 
        on_delete=models.CASCADE, 
        related_name='completions',
        verbose_name="Missão"
    )
    completed_at = models.DateTimeField(auto_now_add=True, null=True, blank=True, verbose_name="Concluída em")
    points_earned = models.IntegerField(
        default=0,
        verbose_name="Pontos Ganhos",
        validators=[MinValueValidator(0)]
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="completed",
        verbose_name="Status"
    )

    class Meta:
        verbose_name = "Conclusão de Missão"
        verbose_name_plural = "Conclusões de Missões"
        ordering = ["-completed_at"]
        db_table = "core_usermission"  # Mantém compatibilidade com tabela existente
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'mission'], 
                name='unique_user_mission_completion'
            )
        ]

    def __str__(self):
        return f"{self.user.email} - {self.mission.title} ({self.status})"


class WordleHintUsage(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="wordle_hint_usages",
        verbose_name="Usuário",
    )
    mission = models.ForeignKey(
        Mission,
        on_delete=models.CASCADE,
        related_name="wordle_hint_usages",
        verbose_name="Missão",
    )
    hint_index = models.PositiveIntegerField(verbose_name="Índice da dica")
    revealed_hint = models.TextField(blank=True, default="", verbose_name="Dica revelada")
    points_spent = models.IntegerField(
        default=0,
        verbose_name="Pontos consumidos",
        validators=[MinValueValidator(0)],
    )
    is_free = models.BooleanField(default=False, verbose_name="Uso gratuito")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Criado em")

    class Meta:
        verbose_name = "Uso de dica Wordle"
        verbose_name_plural = "Usos de dicas Wordle"
        ordering = ["-created_at"]
        db_table = "core_wordlehintusage"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "mission", "hint_index"],
                name="unique_wordle_hint_usage",
            )
        ]
        indexes = [
            models.Index(fields=["user", "mission"], name="idx_hint_user_mission"),
            models.Index(fields=["user", "created_at"], name="idx_hint_user_created"),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.mission.title} - dica {self.hint_index}"


class GamificationLevel(models.Model):
    name = models.CharField(
        max_length=32,
        unique=True,
        verbose_name="Nome do nivel",
    )
    position = models.PositiveSmallIntegerField(
        unique=True,
        verbose_name="Posicao",
        validators=[MinValueValidator(1)],
    )
    min_xp = models.IntegerField(
        default=0,
        verbose_name="XP minimo",
        validators=[MinValueValidator(0)],
    )
    min_completed_games = models.IntegerField(
        default=0,
        verbose_name="Games concluidos minimos",
        validators=[MinValueValidator(0)],
    )
    is_active = models.BooleanField(default=True, verbose_name="Ativo")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Criado em")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Atualizado em")

    class Meta:
        verbose_name = "Nivel de Gamificacao"
        verbose_name_plural = "Niveis de Gamificacao"
        ordering = ["position", "min_xp", "id"]
        constraints = [
            models.CheckConstraint(
                check=models.Q(min_xp__gte=0),
                name="chk_gamif_level_min_xp",
            ),
            models.CheckConstraint(
                check=models.Q(min_completed_games__gte=0),
                name="chk_gamif_level_min_games",
            ),
        ]
        indexes = [
            models.Index(fields=["is_active", "position"], name="idx_gamif_level_active_pos"),
        ]

    def __str__(self):
        return f"{self.position}. {self.name}"


class LeaderboardEntry(models.Model):
    SCOPE_CHOICES = [
        ("global", "Geral"),
        ("course", "Curso"),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="leaderboard_entries",
        verbose_name="Usuário"
    )
    game = models.ForeignKey(
        Game,
        on_delete=models.CASCADE,
        related_name="leaderboard_entries",
        null=True,
        blank=True,
        verbose_name="Game"
    )
    scope = models.CharField(
        max_length=12,
        choices=SCOPE_CHOICES,
        default="global",
        verbose_name="Escopo do ranking"
    )
    total_points = models.IntegerField(default=0, verbose_name="Pontos totais")
    missions_completed = models.IntegerField(default=0, verbose_name="Missões concluídas")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Criado em")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Atualizado em")

    class Meta:
        verbose_name = "Entrada de Ranking"
        verbose_name_plural = "Entradas de Ranking"
        ordering = ["-total_points", "user_id"]
        constraints = [
            models.UniqueConstraint(
                fields=["scope", "user"],
                condition=models.Q(scope="global"),
                name="unique_leaderboard_global_user",
            ),
            models.UniqueConstraint(
                fields=["scope", "user", "game"],
                condition=models.Q(scope="course"),
                name="unique_leaderboard_course_user_game",
            ),
        ]
        indexes = [
            models.Index(fields=["scope", "game", "-total_points"], name="idx_scope_game_points"),
            models.Index(fields=["scope", "-total_points"], name="idx_scope_points"),
        ]

    def __str__(self):
        target = self.game.name if self.game else "geral"
        return f"{self.user.email} - {target} - {self.total_points} pts"


class BadgeConfig(models.Model):
    CRITERION_CHOICES = [
        ("course_points", "Pontos do Curso"),
        ("perfect_missions", "Missoes Perfeitas"),
        ("active_days", "Dias Ativos"),
    ]

    game = models.ForeignKey(
        Game,
        on_delete=models.CASCADE,
        related_name="badge_configs",
        verbose_name="Game",
    )
    criterion = models.CharField(
        max_length=32,
        choices=CRITERION_CHOICES,
        verbose_name="Criterio",
    )
    is_active = models.BooleanField(default=True, verbose_name="Ativa")
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_badge_configs",
        verbose_name="Criada por",
    )
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_badge_configs",
        verbose_name="Atualizada por",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Criado em")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Atualizado em")

    class Meta:
        verbose_name = "Configuracao de Badge"
        verbose_name_plural = "Configuracoes de Badge"
        ordering = ["game_id", "criterion"]
        constraints = [
            models.UniqueConstraint(
                fields=["game", "criterion"],
                name="unique_badge_config_game_criterion",
            ),
        ]

    def __str__(self):
        return f"{self.game.name} - {self.criterion}"


class BadgeTierRule(models.Model):
    badge_config = models.ForeignKey(
        BadgeConfig,
        on_delete=models.CASCADE,
        related_name="tier_rules",
        verbose_name="Configuracao de Badge",
    )
    tier = models.IntegerField(
        verbose_name="Tier",
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    required_value = models.IntegerField(
        verbose_name="Valor Necessario",
        validators=[MinValueValidator(0)],
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Criado em")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Atualizado em")

    class Meta:
        verbose_name = "Regra por Tier da Badge"
        verbose_name_plural = "Regras por Tier da Badge"
        ordering = ["badge_config_id", "tier"]
        constraints = [
            models.UniqueConstraint(
                fields=["badge_config", "tier"],
                name="unique_badge_tier_rule_config_tier",
            ),
            models.CheckConstraint(
                check=models.Q(tier__gte=1, tier__lte=5),
                name="chk_badge_tier_rule_range",
            ),
            models.CheckConstraint(
                check=models.Q(required_value__gte=0),
                name="chk_badge_tier_rule_required_positive",
            ),
        ]

    def __str__(self):
        return f"{self.badge_config} - Tier {self.tier}"


class UserBadgeUnlock(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="badge_unlocks",
        verbose_name="Usuario",
    )
    badge_config = models.ForeignKey(
        BadgeConfig,
        on_delete=models.CASCADE,
        related_name="user_unlocks",
        verbose_name="Configuracao de Badge",
    )
    tier = models.IntegerField(
        verbose_name="Tier",
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    unlocked_at = models.DateTimeField(auto_now_add=True, verbose_name="Desbloqueada em")

    class Meta:
        verbose_name = "Desbloqueio de Badge do Usuario"
        verbose_name_plural = "Desbloqueios de Badge do Usuario"
        ordering = ["-unlocked_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "badge_config", "tier"],
                name="unique_user_badge_unlock_tier",
            ),
            models.CheckConstraint(
                check=models.Q(tier__gte=1, tier__lte=5),
                name="chk_user_badge_unlock_tier_range",
            ),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.badge_config} - Tier {self.tier}"


class PasswordResetToken(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    token = models.CharField(max_length=6)
    reset_session_token = models.CharField(max_length=36, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    class Meta:
        db_table = "core_passwordresettoken"
