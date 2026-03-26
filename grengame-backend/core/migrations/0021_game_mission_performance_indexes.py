from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0020_alter_game_mission_created_by_on_delete"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="game",
            index=models.Index(fields=["updated_at"], name="idx_course_updated_at"),
        ),
        migrations.AddIndex(
            model_name="game",
            index=models.Index(
                fields=["created_by", "updated_at"],
                name="idx_course_owner_updated",
            ),
        ),
        migrations.AddIndex(
            model_name="mission",
            index=models.Index(
                fields=["game", "is_active"],
                name="idx_mission_game_active",
            ),
        ),
        migrations.AddIndex(
            model_name="mission",
            index=models.Index(
                fields=["created_by", "updated_at"],
                name="idx_mission_owner_updated",
            ),
        ),
    ]

