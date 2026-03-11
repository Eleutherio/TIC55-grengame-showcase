from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[("admin", "Administrador"), ("user", "Usuário")],
                default="user",
                max_length=20,
                verbose_name="Papel no sistema",
            ),
        ),
    ]
