from rest_framework_simplejwt.tokens import RefreshToken


class CustomRefreshToken(RefreshToken):
    @classmethod
    def for_user(cls, user):
        token = super().for_user(user)

        roles: list[str] = []

        # Garante que superusuários e staff tenham papel de admin no token
        if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
            roles.append("admin")

        # Papel principal vem sempre de user.role
        user_role = getattr(user, "role", None)
        if user_role and user_role not in roles:
            roles.append(user_role)

        # Fallback seguro
        if not roles:
            roles = ["user"]

        # Armazena as roles tanto no refresh quanto no access token gerado
        token["roles"] = roles
        token.access_token["roles"] = roles
        return token

