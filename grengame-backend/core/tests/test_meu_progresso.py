import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from core.models import Game, Mission, GameProgress, MissionCompletions
from core.gamification_utils import update_game_progress

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username='testuser',
        email='test@grendene.com.br',
        password='testpass123',
        first_name='Test',
        last_name='User'
    )


@pytest.fixture
def authenticated_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def game(db):
    return Game.objects.create(
        name='Sustentabilidade na Grendene',
        description='Curso sobre sustentabilidade',
        category='Meio Ambiente',
        is_active=True
    )


@pytest.fixture
def missions(db, game):
    """Cria 3 missões ativas, cada uma valendo 100 pontos"""
    return [
        Mission.objects.create(
            game=game,
            title=f'Missão {i+1}',
            description=f'Descrição da missão {i+1}',
            mission_type='video',
            order=i,
            points_value=100,
            content_data={'video_url': f'http://example.com/video{i+1}.mp4'},
            is_active=True
        ) for i in range(3)
    ]


@pytest.mark.django_db
class TestUpdateGameProgress:
    def test_create_game_progress_if_not_exists(self, user, game):
        assert not GameProgress.objects.filter(user=user, game=game).exists()
        
        game_progress = update_game_progress(user, game)
        
        assert GameProgress.objects.filter(user=user, game=game).exists()
        assert game_progress.progress_percentage == 0
        assert game_progress.completed_at is None
    
    def test_calculate_progress_percentage_correctly(self, user, game, missions):
        # Completar 1 de 3 missões (33%)
        MissionCompletions.objects.create(
            user=user,
            mission=missions[0],
            status='completed',
            points_earned=100
        )
        
        game_progress = update_game_progress(user, game)
        
        assert game_progress.progress_percentage == 33
        assert game_progress.completed_at is None
    
    def test_mark_completed_at_when_100_percent(self, user, game, missions):
        # Completar todas as 3 missões
        for mission in missions:
            MissionCompletions.objects.create(
                user=user,
                mission=mission,
                status='completed',
                points_earned=100
            )
        
        game_progress = update_game_progress(user, game)
        
        assert game_progress.progress_percentage == 100
        assert game_progress.completed_at is not None
    
    def test_clear_completed_at_when_below_100(self, user, game, missions):
        # Completar todas as missões
        completions = []
        for mission in missions:
            completion = MissionCompletions.objects.create(
                user=user,
                mission=mission,
                status='completed',
                points_earned=100
            )
            completions.append(completion)
        
        game_progress = update_game_progress(user, game)
        assert game_progress.completed_at is not None
        
        # Desativar uma missão (simula recálculo)
        missions[0].is_active = False
        missions[0].save()
        
        game_progress = update_game_progress(user, game)
        assert game_progress.progress_percentage == 100  # 2 de 2 missões ativas
        # completed_at não deve ser limpo se ainda está 100%
        
        # Reativar a missão mas remover completion
        missions[0].is_active = True
        missions[0].save()
        completions[0].delete()
        
        game_progress = update_game_progress(user, game)
        assert game_progress.progress_percentage == 66  # 2 de 3
        assert game_progress.completed_at is None


