
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from core.models import Course, CourseProgress, Game, GameProgress, Mission, MissionCompletions

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
            last_name=kwargs.get('last_name', 'User')
        )
        return user
    return make_user


@pytest.fixture
def create_course(db):
    def make_course(name='Curso Teste', **kwargs):
        return Course.objects.create(
            name=name,
            description=kwargs.get('description', 'Descrição do curso teste'),
            category=kwargs.get('category', 'Categoria Teste')
        )
    return make_course


@pytest.fixture
def authenticated_client(api_client, create_user):
    def _authenticated_client(user=None):
        if user is None:
            user = create_user()
        
        # Faz login para obter token
        response = api_client.post('/auth/login/', {
            'email': user.email,
            'password': 'senha123'
        })
        
        token = response.data['access']
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        
        return api_client, user
    
    return _authenticated_client


# ========== TESTES POST /auth/progress/ ==========

@pytest.mark.django_db
class TestProgressCreateEndpoint:
    
    def test_create_progress_success(self, authenticated_client, create_course):
        client, user = authenticated_client()
        course = create_course()
        
        response = client.post('/auth/progress/', {
            'course': course.id,
            'progress_percentage': 0
        })
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['course'] == course.id
        assert response.data['course_name'] == course.name
        assert response.data['progress_percentage'] == 0
        assert response.data['completed'] is False
        assert 'started_at' in response.data
    
    def test_create_progress_duplicate_returns_existing(self, authenticated_client, create_course):
        client, user = authenticated_client()
        course = create_course()
        
        # Primeira criação
        response1 = client.post('/auth/progress/', {
            'course': course.id,
            'progress_percentage': 10
        })
        assert response1.status_code == status.HTTP_201_CREATED
        progress_id = response1.data['id']
        
        # Tentar criar de novo
        response2 = client.post('/auth/progress/', {
            'course': course.id,
            'progress_percentage': 50  # Valor diferente
        })
        
        assert response2.status_code == status.HTTP_200_OK
        assert 'message' in response2.data
        assert response2.data['progress']['id'] == progress_id
        assert response2.data['progress']['progress_percentage'] == 10  # Mantém o original
    
    def test_create_progress_invalid_percentage(self, authenticated_client, create_course):
        client, user = authenticated_client()
        course = create_course()
        
        response = client.post('/auth/progress/', {
            'course': course.id,
            'progress_percentage': 150  # Inválido
        })
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'progress_percentage' in response.data
    
    def test_create_progress_negative_percentage(self, authenticated_client, create_course):
        client, user = authenticated_client()
        course = create_course()
        
        response = client.post('/auth/progress/', {
            'course': course.id,
            'progress_percentage': -10  # Inválido
        })
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_create_progress_missing_course(self, authenticated_client):
        client, user = authenticated_client()
        
        response = client.post('/auth/progress/', {
            'progress_percentage': 50
        })
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'course' in response.data
    
    def test_create_progress_invalid_course_id(self, authenticated_client):
        client, user = authenticated_client()
        
        response = client.post('/auth/progress/', {
            'course': 99999,  # Não existe
            'progress_percentage': 50
        })
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_create_progress_unauthenticated(self, api_client, create_course):
        course = create_course()
        
        response = api_client.post('/auth/progress/', {
            'course': course.id,
            'progress_percentage': 50
        })
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_create_progress_auto_complete_at_100(self, authenticated_client, create_course):
        client, user = authenticated_client()
        course = create_course()
        
        response = client.post('/auth/progress/', {
            'course': course.id,
            'progress_percentage': 100
        })
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['progress_percentage'] == 100
        assert response.data['completed'] is True


# ========== TESTES GET /auth/progress/list/ ==========

