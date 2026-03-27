# Generated manually on 2025-12-17

import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_mission_enrollment_usermission'),
    ]

    operations = [
        # Renomear Course para Game (mantém a tabela core_course)
        migrations.RenameModel(
            old_name='Course',
            new_name='Game',
        ),
        
        # Renomear CourseProgress para GameProgress (mantém a tabela core_courseprogress)
        migrations.RenameModel(
            old_name='CourseProgress',
            new_name='GameProgress',
        ),
        
        # Renomear UserMission para MissionCompletions (mantém a tabela core_usermission)
        migrations.RenameModel(
            old_name='UserMission',
            new_name='MissionCompletions',
        ),
        
        migrations.AddField(
            model_name='game',
            name='image_url',
            field=models.CharField(blank=True, max_length=255, null=True, verbose_name='URL da Imagem'),
        ),
        migrations.AddField(
            model_name='game',
            name='is_active',
            field=models.BooleanField(default=True, verbose_name='Ativo'),
        ),
        
        migrations.AddField(
            model_name='gameprogress',
            name='game_points',
            field=models.IntegerField(default=0, verbose_name='Pontos do Curso'),
        ),

        # Remover constraint legada antes do rename de campo para evitar
        # falha no SQLite ao reconstruir tabela temporária (NewGameProgress).
        migrations.RemoveConstraint(
            model_name='gameprogress',
            name='unique_user_course_progress',
        ),
        
        migrations.RenameField(
            model_name='gameprogress',
            old_name='course',
            new_name='game',
        ),
        
        migrations.AddField(
            model_name='missioncompletions',
            name='points_earned',
            field=models.IntegerField(default=0, validators=[django.core.validators.MinValueValidator(0)], verbose_name='Pontos Ganhos'),
        ),
        migrations.AddField(
            model_name='missioncompletions',
            name='status',
            field=models.CharField(
                choices=[('completed', 'Completa'), ('in_progress', 'Em Progresso'), ('failed', 'Falhou')],
                default='completed',
                max_length=20,
                verbose_name='Status'
            ),
        ),
        
        # Remover campos antigos de User
        migrations.RemoveField(
            model_name='user',
            name='bio',
        ),
        migrations.RemoveField(
            model_name='user',
            name='nivel',
        ),
        migrations.RemoveField(
            model_name='user',
            name='pontos',
        ),
        migrations.RemoveField(
            model_name='user',
            name='avatar',
        ),
        
        migrations.AddField(
            model_name='user',
            name='avatar_url',
            field=models.CharField(blank=True, max_length=255, null=True, verbose_name='Avatar URL'),
        ),
        
        migrations.RemoveField(
            model_name='mission',
            name='category',
        ),
        migrations.RemoveField(
            model_name='mission',
            name='status',
        ),
        
        migrations.RenameField(
            model_name='mission',
            old_name='points',
            new_name='points_value',
        ),
        
        migrations.AddField(
            model_name='mission',
            name='is_active',
            field=models.BooleanField(default=True, verbose_name='Ativa'),
        ),
        
        migrations.AddField(
            model_name='mission',
            name='game',
            field=models.ForeignKey(
                default=1,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='missions',
                to='core.game',
                verbose_name='Game'
            ),
            preserve_default=False,
        ),
        
        migrations.DeleteModel(
            name='Enrollment',
        ),
    ]
