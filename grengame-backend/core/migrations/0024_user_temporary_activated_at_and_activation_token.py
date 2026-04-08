from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0023_gamificationlevel"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="temporary_activated_at",
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name="Ativada em",
            ),
        ),
        migrations.CreateModel(
            name="TemporaryAccessActivationToken",
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
                ("token", models.CharField(max_length=6)),
                (
                    "activation_session_token",
                    models.CharField(blank=True, max_length=36, null=True),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField()),
                ("is_used", models.BooleanField(default=False)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "core_temporaryaccessactivationtoken",
            },
        ),
    ]
