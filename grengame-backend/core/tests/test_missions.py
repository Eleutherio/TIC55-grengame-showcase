import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def create_user(db):
    def make_user(email='test@example.com', password='senha123', role='user', **kwargs):
        username = email.split('@')[0]
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            role=role,
            first_name=kwargs.get('first_name', 'Test'),
            last_name=kwargs.get('last_name', 'User')
        )
        return user
    return make_user


@pytest.fixture
def create_admin(create_user):
    def make_admin(email='admin@example.com'):
        return create_user(email=email, role='admin')
    return make_admin


@pytest.fixture
def authenticated_client(api_client, create_user):
    def _authenticated_client(user=None, is_admin=False):
        if user is None:
            role = 'admin' if is_admin else 'user'
            user = create_user(role=role)
        
        api_client.force_authenticate(user=user)
        return api_client, user
    return _authenticated_client


@pytest.mark.django_db
def test_admin_can_create_mission(authenticated_client, create_admin):
    admin = create_admin()
    client, _ = authenticated_client(user=admin, is_admin=True)
    
    response = client.post('/auth/missoes/', {
        'title': 'Nova Missão',
        'description': 'Descrição',
        'points': 50,
        'category': 'Teste',
        'status': 'ativa'
    })
    
    assert response.status_code == status.HTTP_201_CREATED
    assert response.data['title'] == 'Nova Missão'
    assert response.data['points'] == 50


@pytest.mark.django_db
def test_user_cannot_create_mission(authenticated_client):
    client, user = authenticated_client(is_admin=False)
    
    response = client.post('/auth/missoes/', {
        'title': 'Nova Missão',
        'description': 'Descrição',
        'points': 50
    })
    
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_admin_can_update_mission(authenticated_client, create_admin, create_mission):
    admin = create_admin()
    mission = create_mission()
    client, _ = authenticated_client(user=admin, is_admin=True)
    
    response = client.patch(f'/auth/missoes/{mission.id}/', {
        'title': 'Missão Atualizada',
        'points': 200
    })
    
    assert response.status_code == status.HTTP_200_OK
    assert response.data['title'] == 'Missão Atualizada'
    assert response.data['points'] == 200


@pytest.mark.django_db
def test_admin_can_delete_mission(authenticated_client, create_admin, create_mission):
    admin = create_admin()
    mission = create_mission()
    client, _ = authenticated_client(user=admin, is_admin=True)
    
    response = client.delete(f'/auth/missoes/{mission.id}/')
    
    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not Mission.objects.filter(id=mission.id).exists()


@pytest.mark.django_db
def test_user_cannot_delete_mission(authenticated_client, create_mission):
    mission = create_mission()
    client, user = authenticated_client(is_admin=False)
    
    response = client.delete(f'/auth/missoes/{mission.id}/')
    
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_user_sees_only_active_missions(authenticated_client, create_mission):
    create_mission(title='Missão Ativa', status='ativa')
    create_mission(title='Missão Inativa', status='inativa')
    
    client, user = authenticated_client(is_admin=False)
    
    response = client.get('/auth/missoes/')
    
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]['title'] == 'Missão Ativa'


@pytest.mark.django_db
def test_admin_sees_all_missions(authenticated_client, create_admin, create_mission):
    create_mission(title='Missão Ativa', status='ativa')
    create_mission(title='Missão Inativa', status='inativa')
    
    admin = create_admin()
    client, _ = authenticated_client(user=admin, is_admin=True)
    
    response = client.get('/auth/missoes/')
    
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 2


@pytest.mark.django_db
def test_filter_missions_by_category(authenticated_client, create_mission):
    create_mission(title='Missão A', category='Cat1')
    create_mission(title='Missão B', category='Cat2')
    
    client, user = authenticated_client(is_admin=False)
    
    response = client.get('/auth/missoes/?category=Cat1')
    
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]['category'] == 'Cat1'


