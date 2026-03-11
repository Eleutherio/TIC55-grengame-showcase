from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0011_alter_leaderboardentry_constraints"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="avatar_url",
            field=models.CharField(
                blank=True,
                null=True,
                max_length=512,
                verbose_name="Avatar URL",
                validators=[
                    django.core.validators.RegexValidator(
                        regex=r"^(https?://[^\s]+|/?[A-Za-z0-9._/-]+\.(?:png|jpe?g|webp))$",
                        message=(
                            "Forneca uma URL http(s) ou caminho relativo terminando em "
                            "png/jpg/jpeg/webp."
                        ),
                    )
                ],
            ),
        ),
    ]
