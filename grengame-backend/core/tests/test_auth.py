"""
Testes para os endpoints de autenticação da API

Este arquivo testa os 3 endpoints principais:
- POST /auth/login    -> Login do usuário
- POST /auth/logout   -> Logout do usuário
- POST /auth/refresh  -> Renovação do token de acesso

Cada teste verifica diferentes cenários (sucesso, erro, validação)
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

# Pega o modelo de usuário customizado que criamos
User = get_user_model()

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def create_user(db):
    def make_user(email='test@example.com', password='senha123'):
        # Cria e retorna um usuário
        username = email.split('@')[0]
        
        user = User.objects.create_user(
            username=username,  # Django precisa do username
            email=email,
            password=password,  
            first_name='Test',
            last_name='User'
        )
        return user
    
    return make_user

@pytest.mark.django_db  # Indica que este teste precisa acessar o banco de dados
class TestLoginEndpoint:
    def test_login_success_returns_200(self, api_client, create_user):
        " Teste: Login com credenciais corretas deve retornar 200 "
        
        user = create_user(email='joao@example.com', password='minhasenha')
        
        response = api_client.post('/auth/login/', {
            'email': 'joao@example.com',
            'password': 'minhasenha'
        }, format='json')
        
        # ASSERT (Verificação): Verifica se funcionou
        assert response.status_code == status.HTTP_200_OK
        assert 'access' in response.data  # Token de acesso existe
        assert 'refresh' in response.data  # Token de refresh existe
        assert 'user' in response.data  # Dados do usuário existem
        assert response.data['user']['email'] == 'joao@example.com'
    
    
    def test_login_with_invalid_password_returns_400(self, api_client, create_user):
        " Teste: Login com senha errada deve retornar 400 "
        user = create_user(email='maria@example.com', password='senhaCorreta')
        
        response = api_client.post('/auth/login/', {
            'email': 'maria@example.com',
            'password': 'senhaErrada' 
        }, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'access' not in response.data
        assert 'refresh' not in response.data
    
    
    def test_login_with_nonexistent_user_returns_400(self, api_client):
        " Teste: Login com usuário que não existe deve retornar 400 "
       
        response = api_client.post('/auth/login/', {
            'email': 'naoexiste@example.com',
            'password': 'qualquersenha'
        }, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    
    def test_login_with_invalid_email_format_returns_400(self, api_client):
        " Teste: Login com formato de email inválido deve retornar 400 "
        
        response = api_client.post('/auth/login/', {
            'email': 'emailinvalido',  # Sem @ e sem domínio
            'password': 'senha123'
        }, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'email' in response.data 
    
    
    def test_login_with_empty_fields_returns_400(self, api_client):
        " Teste: Login com campos vazios deve retornar 400 "
        
        response = api_client.post('/auth/login/', {
            'email': '',
            'password': ''
        }, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

@pytest.mark.django_db
class TestLogoutEndpoint:
    def test_logout_success_returns_200(self, api_client, create_user):
        " Teste: Logout com token válido deve retornar 200 "
        
        user = create_user()
        login_response = api_client.post('/auth/login/', {
            'email': 'test@example.com',
            'password': 'senha123'
        }, format='json')
        
        access_token = login_response.data['access']
        refresh_token = login_response.data['refresh']
        
        response = api_client.post('/auth/logout/', {
            'refresh': refresh_token
        }, format='json', HTTP_AUTHORIZATION=f'Bearer {access_token}')
        
        assert response.status_code == status.HTTP_200_OK
    
    
    def test_logout_without_authentication_returns_401(self, api_client):
        " Teste: Logout sem token de autenticação deve retornar 401 "
        
        response = api_client.post('/auth/logout/', {
            'refresh': 'qualquertoken'
        }, format='json')
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    
    def test_logout_without_refresh_token_returns_400(self, api_client, create_user):
        " Teste: Logout sem enviar refresh token deve retornar 400 "
        
        user = create_user()
        login_response = api_client.post('/auth/login/', {
            'email': 'test@example.com',
            'password': 'senha123'
        }, format='json')
        
        access_token = login_response.data['access']
        
        response = api_client.post('/auth/logout/', {
            # Não enviou o 'refresh'!
        }, format='json', HTTP_AUTHORIZATION=f'Bearer {access_token}')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST

@pytest.mark.django_db
class TestRefreshTokenEndpoint:
    def test_refresh_token_success_returns_200(self, api_client, create_user):
        " Teste: Refresh com token válido deve retornar 200 "
        
        create_user()
        login_response = api_client.post('/auth/login/', {
            'email': 'test@example.com',
            'password': 'senha123'
        }, format='json')
        
        old_refresh_token = login_response.data['refresh']
        
        response = api_client.post('/auth/refresh/', {
            'refresh': old_refresh_token
        }, format='json')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'access' in response.data  # Novo access token
        assert 'refresh' in response.data  # Novo refresh token (rotação)
        
        assert response.data['refresh'] != old_refresh_token
    
    
    def test_refresh_with_invalid_token_returns_401(self, api_client):
        " Teste: Refresh com token inválido deve retornar 401 "
        
        # Tenta usar um token falso
        response = api_client.post('/auth/refresh/', {
            'refresh': 'token_fake_invalido'
        }, format='json')
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    
    def test_refresh_without_token_returns_400(self, api_client):
        " Teste: Refresh sem enviar token deve retornar 400 "
        
        response = api_client.post('/auth/refresh/', {}, format='json')
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    
    def test_old_refresh_token_is_blacklisted_after_rotation(self, api_client, create_user):
        " Teste: Refresh token antigo deve ir para blacklist após rotação "
        
        create_user()
        login_response = api_client.post('/auth/login/', {
            'email': 'test@example.com',
            'password': 'senha123'
        }, format='json')
        
        old_refresh = login_response.data['refresh']
        
        first_refresh = api_client.post('/auth/refresh/', {
            'refresh': old_refresh
        }, format='json')
        assert first_refresh.status_code == status.HTTP_200_OK
        
        second_refresh = api_client.post('/auth/refresh/', {
            'refresh': old_refresh  # Token antigo, já na blacklist
        }, format='json')
        
        assert second_refresh.status_code == status.HTTP_401_UNAUTHORIZED

@pytest.mark.django_db
class TestAuthenticationFlow:
    def test_complete_authentication_flow(self, api_client, create_user):
        create_user(email='completo@example.com', password='senha123')
        
        login = api_client.post('/auth/login/', {
            'email': 'completo@example.com',
            'password': 'senha123'
        }, format='json')
        assert login.status_code == status.HTTP_200_OK
        
        refresh_token = login.data['refresh']
        
        refresh = api_client.post('/auth/refresh/', {
            'refresh': refresh_token
        }, format='json')
        assert refresh.status_code == status.HTTP_200_OK
        
        new_access_token = refresh.data['access']
        new_refresh_token = refresh.data['refresh']
        
        logout = api_client.post('/auth/logout/', {
            'refresh': new_refresh_token
        }, format='json', HTTP_AUTHORIZATION=f'Bearer {new_access_token}')
        assert logout.status_code == status.HTTP_200_OK
        
        after_logout = api_client.post('/auth/refresh/', {
            'refresh': new_refresh_token
        }, format='json')
        assert after_logout.status_code == status.HTTP_401_UNAUTHORIZED