@pytest.mark.django_db
def test_user_can_start_mission(authenticated_client, create_mission):
    mission = create_mission()
    client, user = authenticated_client(is_admin=False)
    
    response = client.post(f'/auth/missoes/{mission.id}/iniciar/')
    
    assert response.status_code == status.HTTP_201_CREATED
    assert response.data['mission'] == mission.id
    assert response.data['progress'] == 0
    assert UserMission.objects.filter(user=user, mission=mission).exists()


@pytest.mark.django_db
def test_cannot_start_inactive_mission(authenticated_client, create_mission):
    mission = create_mission(status='inativa')
    client, user = authenticated_client(is_admin=False)
    
    response = client.post(f'/auth/missoes/{mission.id}/iniciar/')
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'não está ativa' in response.data['error']


@pytest.mark.django_db
def test_cannot_start_mission_twice(authenticated_client, create_mission):
    mission = create_mission()
    client, user = authenticated_client(is_admin=False)
    
    response1 = client.post(f'/auth/missoes/{mission.id}/iniciar/')
    assert response1.status_code == status.HTTP_201_CREATED
    
    response2 = client.post(f'/auth/missoes/{mission.id}/iniciar/')
    assert response2.status_code == status.HTTP_400_BAD_REQUEST
    assert 'já iniciou' in response2.data['error']


@pytest.mark.django_db
def test_user_can_complete_mission(authenticated_client, create_mission):
    mission = create_mission(points=150)
    client, user = authenticated_client(is_admin=False)
    
    client.post(f'/auth/missoes/{mission.id}/iniciar/')
    
    initial_points = user.pontos
    response = client.patch(f'/auth/missoes/{mission.id}/complete/')
    
    assert response.status_code == status.HTTP_200_OK
    assert response.data['points_awarded'] == 150
    
    user.refresh_from_db()
    assert user.pontos == initial_points + 150


@pytest.mark.django_db
def test_cannot_complete_without_starting(authenticated_client, create_mission):
    mission = create_mission()
    client, user = authenticated_client(is_admin=False)
    
    response = client.patch(f'/auth/missoes/{mission.id}/complete/')
    
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert 'não iniciou' in response.data['error']


@pytest.mark.django_db
def test_cannot_complete_mission_twice(authenticated_client, create_mission):
    mission = create_mission(points=100)
    client, user = authenticated_client(is_admin=False)
    
    client.post(f'/auth/missoes/{mission.id}/iniciar/')
    response1 = client.patch(f'/auth/missoes/{mission.id}/complete/')
    assert response1.status_code == status.HTTP_200_OK
    
    initial_points = user.pontos
    
    response2 = client.patch(f'/auth/missoes/{mission.id}/complete/')
    assert response2.status_code == status.HTTP_400_BAD_REQUEST
    assert 'já completou' in response2.data['error']
    
    user.refresh_from_db()
    assert user.pontos == initial_points


@pytest.mark.django_db
def test_cannot_complete_inactive_mission(authenticated_client, create_mission):
    mission = create_mission()
    client, user = authenticated_client(is_admin=False)
    
    client.post(f'/auth/missoes/{mission.id}/iniciar/')
    
    mission.status = 'inativa'
    mission.save()
    
    response = client.patch(f'/auth/missoes/{mission.id}/complete/')
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'não está mais ativa' in response.data['error']


@pytest.mark.django_db
def test_list_user_missions(authenticated_client, create_mission):
    mission1 = create_mission(title='Missão 1')
    mission2 = create_mission(title='Missão 2')
    client, user = authenticated_client(is_admin=False)
    
    client.post(f'/auth/missoes/{mission1.id}/iniciar/')
    client.post(f'/auth/missoes/{mission2.id}/iniciar/')
    
    response = client.get('/auth/missoes/minhas/')
    
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 2


@pytest.mark.django_db
def test_list_only_own_missions(authenticated_client, create_mission, create_user):
    mission = create_mission()
    
    user1 = create_user(email='user1@example.com')
    client1, _ = authenticated_client(user=user1)
    client1.post(f'/auth/missoes/{mission.id}/iniciar/')
    
    user2 = create_user(email='user2@example.com')
    client2, _ = authenticated_client(user=user2)
    response = client2.get('/auth/missoes/minhas/')
    
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 0


