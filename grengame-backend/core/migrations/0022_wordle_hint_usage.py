from django.db import migrations, models
import django.core.validators
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0021_game_mission_performance_indexes"),
    ]

    operations = [
        migrations.CreateModel(
            name="WordleHintUsage",
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
                ("hint_index", models.PositiveIntegerField(verbose_name="Índice da dica")),
                (
                    "revealed_hint",
                    models.TextField(
                        blank=True,
                        default="",
                        verbose_name="Dica revelada",
                    ),
                ),
                (
                    "points_spent",
                    models.IntegerField(
                        default=0,
                        validators=[django.core.validators.MinValueValidator(0)],
                        verbose_name="Pontos consumidos",
                    ),
                ),
                ("is_free", models.BooleanField(default=False, verbose_name="Uso gratuito")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Criado em")),
                (
                    "mission",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="wordle_hint_usages",
                        to="core.mission",
                        verbose_name="Missão",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="wordle_hint_usages",
                        to="core.user",
                        verbose_name="Usuário",
                    ),
                ),
            ],
            options={
                "verbose_name": "Uso de dica Wordle",
                "verbose_name_plural": "Usos de dicas Wordle",
                "ordering": ["-created_at"],
                "db_table": "core_wordlehintusage",
            },
        ),
        migrations.AddConstraint(
            model_name="wordlehintusage",
            constraint=models.UniqueConstraint(
                fields=("user", "mission", "hint_index"),
                name="unique_wordle_hint_usage",
            ),
        ),
        migrations.AddIndex(
            model_name="wordlehintusage",
            index=models.Index(fields=["user", "mission"], name="idx_hint_user_mission"),
        ),
        migrations.AddIndex(
            model_name="wordlehintusage",
            index=models.Index(fields=["user", "created_at"], name="idx_hint_user_created"),
        ),
    ]
