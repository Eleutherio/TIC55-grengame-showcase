import pytest
from datetime import timedelta
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from core.models import Game, GameProgress, Mission, MissionCompletions, LeaderboardEntry

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    user = User.objects.create_user(
        username='admin',
        email='admin@example.com',
        password='admin123',
        first_name='Admin',
        last_name='User',
        role='admin'
    )
    return user


@pytest.fixture
def regular_user(db):
    user = User.objects.create_user(
        username='user',
        email='user@example.com',
        password='user123',
        first_name='Regular',
        last_name='User',
        role='user'
    )
    return user


@pytest.fixture
def authenticated_admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture
def authenticated_user_client(api_client, regular_user):
    api_client.force_authenticate(user=regular_user)
    return api_client


@pytest.mark.django_db
class TestDashboardActiveUsersEndpoint:

    def test_requires_authentication(self, api_client):
        response = api_client.get('/auth/dashboard/usuarios-ativos/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_requires_admin_role(self, authenticated_user_client):
        response = authenticated_user_client.get('/auth/dashboard/usuarios-ativos/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_returns_active_users_count(self, authenticated_admin_client, admin_user):
        admin_user.last_login = timezone.now() - timedelta(days=3)
        admin_user.save()

        response = authenticated_admin_client.get('/auth/dashboard/usuarios-ativos/')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'usuarios_ativos_semana' in response.data
        assert 'usuarios_ativos_mes' in response.data
        assert response.data['usuarios_ativos_semana'] >= 1
        assert response.data['usuarios_ativos_mes'] >= 1


@pytest.mark.django_db
class TestDashboardAverageTimeEndpoint:

    def test_requires_admin_role(self, authenticated_user_client):
        response = authenticated_user_client.get('/auth/dashboard/tempo-medio/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_returns_zero_when_no_users(self, authenticated_admin_client):
        response = authenticated_admin_client.get('/auth/dashboard/tempo-medio/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['tempo_medio_minutos'] == 0
        assert response.data['tempo_medio_horas'] == 0
        assert response.data['total_usuarios'] == 0

    def test_calculates_average_time(self, authenticated_admin_client, admin_user, db):
        game = Game.objects.create(name='Test Game', description='Test')
        mission = Mission.objects.create(
            game=game,
            title='Test Mission',
            description='Test',
            mission_type='video',
            points_value=10
        )
        
        MissionCompletions.objects.create(
            user=admin_user,
            mission=mission,
            status='completed',
            points_earned=10,
            completed_at=timezone.now()
        )

        response = authenticated_admin_client.get('/auth/dashboard/tempo-medio/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['tempo_medio_minutos'] > 0
        assert response.data['total_usuarios'] >= 1


@pytest.mark.django_db
class TestDashboardCompletionRateEndpoint:

    def test_requires_admin_role(self, authenticated_user_client):
        response = authenticated_user_client.get('/auth/dashboard/taxa-conclusao/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_returns_zero_when_no_enrollments(self, authenticated_admin_client):
        response = authenticated_admin_client.get('/auth/dashboard/taxa-conclusao/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['taxa_conclusao_percentual'] == 0
        assert response.data['games_concluidos'] == 0
        assert response.data['total_inscricoes'] == 0

    def test_calculates_completion_rate(self, authenticated_admin_client, admin_user, db):
        game = Game.objects.create(name='Test Game', description='Test')
        
        GameProgress.objects.create(
            user=admin_user,
            game=game,
            progress_percentage=100,
            completed_at=timezone.now()
        )
        
        regular_user = User.objects.create_user(
            username='user2',
            email='user2@example.com',
            password='pass123'
        )
        GameProgress.objects.create(
            user=regular_user,
            game=game,
            progress_percentage=50
        )

        response = authenticated_admin_client.get('/auth/dashboard/taxa-conclusao/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['taxa_conclusao_percentual'] == 50.0
        assert response.data['games_concluidos'] == 1
        assert response.data['total_inscricoes'] == 2


@pytest.mark.django_db
class TestDashboardAverageXpEndpoint:

    def test_requires_admin_role(self, authenticated_user_client):
        response = authenticated_user_client.get('/auth/dashboard/xp-medio/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_returns_zero_when_no_users(self, authenticated_admin_client):
        response = authenticated_admin_client.get('/auth/dashboard/xp-medio/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['xp_medio'] == 0
        assert response.data['total_usuarios'] == 0

    def test_calculates_average_xp(self, authenticated_admin_client, admin_user, db):
        LeaderboardEntry.objects.create(
            user=admin_user,
            scope='global',
            total_points=100,
            missions_completed=5
        )
        
        user2 = User.objects.create_user(
            username='user2',
            email='user2@example.com',
            password='pass123'
        )
        LeaderboardEntry.objects.create(
            user=user2,
            scope='global',
            total_points=200,
            missions_completed=10
        )

        response = authenticated_admin_client.get('/auth/dashboard/xp-medio/')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['xp_medio'] == 150.0
        assert response.data['total_usuarios'] == 2


@pytest.mark.django_db
class TestDashboardCompletedMissionsEndpoint:

    def test_requires_admin_role(self, authenticated_user_client):
        response = authenticated_user_client.get('/auth/dashboard/missoes-concluidas/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_returns_missions_by_period(self, authenticated_admin_client, admin_user, db):
        game = Game.objects.create(name='Test Game', description='Test')
        mission = Mission.objects.create(
            game=game,
            title='Test Mission',
            description='Test',
            mission_type='video',
            points_value=10
        )
        
        MissionCompletions.objects.create(
            user=admin_user,
            mission=mission,
            status='completed',
            points_earned=10,
            completed_at=timezone.now() - timedelta(days=3)
        )

        response = authenticated_admin_client.get('/auth/dashboard/missoes-concluidas/')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'missoes_concluidas_semana' in response.data
        assert 'missoes_concluidas_mes' in response.data
        assert 'missoes_concluidas_ano' in response.data
        assert response.data['missoes_concluidas_semana'] >= 1


@pytest.mark.django_db
class TestDashboardTopCollaboratorsEndpoint:

    def test_requires_admin_role(self, authenticated_user_client):
        response = authenticated_user_client.get('/auth/dashboard/ranking-colaboradores/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_returns_empty_ranking(self, authenticated_admin_client):
        response = authenticated_admin_client.get('/auth/dashboard/ranking-colaboradores/')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'ranking' in response.data
        assert len(response.data['ranking']) == 0

    def test_returns_top_10_users(self, authenticated_admin_client, admin_user, db):
        for i in range(15):
            user = User.objects.create_user(
                username=f'user{i}',
                email=f'user{i}@example.com',
                password='pass123',
                first_name=f'User',
                last_name=f'{i}'
            )
            LeaderboardEntry.objects.create(
                user=user,
                scope='global',
                total_points=100 * (15 - i),
                missions_completed=i
            )

        response = authenticated_admin_client.get('/auth/dashboard/ranking-colaboradores/')
        
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['ranking']) == 10
        assert response.data['ranking'][0]['posicao'] == 1
        assert response.data['ranking'][0]['xp_total'] == 1500
        assert 'nome' in response.data['ranking'][0]
        assert 'email' in response.data['ranking'][0]