@pytest.mark.django_db
def test_mission_points_must_be_positive(authenticated_client, create_admin):
    admin = create_admin()
    client, _ = authenticated_client(user=admin, is_admin=True)
    
    response = client.post('/auth/missoes/', {
        'title': 'Missão Inválida',
        'description': 'Descrição',
        'points': -50,
        'status': 'ativa'
    })
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_mission_status_must_be_valid(authenticated_client, create_admin):
    admin = create_admin()
    client, _ = authenticated_client(user=admin, is_admin=True)
    
    response = client.post('/auth/missoes/', {
        'title': 'Missão Inválida',
        'description': 'Descrição',
        'points': 100,
        'status': 'invalido'
    })
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST

@pytest.mark.django_db
def test_validate_quiz_all_correct_answers(authenticated_client, create_user):
    from core.models import Game, Mission, MissionCompletions
    
    user = create_user(email='teste@test.com')
    client, token = authenticated_client(user=user)
    
    # Criar curso e missão de quiz
    game = Game.objects.create(
        name='Curso Teste',
        description='Descrição',
        category='Teste',
        is_active=True
    )
    
    mission = Mission.objects.create(
        game=game,
        title='Quiz Teste',
        description='Quiz de teste',
        mission_type='quiz',
        order=1,
        points_value=100,
        is_active=True,
        content_data={
            'questions': [
                {
                    'id': 1,
                    'question': 'Pergunta 1?',
                    'options': ['A', 'B', 'C', 'D'],
                    'correct_answer': 1
                },
                {
                    'id': 2,
                    'question': 'Pergunta 2?',
                    'options': ['A', 'B', 'C', 'D'],
                    'correct_answer': 2
                }
            ]
        }
    )
    
    # Iniciar missão
    MissionCompletions.objects.create(
        user=user,
        mission=mission,
        status='in_progress'
    )
    
    # Validar com respostas corretas
    response = client.post(f'/auth/missoes/{mission.id}/validar/', {
        'answers': [1, 2]
    }, format='json')
    
    assert response.status_code == status.HTTP_200_OK
    assert response.data['success'] is True
    assert response.data['points_earned'] == 100
    assert response.data['status'] == 'completed'
    assert response.data['correct_answers'] == 2
    assert response.data['total_questions'] == 2
    assert 'Parabéns' in response.data['message']


@pytest.mark.django_db
def test_validate_quiz_partial_correct_answers(authenticated_client, create_user):
    from core.models import Game, Mission, MissionCompletions
    
    user = create_user(email='teste@test.com')
    client, token = authenticated_client(user=user)
    
    game = Game.objects.create(
        name='Curso Teste',
        description='Descrição',
        category='Teste',
        is_active=True
    )
    
    mission = Mission.objects.create(
        game=game,
        title='Quiz Teste',
        description='Quiz de teste',
        mission_type='quiz',
        order=1,
        points_value=100,
        is_active=True,
        content_data={
            'questions': [
                {'id': 1, 'question': 'P1?', 'options': ['A', 'B'], 'correct_answer': 0},
                {'id': 2, 'question': 'P2?', 'options': ['A', 'B'], 'correct_answer': 1},
                {'id': 3, 'question': 'P3?', 'options': ['A', 'B'], 'correct_answer': 0},
                {'id': 4, 'question': 'P4?', 'options': ['A', 'B'], 'correct_answer': 1}
            ]
        }
    )
    
    MissionCompletions.objects.create(user=user, mission=mission, status='in_progress')
    
    # 2 corretas de 4 = 50 pontos
    response = client.post(f'/auth/missoes/{mission.id}/validar/', {
        'answers': [0, 1, 1, 0]  # Acertou apenas 1ª e 2ª (2/4 = 50%)
    }, format='json')
    
    assert response.status_code == status.HTTP_200_OK
    assert response.data['success'] is False
    assert response.data['points_earned'] == 50
    assert response.data['status'] == 'in_progress'
    assert response.data['correct_answers'] == 2
    assert response.data['total_questions'] == 4


