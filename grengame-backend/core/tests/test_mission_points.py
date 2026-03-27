import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from core.models import Game, Mission, MissionCompletions, WordleHintUsage

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def create_user(db):
    def make_user(email='test@example.com', password='senha123', **kwargs):
        username = email.split('@')[0]
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=kwargs.get('first_name', 'Test'),
            last_name=kwargs.get('last_name', 'User'),
            role=kwargs.get('role', 'user')
        )
        return user
    return make_user


@pytest.fixture
def authenticated_client(api_client, create_user):
    def _authenticated_client(user=None):
        if user is None:
            user = create_user()
        api_client.force_authenticate(user=user)
        return api_client, user
    return _authenticated_client


@pytest.fixture
def create_game(db):
    def make_game(name='Curso Teste'):
        return Game.objects.create(
            name=name,
            description='Descrição do curso',
            category='Categoria'
        )
    return make_game


@pytest.fixture
def create_quiz_mission(db, create_game):
    def make_quiz(points=100, num_questions=4):
        game = create_game()
        questions = [
            {
                "question": f"Pergunta {i+1}",
                "options": ["Opção A", "Opção B", "Opção C", "Opção D"],
                "correct_answer": 0
            }
            for i in range(num_questions)
        ]
        
        mission = Mission.objects.create(
            game=game,
            title='Quiz Teste',
            description='Teste de quiz',
            mission_type='quiz',
            points_value=points,
            order=1,
            is_active=True,
            content_data={'questions': questions}
        )
        return mission
    return make_quiz


@pytest.fixture
def create_wordle_mission(db, create_game):
    def make_wordle(points=100, word='TESTE'):
        game = create_game()
        mission = Mission.objects.create(
            game=game,
            title='Wordle Teste',
            description='Teste de wordle',
            mission_type='game',
            points_value=points,
            order=2,
            is_active=True,
            content_data={'word': word, 'max_attempts': 6}
        )
        return mission
    return make_wordle


@pytest.fixture
def create_video_mission(db, create_game):
    def make_video(points=50):
        game = create_game()
        mission = Mission.objects.create(
            game=game,
            title='Vídeo Teste',
            description='Teste de vídeo',
            mission_type='video',
            points_value=points,
            order=1,
            is_active=True,
            content_data={'video_url': 'https://youtube.com/watch?v=test'}
        )
        return mission
    return make_video


# ========== TESTES DE QUIZ ==========

