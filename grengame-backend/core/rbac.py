import logging
from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

logger = logging.getLogger(__name__)


class RBACMiddleware(MiddlewareMixin):
    PUBLIC_ROUTES = ['/auth/login']
    ROUTES_WITH_ROLES = {'/reports/engagement': ['admin']}
    
    def process_request(self, request):
        path = request.path
        
        if any(path.startswith(route) for route in self.PUBLIC_ROUTES):
            return None
        
        # Only enforce authentication and role checks for routes in ROUTES_WITH_ROLES
        for route, required_roles in self.ROUTES_WITH_ROLES.items():
            if path.startswith(route):
                jwt_auth = JWTAuthentication()
                validated_token = None
                try:
                    user, validated_token = jwt_auth.authenticate(request)
                    if user:
                        request.user = user
                except (InvalidToken, TokenError) as e:
                    logger.debug(f"Token inválido ou expirado: {e}")
                except Exception as e:
                    logger.error(f"Erro inesperado durante autenticação JWT: {e}", exc_info=True)
                if not request.user.is_authenticated:
                    return JsonResponse({'error': 'Usuário não autenticado'}, status=401)
                token_roles = validated_token.payload.get('roles', []) if validated_token else []
                if not any(role in token_roles for role in required_roles):
                    return JsonResponse({'error': 'Você não tem permissão para acessar esse recurso.'}, status=403)
                break
        # For all other routes, let DRF permission classes handle authentication/authorization
        return None

