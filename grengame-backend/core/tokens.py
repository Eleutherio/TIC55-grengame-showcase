from rest_framework_simplejwt.tokens import RefreshToken

from .temporary_access import is_global_admin, is_temporary_admin


class CustomRefreshToken(RefreshToken):
    @classmethod
    def for_user(cls, user):
        token = super().for_user(user)

        roles: list[str] = []

        if is_global_admin(user):
            roles.append("admin")
        elif is_temporary_admin(user):
            roles.append("temporary_admin")

        user_role = getattr(user, "role", None)
        if user_role == "user" and user_role not in roles:
            roles.append(user_role)

        if not roles:
            roles = ["user"]

        admin_scope = (
            "temporary"
            if is_temporary_admin(user)
            else "global"
            if is_global_admin(user)
            else None
        )
        is_temporary_account = bool(getattr(user, "is_temporary_account", False))

        token["roles"] = roles
        token["is_temporary_account"] = is_temporary_account
        token["admin_scope"] = admin_scope
        token.access_token["roles"] = roles
        token.access_token["is_temporary_account"] = is_temporary_account
        token.access_token["admin_scope"] = admin_scope
        return token