@pytest.mark.django_db
class TestGameProgressSerializer:
    
    def test_calculate_game_points_from_completed_missions(self, authenticated_client, user, game, missions):
        # Completar 2 missões
        MissionCompletions.objects.create(user=user, mission=missions[0], status='completed', points_earned=100)
        MissionCompletions.objects.create(user=user, mission=missions[1], status='completed', points_earned=100)
        
        # Criar progresso
        update_game_progress(user, game)
        
        # Buscar via API
        response = authenticated_client.get('/auth/progress/list/')
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['game_points'] == 200
    
    def test_game_points_zero_when_no_completions(self, authenticated_client, user, game):
        GameProgress.objects.create(user=user, game=game, progress_percentage=0)
        
        response = authenticated_client.get('/auth/progress/list/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data[0]['game_points'] == 0


@pytest.mark.django_db
class TestMissionCompletionAutoUpdate:
    
    def test_complete_mission_updates_game_progress(self, authenticated_client, user, game, missions):
        # Iniciar missão
        MissionCompletions.objects.create(
            user=user,
            mission=missions[0],
            status='in_progress',
            points_earned=0
        )
        
        # Completar missão via API
        response = authenticated_client.patch(f'/auth/missoes/{missions[0].id}/completar/')
        
        assert response.status_code == status.HTTP_200_OK
        
        # Verificar que progresso foi atualizado
        game_progress = GameProgress.objects.get(user=user, game=game)
        assert game_progress.progress_percentage == 33  # 1 de 3
    
    def test_complete_last_mission_marks_game_completed(self, authenticated_client, user, game, missions):
        # Completar 2 primeiras missões
        for mission in missions[:2]:
            MissionCompletions.objects.create(user=user, mission=mission, status='completed', points_earned=100)
        update_game_progress(user, game)
        
        # Iniciar e completar última missão
        MissionCompletions.objects.create(user=user, mission=missions[2], status='in_progress', points_earned=0)
        
        response = authenticated_client.patch(f'/auth/missoes/{missions[2].id}/completar/')
        
        assert response.status_code == status.HTTP_200_OK
        
        game_progress = GameProgress.objects.get(user=user, game=game)
        assert game_progress.progress_percentage == 100
        assert game_progress.completed_at is not None


@pytest.mark.django_db
class TestRecalculateProgressEndpoint:
    
    def test_recalculate_all_user_games(self, authenticated_client, user, game, missions):
        # Criar progresso inicial incorreto
        GameProgress.objects.create(user=user, game=game, progress_percentage=50)
        
        # Completar missões (mas progresso está desatualizado)
        for mission in missions:
            MissionCompletions.objects.create(user=user, mission=mission, status='completed', points_earned=100)
        
        # Recalcular
        response = authenticated_client.post('/auth/progress/recalculate/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['games_updated'] == 1
        
        # Verificar que foi corrigido
        game_progress = GameProgress.objects.get(user=user, game=game)
        assert game_progress.progress_percentage == 100
    
    def test_recalculate_returns_zero_if_no_games(self, authenticated_client, user):
        response = authenticated_client.post('/auth/progress/recalculate/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['games_updated'] == 0


@pytest.mark.django_db
class TestUserMeAvatarURL:
    
    def test_avatar_url_complete_when_relative_path(self, authenticated_client, user):
        user.avatar_url = 'avatar123.jpg'
        user.save()
        
        response = authenticated_client.get('/auth/me/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['avatar_url'] is not None
        assert 'http' in response.data['avatar_url']
        assert '/media/' in response.data['avatar_url']
        assert 'avatar123.jpg' in response.data['avatar_url']
    
    def test_avatar_url_unchanged_when_full_url(self, authenticated_client, user):
        full_url = 'https://example.com/avatar.jpg'
        user.avatar_url = full_url
        user.save()
        
        response = authenticated_client.get('/auth/me/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['avatar_url'] == full_url
    
    def test_avatar_url_null_when_not_set(self, authenticated_client, user):
        """Deve retornar null quando usuário não tem avatar"""
        user.avatar_url = None
        user.save()
        
        response = authenticated_client.get('/auth/me/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['avatar_url'] is None


@pytest.mark.django_db
class TestMissionCompletionsListView:
    def test_returns_all_active_missions_with_completion(self, authenticated_client, user, game, missions):
        # Completar primeira missão
        MissionCompletions.objects.create(user=user, mission=missions[0], status='completed', points_earned=100)
        
        response = authenticated_client.get('/auth/missoes/minhas/')
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 3
        
        # Verificar estrutura da resposta
        first_mission = response.data[0]
        assert 'title' in first_mission
        assert 'points_value' in first_mission
        assert 'completion' in first_mission
        
        # Primeira missão completada
        assert first_mission['completion']['completed'] is True
        
        # Outras missões sem completion
        assert response.data[1]['completion'] is None
        assert response.data[2]['completion'] is None
