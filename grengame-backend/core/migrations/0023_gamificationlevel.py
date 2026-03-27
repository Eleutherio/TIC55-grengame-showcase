from django.db import migrations, models
import django.core.validators


def seed_default_gamification_levels(apps, schema_editor):
    GamificationLevel = apps.get_model("core", "GamificationLevel")
    defaults = [
        {"position": 1, "name": "Bronze", "min_xp": 0, "min_completed_games": 0},
        {"position": 2, "name": "Prata", "min_xp": 800, "min_completed_games": 3},
        {"position": 3, "name": "Ouro", "min_xp": 2500, "min_completed_games": 5},
        {"position": 4, "name": "Platina", "min_xp": 5500, "min_completed_games": 8},
        {"position": 5, "name": "Diamante", "min_xp": 10000, "min_completed_games": 16},
    ]

    for level in defaults:
        GamificationLevel.objects.update_or_create(
            position=level["position"],
            defaults={
                "name": level["name"],
                "min_xp": level["min_xp"],
                "min_completed_games": level["min_completed_games"],
                "is_active": True,
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0022_wordle_hint_usage"),
    ]

    operations = [
        migrations.CreateModel(
            name="GamificationLevel",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "name",
                    models.CharField(
                        max_length=32,
                        unique=True,
                        verbose_name="Nome do nivel",
                    ),
                ),
                (
                    "position",
                    models.PositiveSmallIntegerField(
                        unique=True,
                        validators=[django.core.validators.MinValueValidator(1)],
                        verbose_name="Posicao",
                    ),
                ),
                (
                    "min_xp",
                    models.IntegerField(
                        default=0,
                        validators=[django.core.validators.MinValueValidator(0)],
                        verbose_name="XP minimo",
                    ),
                ),
                (
                    "min_completed_games",
                    models.IntegerField(
                        default=0,
                        validators=[django.core.validators.MinValueValidator(0)],
                        verbose_name="Games concluidos minimos",
                    ),
                ),
                ("is_active", models.BooleanField(default=True, verbose_name="Ativo")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Criado em")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Atualizado em")),
            ],
            options={
                "verbose_name": "Nivel de Gamificacao",
                "verbose_name_plural": "Niveis de Gamificacao",
                "ordering": ["position", "min_xp", "id"],
            },
        ),
        migrations.AddConstraint(
            model_name="gamificationlevel",
            constraint=models.CheckConstraint(
                check=models.Q(min_xp__gte=0),
                name="chk_gamif_level_min_xp",
            ),
        ),
        migrations.AddConstraint(
            model_name="gamificationlevel",
            constraint=models.CheckConstraint(
                check=models.Q(min_completed_games__gte=0),
                name="chk_gamif_level_min_games",
            ),
        ),
        migrations.AddIndex(
            model_name="gamificationlevel",
            index=models.Index(
                fields=["is_active", "position"],
                name="idx_gamif_level_active_pos",
            ),
        ),
        migrations.RunPython(
            seed_default_gamification_levels,
            migrations.RunPython.noop,
        ),
    ]
