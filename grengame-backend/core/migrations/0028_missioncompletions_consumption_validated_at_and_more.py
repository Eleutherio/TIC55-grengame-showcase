from django.db import migrations, models


def backfill_mission_completion_timestamps(apps, schema_editor):
    MissionCompletions = apps.get_model("core", "MissionCompletions")

    for completion in MissionCompletions.objects.all().iterator():
        update_fields = []

        if completion.started_at is None:
            completion.started_at = completion.completed_at
            update_fields.append("started_at")

        if completion.status != "completed" and completion.completed_at is not None:
            completion.completed_at = None
            update_fields.append("completed_at")

        if update_fields:
            completion.save(update_fields=update_fields)


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0027_hash_legacy_session_tokens"),
    ]

    operations = [
        migrations.AddField(
            model_name="missioncompletions",
            name="consumption_validated_at",
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name="Consumo validado em",
            ),
        ),
        migrations.AddField(
            model_name="missioncompletions",
            name="started_at",
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name="Iniciada em",
            ),
        ),
        migrations.AlterField(
            model_name="missioncompletions",
            name="completed_at",
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name="Concluída em",
            ),
        ),
        migrations.RunPython(
            backfill_mission_completion_timestamps,
            migrations.RunPython.noop,
        ),
    ]
