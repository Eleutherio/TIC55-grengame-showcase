from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0019_alter_user_email"),
    ]

    operations = [
        migrations.AlterField(
            model_name="game",
            name="created_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="games_created",
                to=settings.AUTH_USER_MODEL,
                verbose_name="Criado por",
            ),
        ),
        migrations.AlterField(
            model_name="mission",
            name="created_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="missions_created",
                to=settings.AUTH_USER_MODEL,
                verbose_name="Criada por",
            ),
        ),
    ]

