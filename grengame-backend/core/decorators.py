import logging
from functools import wraps
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

logger = logging.getLogger(__name__)


def require_role(*role_names):
    def decorator(func):
        @wraps(func)
        def wrapper(self, request, *args, **kwargs):
            if not request.user.is_authenticated:
                return Response(
                    {'error': 'Usuário não autenticado'}, 
                    status=status.HTTP_401_UNAUTHORIZED
                )
            
            # Get roles from JWT token payload (consistent with RBACMiddleware)
            token_roles = []
            try:
                jwt_auth = JWTAuthentication()
                user, validated_token = jwt_auth.authenticate(request)
                if validated_token:
                    token_roles = validated_token.payload.get('roles', [])
            except (InvalidToken, TokenError) as e:
                logger.debug(f"Token inválido ou expirado no decorator: {e}")
            except Exception as e:
                logger.error(f"Erro inesperado ao validar token no decorator: {e}", exc_info=True)
            
            if not any(role in token_roles for role in role_names):
                return Response(
                    {'error': 'Você não tem permissão para acessar esse recurso.'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            return func(self, request, *args, **kwargs)
        return wrapper
    return decorator


def require_roles(*role_names):
    return require_role(*role_names)