@pytest.mark.django_db
class TestProgressListEndpoint:
    
    def test_list_progress_empty(self, authenticated_client):
        client, user = authenticated_client()
        
        response = client.get('/auth/progress/list/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data == []
    
    def test_list_progress_multiple_courses(self, authenticated_client, create_course):
        client, user = authenticated_client()
        course1 = create_course(name='Curso 1')
        course2 = create_course(name='Curso 2')
        
        # Cria 2 progressos
        CourseProgress.objects.create(user=user, course=course1, progress_percentage=30)
        CourseProgress.objects.create(user=user, course=course2, progress_percentage=70)
        
        response = client.get('/auth/progress/list/')
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 2
        assert response.data[0]['course_name'] in ['Curso 1', 'Curso 2']
    
    def test_list_progress_filter_by_course_id(self, authenticated_client, create_course):
        client, user = authenticated_client()
        course1 = create_course(name='Curso 1')
        course2 = create_course(name='Curso 2')
        
        CourseProgress.objects.create(user=user, course=course1, progress_percentage=30)
        CourseProgress.objects.create(user=user, course=course2, progress_percentage=70)
        
        response = client.get(f'/auth/progress/list/?course_id={course1.id}')
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['course'] == course1.id
    
    def test_list_progress_filter_by_completed(self, authenticated_client, create_course):
        client, user = authenticated_client()
        course1 = create_course(name='Curso 1')
        course2 = create_course(name='Curso 2')
        
        CourseProgress.objects.create(user=user, course=course1, progress_percentage=50, completed=False)
        CourseProgress.objects.create(user=user, course=course2, progress_percentage=100, completed=True)
        
        response = client.get('/auth/progress/list/?completed=true')
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['completed'] is True
    
    def test_list_progress_only_own_progress(self, authenticated_client, create_user, create_course):
        client, user1 = authenticated_client()
        user2 = create_user(email='outro@example.com')
        course = create_course()
        
        CourseProgress.objects.create(user=user1, course=course, progress_percentage=30)
        CourseProgress.objects.create(user=user2, course=course, progress_percentage=70)
        
        response = client.get('/auth/progress/list/')
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1  # Só vê o próprio
        assert response.data[0]['progress_percentage'] == 30
    
    def test_list_progress_unauthenticated(self, api_client):
        response = api_client.get('/auth/progress/list/')
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ========== TESTES PATCH /auth/progress/<id>/ ==========

@pytest.mark.django_db
class TestProgressUpdateEndpoint:
    
    def test_update_progress_percentage_success(self, authenticated_client, create_course):
        client, user = authenticated_client()
        course = create_course()
        progress = CourseProgress.objects.create(user=user, course=course, progress_percentage=0)
        
        response = client.patch(f'/auth/progress/{progress.id}/', {
            'progress_percentage': 50
        })
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['progress_percentage'] == 50
        assert response.data['completed'] is False
    
    def test_update_progress_mark_completed(self, authenticated_client, create_course):
        client, user = authenticated_client()
        course = create_course()
        progress = CourseProgress.objects.create(user=user, course=course, progress_percentage=90)
        
        response = client.patch(f'/auth/progress/{progress.id}/', {
            'progress_percentage': 100,
            'completed': True
        })
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['completed'] is True
        assert response.data['completed_at'] is not None
    
    def test_update_progress_partial_update(self, authenticated_client, create_course):
        client, user = authenticated_client()
        course = create_course()
        progress = CourseProgress.objects.create(user=user, course=course, progress_percentage=30)
        
        response = client.patch(f'/auth/progress/{progress.id}/', {
            'progress_percentage': 75
        })
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['progress_percentage'] == 75
    
    def test_update_progress_invalid_percentage(self, authenticated_client, create_course):
        client, user = authenticated_client()
        course = create_course()
        progress = CourseProgress.objects.create(user=user, course=course, progress_percentage=30)
        
        response = client.patch(f'/auth/progress/{progress.id}/', {
            'progress_percentage': 200  # Inválido
        })
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_update_progress_not_owner(self, authenticated_client, create_user, create_course):
        client, user1 = authenticated_client()
        user2 = create_user(email='outro@example.com')
        course = create_course()
        
        progress = CourseProgress.objects.create(user=user2, course=course, progress_percentage=30)
        response = client.patch(f'/auth/progress/{progress.id}/', {
            'progress_percentage': 100
        })
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert 'error' in response.data
    
    def test_update_progress_not_found(self, authenticated_client):
        client, user = authenticated_client()
        
        response = client.patch('/auth/progress/99999/', {
            'progress_percentage': 50
        })
        
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_update_progress_unauthenticated(self, api_client, create_user, create_course):
        user = create_user()
        course = create_course()
        progress = CourseProgress.objects.create(user=user, course=course, progress_percentage=30)
        
        response = api_client.patch(f'/auth/progress/{progress.id}/', {
            'progress_percentage': 50
        })
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ========== TESTES DE INTEGRIDADE ==========

@pytest.mark.django_db
class TestProgressIntegrity:
    
    def test_unique_constraint_user_course(self, create_user, create_course):
        user = create_user()
        course = create_course()
        
        CourseProgress.objects.create(user=user, course=course, progress_percentage=30)
        
        # Segunda criação deve falhar no banco
        from django.db import IntegrityError
        with pytest.raises(IntegrityError):
            CourseProgress.objects.create(user=user, course=course, progress_percentage=50)
    
    def test_progress_percentage_validation_in_model(self, create_user, create_course):
        pass


@pytest.mark.django_db
class TestProgressSummaryEndpoint:

    def test_summary_empty(self, authenticated_client):
        client, user = authenticated_client()
        response = client.get('/auth/progress/summary/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['courses_in_progress'] == 0
        assert response.data['courses_completed'] == 0
        assert response.data['missions_completed'] == 0
        assert response.data['total_points'] == 0

    def test_summary_with_data(self, authenticated_client):
        client, user = authenticated_client()
        game = Game.objects.create(name='Curso Teste')
        GameProgress.objects.create(user=user, game=game, progress_percentage=50)
        mission = Mission.objects.create(game=game, title='Missao', description='Desc', points_value=100, content_data={})
        MissionCompletions.objects.create(user=user, mission=mission, status='completed', points_earned=100)
        response = client.get('/auth/progress/summary/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['courses_in_progress'] == 1
        assert response.data['missions_completed'] == 1
        assert response.data['total_points'] == 100

    def test_summary_unauthenticated(self, api_client):
        response = api_client.get('/auth/progress/summary/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestUserStatsEndpoint:

    def test_stats_empty(self, authenticated_client):
        client, user = authenticated_client()
        response = client.get('/auth/me/stats/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['xp'] == 0
        assert response.data['level'] == 'Bronze'
        assert response.data['xpToNext'] == 500

    def test_stats_bronze(self, authenticated_client):
        client, user = authenticated_client()
        game = Game.objects.create(name='Curso')
        mission = Mission.objects.create(game=game, title='M', description='D', points_value=200, content_data={})
        MissionCompletions.objects.create(user=user, mission=mission, status='completed', points_earned=200)
        response = client.get('/auth/me/stats/')
        assert response.data['xp'] == 200
        assert response.data['level'] == 'Bronze'
        assert response.data['xpToNext'] == 300

    def test_stats_prata(self, authenticated_client):
        client, user = authenticated_client()
        game = Game.objects.create(name='Curso')
        mission = Mission.objects.create(game=game, title='M', description='D', points_value=600, content_data={})
        MissionCompletions.objects.create(user=user, mission=mission, status='completed', points_earned=600)
        response = client.get('/auth/me/stats/')
        assert response.data['xp'] == 600
        assert response.data['level'] == 'Prata'
        assert response.data['xpToNext'] == 400

    def test_stats_ouro(self, authenticated_client):
        client, user = authenticated_client()
        game = Game.objects.create(name='Curso')
        mission = Mission.objects.create(game=game, title='M', description='D', points_value=1000, content_data={})
        MissionCompletions.objects.create(user=user, mission=mission, status='completed', points_earned=1000)
        response = client.get('/auth/me/stats/')
        assert response.data['xp'] == 1000
        assert response.data['level'] == 'Ouro'
        assert response.data['xpToNext'] == 0

    def test_stats_unauthenticated(self, api_client):
        response = api_client.get('/auth/me/stats/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
