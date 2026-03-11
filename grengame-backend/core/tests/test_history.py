import pytest
from rest_framework.test import APIClient
from rest_framework import status
from core.models import User, Game, GameProgress, Mission, MissionCompletions


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def player_user(db):
    return User.objects.create_user(username='player', email='player@grendene.com.br', password='player123', role='user')


@pytest.mark.django_db
def test_user_can_get_history(api_client, player_user):
    api_client.force_authenticate(user=player_user)
    response = api_client.get('/auth/players/history/')
    assert response.status_code == status.HTTP_200_OK
    assert 'games' in response.data
    assert 'missions' in response.data


@pytest.mark.django_db
def test_unauthenticated_cannot_get_history(api_client):
    response = api_client.get('/auth/players/history/')
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_history_returns_user_games(api_client, player_user):
    api_client.force_authenticate(user=player_user)
    game = Game.objects.create(name='Teste Game', description='Desc')
    GameProgress.objects.create(user=player_user, game=game, progress_percentage=50)
    
    response = api_client.get('/auth/players/history/')
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data['games']) == 1


@pytest.mark.django_db
def test_history_returns_user_missions(api_client, player_user):
    api_client.force_authenticate(user=player_user)
    game = Game.objects.create(name='Teste Game', description='Desc')
    mission = Mission.objects.create(game=game, title='Missao Teste', description='Desc', points_value=100)
    MissionCompletions.objects.create(user=player_user, mission=mission, status='completed', points_earned=100)
    
    response = api_client.get('/auth/players/history/')
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data['missions']) == 1