@pytest.mark.django_db
def test_validate_quiz_wrong_number_of_answers(authenticated_client, create_user):
    from core.models import Game, Mission, MissionCompletions
    
    user = create_user(email='teste@test.com')
    client, token = authenticated_client(user=user)
    
    game = Game.objects.create(name='Curso', description='Desc', category='Cat', is_active=True)
    mission = Mission.objects.create(
        game=game,
        title='Quiz',
        mission_type='quiz',
        order=1,
        points_value=100,
        is_active=True,
        content_data={
            'questions': [
                {'id': 1, 'question': 'P1?', 'options': ['A', 'B'], 'correct_answer': 0},
                {'id': 2, 'question': 'P2?', 'options': ['A', 'B'], 'correct_answer': 1}
            ]
        }
    )
    
    MissionCompletions.objects.create(user=user, mission=mission, status='in_progress')
    
    # Enviando apenas 1 resposta quando deveria ser 2
    response = client.post(f'/auth/missoes/{mission.id}/validar/', {
        'answers': [0]
    }, format='json')
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'Esperado 2 respostas' in response.data['error']


@pytest.mark.django_db
def test_validate_wordle_correct_word(authenticated_client, create_user):
    from core.models import Game, Mission, MissionCompletions
    
    user = create_user(email='teste@test.com')
    client, token = authenticated_client(user=user)
    
    game = Game.objects.create(name='Curso', description='Desc', category='Cat', is_active=True)
    mission = Mission.objects.create(
        game=game,
        title='Wordle',
        mission_type='game',
        order=1,
        points_value=150,
        is_active=True,
        content_data={
            'game_type': 'wordle',
            'word': 'PRAIA',
            'max_attempts': 6
        }
    )
    
    MissionCompletions.objects.create(user=user, mission=mission, status='in_progress')
    
    response = client.post(f'/auth/missoes/{mission.id}/validar/', {
        'word': 'PRAIA'
    }, format='json')
    
    assert response.status_code == status.HTTP_200_OK
    assert response.data['success'] is True
    assert response.data['points_earned'] == 150
    assert response.data['status'] == 'completed'
    assert 'Parabéns' in response.data['message']


@pytest.mark.django_db
def test_validate_wordle_incorrect_word(authenticated_client, create_user):
    from core.models import Game, Mission, MissionCompletions
    
    user = create_user(email='teste@test.com')
    client, token = authenticated_client(user=user)
    
    game = Game.objects.create(name='Curso', description='Desc', category='Cat', is_active=True)
    mission = Mission.objects.create(
        game=game,
        title='Wordle',
        mission_type='game',
        order=1,
        points_value=150,
        is_active=True,
        content_data={
            'game_type': 'wordle',
            'word': 'PRAIA',
            'max_attempts': 6
        }
    )
    
    MissionCompletions.objects.create(user=user, mission=mission, status='in_progress')
    
    response = client.post(f'/auth/missoes/{mission.id}/validar/', {
        'word': 'TESTE'
    }, format='json')
    
    assert response.status_code == status.HTTP_200_OK
    assert response.data['success'] is False
    assert response.data['points_earned'] == 0
    assert response.data['status'] == 'in_progress'
    assert 'incorreta' in response.data['message']


@pytest.mark.django_db
def test_validate_wordle_case_insensitive(authenticated_client, create_user):
    from core.models import Game, Mission, MissionCompletions
    
    user = create_user(email='teste@test.com')
    client, token = authenticated_client(user=user)
    
    game = Game.objects.create(name='Curso', description='Desc', category='Cat', is_active=True)
    mission = Mission.objects.create(
        game=game,
        title='Wordle',
        mission_type='game',
        order=1,
        points_value=150,
        is_active=True,
        content_data={'game_type': 'wordle', 'word': 'PRAIA', 'max_attempts': 6}
    )
    
    MissionCompletions.objects.create(user=user, mission=mission, status='in_progress')
    
    response = client.post(f'/auth/missoes/{mission.id}/validar/', {
        'word': 'praia'  # minúsculo
    }, format='json')
    
    assert response.status_code == status.HTTP_200_OK
    assert response.data['success'] is True
    assert response.data['points_earned'] == 150


