import pytest
from rest_framework.test import APIClient
from core.models import User, Course, CourseProgress


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(username='admin', email='admin@grendene.com.br', password='admin123', role='admin')


@pytest.fixture
def player_user(db):
    return User.objects.create_user(username='player', email='player@grendene.com.br', password='player123', role='user')


@pytest.mark.django_db
def test_xp_minimo_invalido(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    response = api_client.post('/auth/courses/', {'name': 'Curso XP Zero', 'xp': 0})
    assert response.status_code == 400


@pytest.mark.django_db
def test_xp_maximo_invalido(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    response = api_client.post('/auth/courses/', {'name': 'Curso XP Alto', 'xp': 1001})
    assert response.status_code == 400


@pytest.mark.django_db
def test_xp_valido(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    response = api_client.post('/auth/courses/', {'name': 'Curso XP OK', 'xp': 500})
    assert response.status_code == 201
    assert response.data['xp'] == 500


@pytest.mark.django_db
def test_impedir_conclusao_duplicada(api_client, player_user):
    api_client.force_authenticate(user=player_user)
    course = Course.objects.create(name='Curso Teste', xp=100)
    progress = CourseProgress.objects.create(user=player_user, course=course, progress_percentage=100, completed=True)
    response = api_client.patch(f'/auth/progress/{progress.id}/', {'completed': True})
    assert response.status_code == 400
    assert 'já foi concluída' in response.data['error']


@pytest.mark.django_db
def test_xp_atribuido_ao_concluir(api_client, player_user):
    api_client.force_authenticate(user=player_user)
    course = Course.objects.create(name='Curso XP', xp=50)
    progress = CourseProgress.objects.create(user=player_user, course=course, progress_percentage=90)
    pontos_antes = player_user.pontos
    api_client.patch(f'/auth/progress/{progress.id}/', {'completed': True})
    player_user.refresh_from_db()
    assert player_user.pontos == pontos_antes + 50

