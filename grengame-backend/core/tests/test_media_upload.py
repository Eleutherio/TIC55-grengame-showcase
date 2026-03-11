import pytest
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from core.models import User, Game


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(username='admin', email='admin@grendene.com.br', password='admin123', role='admin')


@pytest.fixture
def player_user(db):
    return User.objects.create_user(username='player', email='player@grendene.com.br', password='player123', role='user')


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def imagem_valida():
    return SimpleUploadedFile('imagem.jpg', b'conteudo', content_type='image/jpeg')


@pytest.fixture
def video_valido():
    return SimpleUploadedFile('video.mp4', b'conteudo', content_type='video/mp4')


@pytest.mark.django_db
def test_admin_upload_valid_media(api_client, admin_user, imagem_valida, video_valido):
    api_client.force_authenticate(user=admin_user)
    url = reverse('core:course-list-create')
    data = {
        'name': 'Curso Midia',
        'image_url': imagem_valida,
        'video_url': video_valido
    }
    response = api_client.post(url, data, format='multipart')
    assert response.status_code == 201


@pytest.mark.django_db
def test_admin_upload_invalid_image(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    url = reverse('core:course-list-create')
    arquivo_invalido = SimpleUploadedFile('arquivo.txt', b'conteudo', content_type='text/plain')
    data = {
        'name': 'Curso Invalido',
        'image_url': arquivo_invalido
    }
    response = api_client.post(url, data, format='multipart')
    assert response.status_code == 400


@pytest.mark.django_db
def test_admin_upload_invalid_video_format(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    url = reverse('core:course-list-create')
    video_invalido = SimpleUploadedFile('video.txt', b'conteudo', content_type='text/plain')
    data = {
        'name': 'Curso Video Invalido',
        'video_url': video_invalido
    }
    response = api_client.post(url, data, format='multipart')
    assert response.status_code == 400


@pytest.mark.django_db
def test_player_cannot_upload_media(api_client, player_user, imagem_valida):
    api_client.force_authenticate(user=player_user)
    url = reverse('core:course-list-create')
    data = {
        'name': 'Curso Player',
        'image_url': imagem_valida
    }
    response = api_client.post(url, data, format='multipart')
    assert response.status_code == 403
