import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from core.models import User, Course

@pytest.fixture
def admin_user(db):
    return User.objects.create_user(username='admin',email='admin@grendene.com.br', password='admin123', role='admin')

@pytest.fixture
def player_user(db):
    return User.objects.create_user(username='player', email='player@grendene.com.br', password='player123', role='user')

@pytest.fixture
def api_client():
    return APIClient()

@pytest.mark.django_db
def test_admin_can_create_course(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    url = reverse('core:course-list-create')
    data = {'name': 'Curso Teste', 'description': 'Descrição'}
    response = api_client.post(url, data)
    assert response.status_code == 201
    assert Course.objects.filter(name='Curso Teste').exists()

@pytest.mark.django_db
def test_player_cannot_create_course(api_client, player_user):
    api_client.force_authenticate(user=player_user)
    url = reverse('core:course-list-create')
    data = {'name': 'Curso Player', 'description': 'Descrição'}
    response = api_client.post(url, data)
    assert response.status_code == 403
    assert not Course.objects.filter(name='Curso Player').exists()

@pytest.mark.django_db
def test_any_user_can_list_courses(api_client, admin_user, player_user):
    Course.objects.create(name='Curso 1', description='Desc')
    api_client.force_authenticate(user=admin_user)
    url = reverse('core:course-list-create')
    response = api_client.get(url)
    assert response.status_code == 200
    api_client.force_authenticate(user=player_user)
    response = api_client.get(url)
    assert response.status_code == 200

@pytest.mark.django_db
def test_admin_can_edit_and_delete_course(api_client, admin_user):
    course = Course.objects.create(name='Curso Edit', description='Desc')
    api_client.force_authenticate(user=admin_user)
    url = reverse('core:course-detail', args=[course.id])
    response = api_client.patch(url, {'name': 'Novo Nome'})
    assert response.status_code == 200
    assert Course.objects.get(id=course.id).name == 'Novo Nome'
    response = api_client.delete(url)
    assert response.status_code == 204
    assert not Course.objects.filter(id=course.id).exists()

@pytest.mark.django_db
def test_player_cannot_edit_or_delete_course(api_client, player_user):
    course = Course.objects.create(name='Curso Player Edit', description='Desc')
    api_client.force_authenticate(user=player_user)
    url = reverse('core:course-detail', args=[course.id])
    response = api_client.patch(url, {'name': 'Novo Nome Player'})
    assert response.status_code == 403
    response = api_client.delete(url)
    assert response.status_code == 403

@pytest.mark.django_db
def test_filter_courses_by_category(api_client, player_user):
    Course.objects.create(name='Curso 1', category='lgpd')
    Course.objects.create(name='Curso 2', category='seguranca')
    api_client.force_authenticate(user=player_user)
    url = reverse('core:course-list-create')
    response = api_client.get(url, {'category': 'lgpd'})
    assert len(response.data) == 1

@pytest.mark.django_db
def test_list_categories(api_client, player_user):
    Course.objects.create(name='Curso 1', category='lgpd')
    api_client.force_authenticate(user=player_user)
    url = reverse('core:course-categories')
    response = api_client.get(url)
    assert 'lgpd' in response.data