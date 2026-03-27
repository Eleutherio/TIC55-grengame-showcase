import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone
from django.core.cache import cache
from datetime import timedelta
from core.models import PasswordResetToken

User = get_user_model()

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def create_user(db):
    def make_user(email='usuario@grendene.com.br', password='senha123'):
        username = email.split('@')[0]
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name='Test',
            last_name='User'
        )
        return user
    return make_user


@pytest.fixture(autouse=True)
def clear_throttle_cache():
    cache.clear()


@pytest.mark.django_db
class TestPasswordResetRequest:
    def test_request_success(self, api_client, create_user):
        user = create_user(email='admin@grendene.com.br')
        response = api_client.post('/auth/password-reset/request/', {
            'email': 'admin@grendene.com.br'
        }, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert PasswordResetToken.objects.filter(user=user).exists()

    def test_request_user_not_found(self, api_client):
        response = api_client.post('/auth/password-reset/request/', {
            'email': 'naoexiste@grendene.com.br'
        }, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert 'Se o email estiver cadastrado' in response.data.get('message', '')

    def test_request_does_not_reveal_email_existence(self, api_client, create_user):
        create_user(email='existe@grendene.com.br')
        
        response_exists = api_client.post('/auth/password-reset/request/', {
            'email': 'existe@grendene.com.br'
        }, format='json')
        
        response_not_exists = api_client.post('/auth/password-reset/request/', {
            'email': 'naoexiste@grendene.com.br'
        }, format='json')
        
        assert response_exists.status_code == response_not_exists.status_code == 200
        assert response_exists.data == response_not_exists.data

    def test_request_allows_multiple_attempts_temporarily(self, api_client, create_user):
        user = create_user(email='usuario1@grendene.com.br')
        for _ in range(3):
            PasswordResetToken.objects.create(
                user=user,
                token='123456',
                expires_at=timezone.now() + timedelta(minutes=15)
            )
        response = api_client.post('/auth/password-reset/request/', {
            'email': 'usuario1@grendene.com.br'
        }, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert PasswordResetToken.objects.filter(user=user).count() == 4


@pytest.mark.django_db
class TestPasswordResetVerify:
    def test_verify_success(self, api_client, create_user):
        user = create_user(email='usuario2@grendene.com.br')
        token = PasswordResetToken.objects.create(
            user=user,
            token='654321',
            expires_at=timezone.now() + timedelta(minutes=15)
        )
        response = api_client.post('/auth/password-reset/verify/', {
            'email': 'usuario2@grendene.com.br',
            'code': '654321'
        }, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert 'session_token' in response.data

    def test_verify_invalid_code(self, api_client, create_user):
        user = create_user(email='usuario3@grendene.com.br')
        PasswordResetToken.objects.create(
            user=user,
            token='111111',
            expires_at=timezone.now() + timedelta(minutes=15)
        )
        response = api_client.post('/auth/password-reset/verify/', {
            'email': 'usuario3@grendene.com.br',
            'code': '999999'
        }, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_verify_expired_token(self, api_client, create_user):
        user = create_user(email='usuario4@grendene.com.br')
        PasswordResetToken.objects.create(
            user=user,
            token='222222',
            expires_at=timezone.now() - timedelta(minutes=1)
        )
        response = api_client.post('/auth/password-reset/verify/', {
            'email': 'usuario4@grendene.com.br',
            'code': '222222'
        }, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestPasswordResetConfirm:
    def test_confirm_success(self, api_client, create_user):
        user = create_user(email='usuario5@grendene.com.br', password='senhaantiga')
        token = PasswordResetToken.objects.create(
            user=user,
            token='123456',
            expires_at=timezone.now() + timedelta(minutes=15),
            is_used=True,
            reset_session_token='test-session-token'
        )
        response = api_client.post('/auth/password-reset/confirm/', {
            'session_token': 'test-session-token',
            'new_password': 'novasenha123',
            'confirm_password': 'novasenha123'
        }, format='json')
        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.check_password('novasenha123')

    def test_confirm_weak_password(self, api_client, create_user):
        user = create_user(email='usuario6@grendene.com.br')
        PasswordResetToken.objects.create(
            user=user,
            token='123456',
            expires_at=timezone.now() + timedelta(minutes=15),
            is_used=True,
            reset_session_token='test-session'
        )
        response = api_client.post('/auth/password-reset/confirm/', {
            'session_token': 'test-session',
            'new_password': '123',
            'confirm_password': '123'
        }, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_confirm_passwords_mismatch(self, api_client, create_user):
        user = create_user(email='usuario7@grendene.com.br')
        PasswordResetToken.objects.create(
            user=user,
            token='123456',
            expires_at=timezone.now() + timedelta(minutes=15),
            is_used=True,
            reset_session_token='test-session'
        )
        response = api_client.post('/auth/password-reset/confirm/', {
            'session_token': 'test-session',
            'new_password': 'novasenha123',
            'confirm_password': 'outrasenha456'
        }, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_confirm_invalid_session(self, api_client):
        response = api_client.post('/auth/password-reset/confirm/', {
            'session_token': 'token-invalido',
            'new_password': 'novasenha123',
            'confirm_password': 'novasenha123'
        }, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestPasswordResetFullFlow:
    def test_complete_password_reset_flow(self, api_client, create_user):
        user = create_user(email='flowtest@grendene.com.br', password='senhaantiga123')
        
        response_request = api_client.post('/auth/password-reset/request/', {
            'email': 'flowtest@grendene.com.br'
        }, format='json')
        assert response_request.status_code == status.HTTP_200_OK
        
        token_obj = PasswordResetToken.objects.filter(user=user, is_used=False).first()
        assert token_obj is not None
        
        response_verify = api_client.post('/auth/password-reset/verify/', {
            'email': 'flowtest@grendene.com.br',
            'code': token_obj.token
        }, format='json')
        assert response_verify.status_code == status.HTTP_200_OK
        session_token = response_verify.data.get('session_token')
        assert session_token is not None
        
        response_confirm = api_client.post('/auth/password-reset/confirm/', {
            'session_token': session_token,
            'new_password': 'novasenha123',
            'confirm_password': 'novasenha123'
        }, format='json')
        assert response_confirm.status_code == status.HTTP_200_OK
        
        user.refresh_from_db()
        assert user.check_password('novasenha123')
        assert not user.check_password('senhaantiga123')

    def test_cannot_reuse_session_token(self, api_client, create_user):
        user = create_user(email='reuse@grendene.com.br', password='senha123')
        
        api_client.post('/auth/password-reset/request/', {
            'email': 'reuse@grendene.com.br'
        }, format='json')
        
        token_obj = PasswordResetToken.objects.filter(user=user, is_used=False).first()
        
        response_verify = api_client.post('/auth/password-reset/verify/', {
            'email': 'reuse@grendene.com.br',
            'code': token_obj.token
        }, format='json')
        session_token = response_verify.data.get('session_token')
        
        response_first = api_client.post('/auth/password-reset/confirm/', {
            'session_token': session_token,
            'new_password': 'primeirasenha123',
            'confirm_password': 'primeirasenha123'
        }, format='json')
        assert response_first.status_code == status.HTTP_200_OK
        
        response_second = api_client.post('/auth/password-reset/confirm/', {
            'session_token': session_token,
            'new_password': 'segundasenha123',
            'confirm_password': 'segundasenha123'
        }, format='json')
        assert response_second.status_code == status.HTTP_400_BAD_REQUEST

