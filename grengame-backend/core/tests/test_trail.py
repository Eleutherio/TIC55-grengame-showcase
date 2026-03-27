import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from core.models import User, Game, Mission, GameProgress, MissionCompletions


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
def create_game(db):
    def make_game(name='Curso Teste', **kwargs):
        return Game.objects.create(
            name=name,
            description=kwargs.get('description', 'Descrição do curso'),
            category=kwargs.get('category', 'lgpd'),
            is_active=kwargs.get('is_active', True)
        )
    return make_game


@pytest.fixture
def create_mission(db):
    def make_mission(game, order, **kwargs):
        return Mission.objects.create(
            game=game,
            title=kwargs.get('title', f'Missão {order}'),
            description=kwargs.get('description', f'Descrição da missão {order}'),
            mission_type=kwargs.get('mission_type', 'video'),
            icon=kwargs.get('icon', 'play'),
            order=order,
            points_value=kwargs.get('points_value', 100),
            is_active=True
        )
    return make_mission


@pytest.mark.django_db
class TestCourseTrailView:
    
    def test_trail_requires_authentication(self, api_client, create_game):
        game = create_game()
        url = reverse('core:course-trail', args=[game.id])
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_trail_course_not_found(self, api_client, create_user):
        user = create_user()
        api_client.force_authenticate(user=user)
        url = reverse('core:course-trail', args=[9999])
        response = api_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert 'error' in response.data
    
    def test_trail_course_inactive(self, api_client, create_user, create_game):
        user = create_user()
        game = create_game(is_active=False)
        api_client.force_authenticate(user=user)
        url = reverse('core:course-trail', args=[game.id])
        response = api_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_trail_without_missions(self, api_client, create_user, create_game):
        user = create_user()
        game = create_game()
        api_client.force_authenticate(user=user)
        url = reverse('core:course-trail', args=[game.id])
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert 'course' in response.data
        assert 'missions' in response.data
        assert len(response.data['missions']) == 0
    
    def test_trail_first_mission_available(self, api_client, create_user, create_game, create_mission):
        user = create_user()
        game = create_game()
        mission1 = create_mission(game=game, order=1)
        mission2 = create_mission(game=game, order=2)
        
        api_client.force_authenticate(user=user)
        url = reverse('core:course-trail', args=[game.id])
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        missions = response.data['missions']
        assert len(missions) == 2
        assert missions[0]['status'] == 'available'
        assert missions[1]['status'] == 'locked'
    
    def test_trail_sequential_unlocking(self, api_client, create_user, create_game, create_mission):
        user = create_user()
        game = create_game()
        mission1 = create_mission(game=game, order=1, points_value=100)
        mission2 = create_mission(game=game, order=2)
        mission3 = create_mission(game=game, order=3)
        
        # Completar primeira missão
        MissionCompletions.objects.create(
            user=user,
            mission=mission1,
            status='completed',
            points_earned=100
        )
        
        api_client.force_authenticate(user=user)
        url = reverse('core:course-trail', args=[game.id])
        response = api_client.get(url)
        
        missions = response.data['missions']
        assert missions[0]['status'] == 'completed'
        assert missions[1]['status'] == 'available'
        assert missions[2]['status'] == 'locked'
    
    def test_trail_stars_calculation_perfect(self, api_client, create_user, create_game, create_mission):
        user = create_user()
        game = create_game()
        mission = create_mission(game=game, order=1, points_value=100)
        
        MissionCompletions.objects.create(
            user=user,
            mission=mission,
            status='completed',
            points_earned=100
        )
        
        api_client.force_authenticate(user=user)
        url = reverse('core:course-trail', args=[game.id])
        response = api_client.get(url)
        
        missions = response.data['missions']
        assert missions[0]['stars_earned'] == 3
        assert missions[0]['stars_total'] == 3
    
    def test_trail_stars_calculation_good(self, api_client, create_user, create_game, create_mission):
        user = create_user()
        game = create_game()
        mission = create_mission(game=game, order=1, points_value=100)
        
        MissionCompletions.objects.create(
            user=user,
            mission=mission,
            status='completed',
            points_earned=75
        )
        
        api_client.force_authenticate(user=user)
        url = reverse('core:course-trail', args=[game.id])
        response = api_client.get(url)
        
        missions = response.data['missions']
        assert missions[0]['stars_earned'] == 2
    
    def test_trail_stars_calculation_basic(self, api_client, create_user, create_game, create_mission):
        user = create_user()
        game = create_game()
        mission = create_mission(game=game, order=1, points_value=100)
        
        MissionCompletions.objects.create(
            user=user,
            mission=mission,
            status='completed',
            points_earned=50
        )
        
        api_client.force_authenticate(user=user)
        url = reverse('core:course-trail', args=[game.id])
        response = api_client.get(url)
        
        missions = response.data['missions']
        assert missions[0]['stars_earned'] == 1
    
    def test_trail_stars_calculation_zero(self, api_client, create_user, create_game, create_mission):
        user = create_user()
        game = create_game()
        mission = create_mission(game=game, order=1, points_value=100)
        
        MissionCompletions.objects.create(
            user=user,
            mission=mission,
            status='completed',
            points_earned=0
        )
        
        api_client.force_authenticate(user=user)
        url = reverse('core:course-trail', args=[game.id])
        response = api_client.get(url)
        
        missions = response.data['missions']
        assert missions[0]['stars_earned'] == 0
    
    def test_trail_missions_ordered(self, api_client, create_user, create_game, create_mission):
        user = create_user()
        game = create_game()
        # Criar missões fora de ordem
        mission3 = create_mission(game=game, order=3, title='Missão 3')
        mission1 = create_mission(game=game, order=1, title='Missão 1')
        mission2 = create_mission(game=game, order=2, title='Missão 2')
        
        api_client.force_authenticate(user=user)
        url = reverse('core:course-trail', args=[game.id])
        response = api_client.get(url)
        
        missions = response.data['missions']
        assert missions[0]['title'] == 'Missão 1'
        assert missions[1]['title'] == 'Missão 2'
        assert missions[2]['title'] == 'Missão 3'
    
    def test_trail_completed_at_field(self, api_client, create_user, create_game, create_mission):
        user = create_user()
        game = create_game()
        mission = create_mission(game=game, order=1)
        
        completion = MissionCompletions.objects.create(
            user=user,
            mission=mission,
            status='completed',
            points_earned=100
        )
        
        api_client.force_authenticate(user=user)
        url = reverse('core:course-trail', args=[game.id])
        response = api_client.get(url)
        
        missions = response.data['missions']
        assert missions[0]['completed_at'] is not None
    
    def test_trail_mission_fields(self, api_client, create_user, create_game, create_mission):
        user = create_user()
        game = create_game()
        mission = create_mission(
            game=game, 
            order=1,
            mission_type='video',
            icon='play',
            points_value=150
        )
        
        api_client.force_authenticate(user=user)
        url = reverse('core:course-trail', args=[game.id])
        response = api_client.get(url)
        
        missions = response.data['missions']
        mission_data = missions[0]
        
        assert 'id' in mission_data
        assert 'title' in mission_data
        assert 'description' in mission_data
        assert 'mission_type' in mission_data
        assert 'icon' in mission_data
        assert 'order' in mission_data
        assert 'points_value' in mission_data
        assert 'status' in mission_data
        assert 'stars_earned' in mission_data
        assert 'stars_total' in mission_data
        assert 'completed_at' in mission_data
        
        # Verificar valores
        assert mission_data['mission_type'] == 'video'
        assert mission_data['icon'] == 'play'
        assert mission_data['points_value'] == 150
    
    def test_trail_response_structure(self, api_client, create_user, create_game, create_mission):
        user = create_user()
        game = create_game(name='Curso LGPD', category='lgpd')
        mission = create_mission(game=game, order=1)
        
        GameProgress.objects.create(user=user, game=game)
        
        api_client.force_authenticate(user=user)
        url = reverse('core:course-trail', args=[game.id])
        response = api_client.get(url)
        
        assert response.status_code == status.HTTP_200_OK
        
        assert 'course' in response.data
        assert 'missions' in response.data
        assert 'summary' in response.data
        
        course_data = response.data['course']
        assert course_data['name'] == 'Curso LGPD'
        assert course_data['category'] == 'lgpd'
        
        summary = response.data['summary']
        assert 'total_missions' in summary
        assert 'completed_missions' in summary
        assert 'total_points' in summary
        assert 'earned_points' in summary

    def test_temporary_admin_can_view_missions_from_visible_game(
        self,
        api_client,
        create_user,
    ):
        owner = create_user(email='owner@test.com', role='admin')
        temp_creator = create_user(
            email='temp.creator@test.com',
            role='admin',
            is_temporary_account=True,
        )
        temp_viewer = create_user(
            email='temp.viewer@test.com',
            role='admin',
            is_temporary_account=True,
        )

        game = Game.objects.create(
            name='Jornada Sustentavel',
            description='Desc',
            category='sustentabilidade',
            is_active=True,
            created_by=owner,
        )
        Mission.objects.create(
            game=game,
            title='Missao Publica',
            description='Desc da missao',
            mission_type='reading',
            icon='book',
            order=1,
            points_value=100,
            is_active=True,
            created_by=temp_creator,
        )

        api_client.force_authenticate(user=temp_viewer)
        url = reverse('core:course-trail', args=[game.id])
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['missions']) == 1