@pytest.mark.django_db
class TestQuizPoints:
    
    def test_quiz_all_correct_full_points(self, authenticated_client, create_quiz_mission):
        """Quiz com todas respostas corretas = pontos completos"""
        client, user = authenticated_client()
        mission = create_quiz_mission(points=100, num_questions=4)
        
        # Iniciar missão
        client.post(f'/auth/missoes/{mission.id}/iniciar/')
        
        # Validar com todas corretas
        response = client.post(
            f'/auth/missoes/{mission.id}/validar/',
            {'answers': [0, 0, 0, 0]},  # Todas corretas
            format='json'
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['success'] is True
        assert response.data['points_earned'] == 100
        assert response.data['correct_answers'] == 4
        assert response.data['total_questions'] == 4
        
        # Verificar no banco
        completion = MissionCompletions.objects.get(user=user, mission=mission)
        assert completion.points_earned == 100
        assert completion.status == 'completed'
    
    def test_quiz_partial_correct_proportional_points(self, authenticated_client, create_quiz_mission):
        """Quiz com 3/4 corretas = 75 pontos (proporcional)"""
        client, user = authenticated_client()
        mission = create_quiz_mission(points=100, num_questions=4)
        
        client.post(f'/auth/missoes/{mission.id}/iniciar/')
        
        # 3 corretas, 1 errada
        response = client.post(
            f'/auth/missoes/{mission.id}/validar/',
            {'answers': [0, 0, 0, 1]},  # Última errada
            format='json'
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['success'] is False  # Não acertou todas
        assert response.data['points_earned'] == 75  # 3/4 * 100
        assert response.data['correct_answers'] == 3
        
        # Verificar no banco
        completion = MissionCompletions.objects.get(user=user, mission=mission)
        assert completion.points_earned == 0  # Não completou (só completa com 100%)
        assert completion.status == 'in_progress'
    
    def test_quiz_half_correct_half_points(self, authenticated_client, create_quiz_mission):
        """Quiz com 2/4 corretas = 50 pontos"""
        client, user = authenticated_client()
        mission = create_quiz_mission(points=100, num_questions=4)
        
        client.post(f'/auth/missoes/{mission.id}/iniciar/')
        
        response = client.post(
            f'/auth/missoes/{mission.id}/validar/',
            {'answers': [0, 0, 1, 1]},  # 2 corretas, 2 erradas
            format='json'
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['points_earned'] == 50  # 2/4 * 100
        assert response.data['correct_answers'] == 2
        
        completion = MissionCompletions.objects.get(user=user, mission=mission)
        assert completion.points_earned == 0  # Não completou
        assert completion.status == 'in_progress'
    
    def test_quiz_no_correct_zero_points(self, authenticated_client, create_quiz_mission):
        """Quiz com 0/4 corretas = 0 pontos"""
        client, user = authenticated_client()
        mission = create_quiz_mission(points=100, num_questions=4)
        
        client.post(f'/auth/missoes/{mission.id}/iniciar/')
        
        response = client.post(
            f'/auth/missoes/{mission.id}/validar/',
            {'answers': [1, 1, 1, 1]},  # Todas erradas
            format='json'
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['points_earned'] == 0
        assert response.data['correct_answers'] == 0
    
    def test_quiz_cannot_complete_twice(self, authenticated_client, create_quiz_mission):
        """Não pode completar quiz duas vezes"""
        client, user = authenticated_client()
        mission = create_quiz_mission(points=100, num_questions=4)
        
        client.post(f'/auth/missoes/{mission.id}/iniciar/')
        
        # Primeira vez
        response1 = client.post(
            f'/auth/missoes/{mission.id}/validar/',
            {'answers': [0, 0, 0, 0]},
            format='json'
        )
        assert response1.status_code == status.HTTP_200_OK
        assert response1.data['points_earned'] == 100
        
        # Segunda vez
        response2 = client.post(
            f'/auth/missoes/{mission.id}/validar/',
            {'answers': [0, 0, 0, 0]},
            format='json'
        )
        assert response2.status_code == status.HTTP_400_BAD_REQUEST
        assert 'já completou' in response2.data['error'].lower()


# ========== TESTES DE WORDLE ==========

@pytest.mark.django_db
class TestWordlePoints:
    
    def test_wordle_correct_word_full_points(self, authenticated_client, create_wordle_mission):
        """Wordle com palavra correta = pontos completos"""
        client, user = authenticated_client()
        mission = create_wordle_mission(points=100, word='TESTE')
        
        client.post(f'/auth/missoes/{mission.id}/iniciar/')
        
        response = client.post(
            f'/auth/missoes/{mission.id}/validar/',
            {'word': 'TESTE'},
            format='json'
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['success'] is True
        assert response.data['points_earned'] == 100
        
        completion = MissionCompletions.objects.get(user=user, mission=mission)
        assert completion.points_earned == 100
        assert completion.status == 'completed'
    
    def test_wordle_incorrect_word_zero_points(self, authenticated_client, create_wordle_mission):
        """Wordle com palavra errada = 0 pontos"""
        client, user = authenticated_client()
        mission = create_wordle_mission(points=100, word='TESTE')
        
        client.post(f'/auth/missoes/{mission.id}/iniciar/')
        
        response = client.post(
            f'/auth/missoes/{mission.id}/validar/',
            {'word': 'ERROS'},
            format='json'
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['success'] is False
        assert response.data['points_earned'] == 0
        
        completion = MissionCompletions.objects.get(user=user, mission=mission)
        assert completion.points_earned == 0
        assert completion.status == 'in_progress'
    
    def test_wordle_case_insensitive(self, authenticated_client, create_wordle_mission):
        """Wordle não é case-sensitive"""
        client, user = authenticated_client()
        mission = create_wordle_mission(points=100, word='TESTE')
        
        client.post(f'/auth/missoes/{mission.id}/iniciar/')
        
        response = client.post(
            f'/auth/missoes/{mission.id}/validar/',
            {'word': 'teste'},  # minúsculo
            format='json'
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['success'] is True
        assert response.data['points_earned'] == 100
    
    def test_wordle_cannot_complete_twice(self, authenticated_client, create_wordle_mission):
        """Não pode completar wordle duas vezes"""
        client, user = authenticated_client()
        mission = create_wordle_mission(points=100, word='TESTE')
        
        client.post(f'/auth/missoes/{mission.id}/iniciar/')
        
        # Primeira vez
        response1 = client.post(
            f'/auth/missoes/{mission.id}/validar/',
            {'word': 'TESTE'},
            format='json'
        )
        assert response1.status_code == status.HTTP_200_OK
        assert response1.data['points_earned'] == 100
        
        # Segunda vez
        response2 = client.post(
            f'/auth/missoes/{mission.id}/validar/',
            {'word': 'TESTE'},
            format='json'
        )
        assert response2.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestWordleHintsCost:

    def test_first_hint_is_free_and_second_costs_points(
        self,
        authenticated_client,
        create_wordle_mission,
    ):
        client, user = authenticated_client()
        mission = create_wordle_mission(points=100, word='CICLO')
        mission.content_data = {
            'word': 'CICLO',
            'max_attempts': 6,
            'hints': ['Começa com C', 'Tem duas vogais'],
        }
        mission.save(update_fields=['content_data'])

        client.post(f'/auth/missoes/{mission.id}/iniciar/')
        client.post(
            f'/auth/missoes/{mission.id}/validar/',
            {'word': 'CICLO'},
            format='json',
        )

        first_hint = client.post(
            f'/auth/missoes/{mission.id}/wordle/hints/use/',
            {'hint_index': 0},
            format='json',
        )
        assert first_hint.status_code == status.HTTP_200_OK
        assert first_hint.data['points_charged'] == 0

        second_hint = client.post(
            f'/auth/missoes/{mission.id}/wordle/hints/use/',
            {'hint_index': 1},
            format='json',
        )
        assert second_hint.status_code == status.HTTP_200_OK
        assert second_hint.data['points_charged'] == 10

        usages = WordleHintUsage.objects.filter(user=user, mission=mission).order_by('hint_index')
        assert usages.count() == 2
        assert usages[0].is_free is True
        assert usages[1].points_spent == 10

        stats_response = client.get('/auth/me/stats/')
        assert stats_response.status_code == status.HTTP_200_OK
        assert stats_response.data['total_xp'] == 90

    def test_second_paid_hint_requires_available_points(
        self,
        authenticated_client,
        create_wordle_mission,
    ):
        client, user = authenticated_client()
        mission = create_wordle_mission(points=5, word='CICLO')
        mission.content_data = {
            'word': 'CICLO',
            'max_attempts': 6,
            'hints': ['Começa com C', 'Termina com O'],
        }
        mission.save(update_fields=['content_data'])

        client.post(f'/auth/missoes/{mission.id}/iniciar/')
        client.post(
            f'/auth/missoes/{mission.id}/validar/',
            {'word': 'CICLO'},
            format='json',
        )

        first_hint = client.post(
            f'/auth/missoes/{mission.id}/wordle/hints/use/',
            {'hint_index': 0},
            format='json',
        )
        assert first_hint.status_code == status.HTTP_200_OK
        assert first_hint.data['points_charged'] == 0

        second_hint = client.post(
            f'/auth/missoes/{mission.id}/wordle/hints/use/',
            {'hint_index': 1},
            format='json',
        )
        assert second_hint.status_code == status.HTTP_400_BAD_REQUEST
        assert 'insuficientes' in second_hint.data['error'].lower()


# ========== TESTES DE VIDEO E LEITURA ==========

@pytest.mark.django_db
class TestVideoLeituraPoints:
    
    def test_video_completion_full_points(self, authenticated_client, create_video_mission):
        """Vídeo completado = pontos completos"""
        client, user = authenticated_client()
        mission = create_video_mission(points=50)
        
        client.post(f'/auth/missoes/{mission.id}/iniciar/')
        
        response = client.patch(f'/auth/missoes/{mission.id}/completar/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['points_awarded'] == 50
        
        completion = MissionCompletions.objects.get(user=user, mission=mission)
        assert completion.points_earned == 50
        assert completion.status == 'completed'
    
    def test_video_cannot_complete_twice(self, authenticated_client, create_video_mission):
        """Não pode completar vídeo duas vezes"""
        client, user = authenticated_client()
        mission = create_video_mission(points=50)
        
        client.post(f'/auth/missoes/{mission.id}/iniciar/')
        
        # Primeira vez
        response1 = client.patch(f'/auth/missoes/{mission.id}/completar/')
        assert response1.status_code == status.HTTP_200_OK
        assert response1.data['points_awarded'] == 50
        
        # Segunda vez
        response2 = client.patch(f'/auth/missoes/{mission.id}/completar/')
        assert response2.status_code == status.HTTP_400_BAD_REQUEST
        assert 'completou' in response2.data['error'].lower()
    
    def test_must_start_before_completing(self, authenticated_client, create_video_mission):
        """Precisa iniciar antes de completar"""
        client, user = authenticated_client()
        mission = create_video_mission(points=50)
        
        # Tentar completar sem iniciar
        response = client.patch(f'/auth/missoes/{mission.id}/completar/')
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert 'iniciou' in response.data['error'].lower()
