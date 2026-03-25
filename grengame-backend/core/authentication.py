from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication

from .temporary_access import purge_expired_temporary_accounts


class TemporaryAwareJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)

        if not getattr(user, "is_temporary_account", False):
            return user

        expires_at = getattr(user, "temporary_expires_at", None)
        if expires_at and expires_at <= timezone.now():
            user_id = user.id
            purge_expired_temporary_accounts()
            raise AuthenticationFailed(
                f"Acesso temporario expirado para o usuario {user_id}."
            )

        return user
