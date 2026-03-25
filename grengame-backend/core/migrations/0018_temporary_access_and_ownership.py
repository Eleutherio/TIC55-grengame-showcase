from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0017_badgeconfig_badgetierrule_userbadgeunlock_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="is_temporary_account",
            field=models.BooleanField(default=False, verbose_name="Conta temporaria"),
        ),
        migrations.AddField(
            model_name="user",
            name="temporary_expires_at",
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name="Expira em",
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="created_by_temporary_admin",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="temporary_managed_users",
                to=settings.AUTH_USER_MODEL,
                verbose_name="Criado por admin temporario",
            ),
        ),
        migrations.AddField(
            model_name="game",
            name="created_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="games_created",
                to=settings.AUTH_USER_MODEL,
                verbose_name="Criado por",
            ),
        ),
        migrations.AddField(
            model_name="mission",
            name="created_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="missions_created",
                to=settings.AUTH_USER_MODEL,
                verbose_name="Criada por",
            ),
        ),
    ]