@pytest.mark.django_db
def test_validate_mission_not_found(authenticated_client, create_user):
    user = create_user(email='teste@test.com')
    client, token = authenticated_client(user=user)
    
    response = client.post('/auth/missoes/99999/validar/', {
        'answers': [1, 2]
    }, format='json')
    
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert 'não encontrada' in response.data['error']


@pytest.mark.django_db
def test_validate_mission_not_started(authenticated_client, create_user):
    from core.models import Game, Mission
    
    user = create_user(email='teste@test.com')
    client, token = authenticated_client(user=user)
    
    game = Game.objects.create(name='Curso', description='Desc', category='Cat', is_active=True)
    mission = Mission.objects.create(
        game=game,
        title='Quiz',
        mission_type='quiz',
        order=1,
        points_value=100,
        is_active=True,
        content_data={'questions': []}
    )
    
    # Não criar MissionCompletions
    response = client.post(f'/auth/missoes/{mission.id}/validar/', {
        'answers': []
    }, format='json')
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'iniciar esta missão primeiro' in response.data['error']


@pytest.mark.django_db
def test_validate_already_completed_mission(authenticated_client, create_user):
    from core.models import Game, Mission, MissionCompletions
    from django.utils import timezone
    
    user = create_user(email='teste@test.com')
    client, token = authenticated_client(user=user)
    
    game = Game.objects.create(name='Curso', description='Desc', category='Cat', is_active=True)
    mission = Mission.objects.create(
        game=game,
        title='Quiz',
        mission_type='quiz',
        order=1,
        points_value=100,
        is_active=True,
        content_data={'questions': [{'id': 1, 'question': 'P?', 'options': ['A'], 'correct_answer': 0}]}
    )
    
    # Criar como já completada
    MissionCompletions.objects.create(
        user=user,
        mission=mission,
        status='completed',
        points_earned=100,
        completed_at=timezone.now()
    )
    
    response = client.post(f'/auth/missoes/{mission.id}/validar/', {
        'answers': [0]
    }, format='json')
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'já completou' in response.data['error']


@pytest.mark.django_db
def test_validate_quiz_without_questions(authenticated_client, create_user):
    from core.models import Game, Mission, MissionCompletions
    
    user = create_user(email='teste@test.com')
    client, token = authenticated_client(user=user)
    
    game = Game.objects.create(name='Curso', description='Desc', category='Cat', is_active=True)
    mission = Mission.objects.create(
        game=game,
        title='Quiz',
        mission_type='quiz',
        order=1,
        points_value=100,
        is_active=True,
        content_data={'questions': []}  # Vazio
    )
    
    MissionCompletions.objects.create(user=user, mission=mission, status='in_progress')
    
    response = client.post(f'/auth/missoes/{mission.id}/validar/', {
        'answers': []
    }, format='json')
    
    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert 'sem perguntas' in response.data['error']


@pytest.mark.django_db
def test_validate_wordle_without_word(authenticated_client, create_user):
    from core.models import Game, Mission, MissionCompletions
    
    user = create_user(email='teste@test.com')
    client, token = authenticated_client(user=user)
    
    game = Game.objects.create(name='Curso', description='Desc', category='Cat', is_active=True)
    mission = Mission.objects.create(
        game=game,
        title='Wordle',
        mission_type='game',
        order=1,
        points_value=150,
        is_active=True,
        content_data={'game_type': 'wordle'}  # Sem 'word'
    )
    
    MissionCompletions.objects.create(user=user, mission=mission, status='in_progress')
    
    response = client.post(f'/auth/missoes/{mission.id}/validar/', {
        'word': 'TESTE'
    }, format='json')
    
    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert 'não configurada' in response.data['error']
