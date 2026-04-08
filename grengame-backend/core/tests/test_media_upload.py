import pytest
from io import BytesIO
from django.test import override_settings
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient
from core.models import User
from core import upload_security


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
    buffer = BytesIO()
    Image.new("RGBA", (1, 1), (255, 0, 0, 255)).save(buffer, format="PNG")
    return SimpleUploadedFile("imagem.png", buffer.getvalue(), content_type="image/png")


@pytest.fixture
def video_valido():
    mp4_header = (
        b"\x00\x00\x00\x18ftypmp42"
        b"\x00\x00\x00\x00mp42isom"
    )
    return SimpleUploadedFile('video.mp4', mp4_header, content_type='video/mp4')


@pytest.fixture
def avatar_invalido_com_mime_de_imagem():
    return SimpleUploadedFile(
        'avatar.png',
        b'<html>nao-e-imagem</html>',
        content_type='image/png',
    )


@pytest.mark.django_db
def test_admin_upload_valid_media(api_client, admin_user, imagem_valida, video_valido):
    api_client.force_authenticate(user=admin_user)
    url = reverse('core:course-list-create')
    data = {
        'name': 'Curso Midia',
        'video_url': video_valido
    }
    response = api_client.post(url, data, format='multipart')
    assert response.status_code == 201


@pytest.mark.django_db
def test_admin_upload_invalid_image(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    url = reverse('core:course-list-create')
    arquivo_invalido = SimpleUploadedFile(
        'arquivo.png',
        b'<script>alert(1)</script>',
        content_type='image/png',
    )
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
    video_invalido = SimpleUploadedFile(
        'video.mp4',
        b'<html>nao-e-video</html>',
        content_type='video/mp4',
    )
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


@pytest.mark.django_db
def test_user_update_rejects_avatar_with_spoofed_image_metadata(
    api_client,
    player_user,
    avatar_invalido_com_mime_de_imagem,
):
    api_client.force_authenticate(user=player_user)
    url = reverse('core:user_update')

    response = api_client.put(
        url,
        {'avatar': avatar_invalido_com_mime_de_imagem},
        format='multipart',
    )

    assert response.status_code == 400
    assert response.data['error'] == 'Arquivo de imagem invalido ou corrompido.'


@pytest.mark.django_db
def test_user_update_accepts_valid_avatar_upload(api_client, player_user, imagem_valida):
    api_client.force_authenticate(user=player_user)
    url = reverse('core:user_update')

    response = api_client.put(
        url,
        {'avatar': imagem_valida},
        format='multipart',
    )

    assert response.status_code == 200
    assert response.data['avatar_url']


@pytest.mark.django_db
@override_settings(UPLOAD_MALWARE_SCAN_ENABLED=True)
def test_admin_upload_rejects_media_flagged_by_antimalware(
    api_client,
    admin_user,
    video_valido,
    monkeypatch,
):
    api_client.force_authenticate(user=admin_user)
    url = reverse('core:course-list-create')

    def fake_scan(_uploaded_file):
        raise upload_security.MalwareDetectedError("stream: Eicar-Test-Signature FOUND")

    monkeypatch.setattr(upload_security, "_clamav_scan_uploaded_file", fake_scan)

    response = api_client.post(
        url,
        {
            'name': 'Curso Malicioso',
            'video_url': video_valido,
        },
        format='multipart',
    )

    assert response.status_code == 400
    assert response.data['video_url'][0] == 'Arquivo bloqueado pela verificacao antimalware.'


@pytest.mark.django_db
@override_settings(
    UPLOAD_MALWARE_SCAN_ENABLED=True,
    UPLOAD_MALWARE_SCAN_FAIL_CLOSED=True,
)
def test_admin_upload_fails_closed_when_antimalware_is_unavailable(
    api_client,
    admin_user,
    imagem_valida,
    monkeypatch,
):
    api_client.force_authenticate(user=admin_user)
    url = reverse('core:course-list-create')

    def fake_scan(_uploaded_file):
        raise upload_security.MalwareScanUnavailableError("scanner offline")

    monkeypatch.setattr(upload_security, "_clamav_scan_uploaded_file", fake_scan)

    response = api_client.post(
        url,
        {
            'name': 'Curso Sem Scanner',
            'image_url': imagem_valida,
        },
        format='multipart',
    )

    assert response.status_code == 400
    assert response.data['image_url'][0] == 'Nao foi possivel validar a seguranca do arquivo no momento.'
