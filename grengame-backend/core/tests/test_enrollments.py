import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from core.models import User, Course, Enrollment

@pytest.fixture
def user(db):
    return User.objects.create_user(username='user', email='user@grendene.com.br', password='user123')

@pytest.fixture
def other_user(db):
    return User.objects.create_user(username='other', email='other@grendene.com.br', password='other123')

@pytest.fixture
def course(db):
    return Course.objects.create(name='Curso Teste', description='Desc', category='Tech')

@pytest.fixture
def api_client():
    return APIClient()

@pytest.mark.django_db
def test_create_enrollment(api_client, user, course):
    api_client.force_authenticate(user=user)
    url = reverse('core:enrollment-create')
    response = api_client.post(url, {'course': course.id})
    assert response.status_code == 201
    assert response.data['data']['course_name'] == 'Curso Teste'

@pytest.mark.django_db
def test_delete_enrollment(api_client, user, course):
    api_client.force_authenticate(user=user)
    Enrollment.objects.create(user=user, course=course)
    url = reverse('core:enrollment-delete', args=[course.id])
    response = api_client.delete(url)
    assert response.status_code == 200

@pytest.mark.django_db
def test_create_enrollment_invalid_course(api_client, user):
    api_client.force_authenticate(user=user)
    url = reverse('core:enrollment-create')
    response = api_client.post(url, {'course': 9999})
    assert response.status_code == 400

@pytest.mark.django_db
def test_create_duplicate_enrollment(api_client, user, course):
    api_client.force_authenticate(user=user)
    Enrollment.objects.create(user=user, course=course)
    url = reverse('core:enrollment-create')
    response = api_client.post(url, {'course': course.id})
    assert response.status_code == 400

@pytest.mark.django_db
def test_delete_nonexistent_enrollment(api_client, user, course):
    api_client.force_authenticate(user=user)
    url = reverse('core:enrollment-delete', args=[course.id])
    response = api_client.delete(url)
    assert response.status_code == 404

@pytest.mark.django_db
def test_unauthenticated_cannot_enroll(api_client, course):
    url = reverse('core:enrollment-create')
    response = api_client.post(url, {'course': course.id})
    assert response.status_code == 401

@pytest.mark.django_db
def test_user_cannot_delete_other_user_enrollment(api_client, user, other_user, course):
    api_client.force_authenticate(user=user)
    Enrollment.objects.create(user=other_user, course=course)
    url = reverse('core:enrollment-delete', args=[course.id])
    response = api_client.delete(url)
    assert response.status_code == 404
