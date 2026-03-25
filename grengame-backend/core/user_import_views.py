from typing import List

import unicodedata
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db.models import Q
from django.utils.crypto import get_random_string
from rest_framework import status
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .temporary_access import (
    TEMP_MANAGED_USERS_LIMIT,
    generate_unique_username_from_email,
    is_temporary_admin,
)

User = get_user_model()


class IsAdminRole(BasePermission):
    message = "Voce nao tem permissao para acessar este recurso."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
            return True

        # A permissao deve depender do usuario carregado pelo backend,
        # sem fallback em payload de token para evitar inconsistencias.
        if getattr(user, "role", None) == "admin":
            return True

        return False


def _normalize_email_ascii(email: str) -> str:
    try:
        local, domain = email.split("@", 1)
    except ValueError:
        return email

    local_ascii = (
        unicodedata.normalize("NFKD", local)
        .encode("ascii", "ignore")
        .decode("ascii")
    )
    return f"{local_ascii}@{domain}"


def _is_temporary_admin_request(request) -> bool:
    return is_temporary_admin(getattr(request, "user", None))


def _generate_unique_username(email: str, reserved_usernames: set[str]) -> str:
    base = email.split("@", 1)[0]
    candidate = generate_unique_username_from_email(email)
    if candidate not in reserved_usernames:
        return candidate

    suffix = 2
    while True:
        candidate = f"{base}{suffix}"
        if candidate not in reserved_usernames and not User.objects.filter(username=candidate).exists():
            return candidate
        suffix += 1


def _can_manage_user(actor, target) -> bool:
    if not actor or not getattr(actor, "is_authenticated", False):
        return False

    if is_temporary_admin(actor):
        # Perfil temporario pode gerenciar usuarios criados por ele
        # e o proprio perfil (para troca de senha/dados pessoais).
        return (
            getattr(target, "id", None) == getattr(actor, "id", None)
            or getattr(target, "created_by_temporary_admin_id", None) == getattr(actor, "id", None)
        )

    return getattr(target, "created_by_temporary_admin_id", None) is None


class UsuarioListView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        is_temp_admin = _is_temporary_admin_request(request)
        queryset = User.objects.all()
        if not is_temp_admin:
            queryset = queryset.filter(created_by_temporary_admin__isnull=True)

        usuarios = [
            {
                "id": user.id,
                "nome": (user.first_name or user.get_full_name() or "").strip() or user.email.split("@")[0],
                "email": user.email,
                "role": getattr(user, "role", "user"),
                "cursosCompletos": getattr(user, "cursosCompletos", 0) if hasattr(user, "cursosCompletos") else 0,
                "can_manage": _can_manage_user(request.user, user),
            }
            for user in queryset.order_by("first_name", "email")
        ]
        return Response(usuarios, status=status.HTTP_200_OK)


class ImportarUsuariosView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request):
        payload = request.data
        if not isinstance(payload, dict) or "usuarios" not in payload:
            return Response({"error": "Corpo invalido. Envie {'usuarios': [...]}."}, status=status.HTTP_400_BAD_REQUEST)

        usuarios = payload.get("usuarios")
        if not isinstance(usuarios, list):
            return Response({"error": "Campo 'usuarios' deve ser uma lista."}, status=status.HTTP_400_BAD_REQUEST)

        is_temp_admin = _is_temporary_admin_request(request)
        slots_disponiveis = None
        if is_temp_admin:
            usuarios_gerenciados = User.objects.filter(created_by_temporary_admin=request.user).count()
            slots_disponiveis = max(TEMP_MANAGED_USERS_LIMIT - usuarios_gerenciados, 0)
            if slots_disponiveis == 0:
                return Response(
                    {"error": f"Conta temporaria pode administrar no maximo {TEMP_MANAGED_USERS_LIMIT} usuarios."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        emails_existentes = set(User.objects.values_list("email", flat=True))
        erros: List[dict] = []
        novos_registros: List[User] = []
        usernames_csv: set[str] = set()
        emails_csv: set[str] = set()

        for idx, item in enumerate(usuarios, start=1):
            if not isinstance(item, dict):
                erros.append({"linha": idx, "motivo": "Linha invalida (formato incorreto)."})
                continue

            nome = str(item.get("nome", "")).strip()
            email = _normalize_email_ascii(str(item.get("email", "")).strip().lower())

            if not nome or not email:
                erros.append({"linha": idx, "motivo": "Nome e e-mail sao obrigatorios.", "email": email or None})
                continue

            try:
                validate_email(email)
            except ValidationError:
                erros.append({"linha": idx, "motivo": "E-mail invalido.", "email": email})
                continue

            if email in emails_existentes or email in emails_csv:
                erros.append({"linha": idx, "motivo": "E-mail ja cadastrado.", "email": email})
                continue

            if is_temp_admin and slots_disponiveis is not None and len(novos_registros) >= slots_disponiveis:
                erros.append(
                    {
                        "linha": idx,
                        "motivo": (
                            f"Limite de {TEMP_MANAGED_USERS_LIMIT} usuarios para conta temporaria atingido."
                        ),
                        "email": email,
                    }
                )
                continue

            username = _generate_unique_username(email, usernames_csv)

            emails_existentes.add(email)
            emails_csv.add(email)
            usernames_csv.add(username)

            user = User(
                email=email,
                username=username,
                first_name=nome,
                role="user",
                created_by_temporary_admin=request.user if is_temp_admin else None,
            )
            user.set_password(get_random_string(16))
            novos_registros.append(user)

        if erros:
            return Response({"errors": erros}, status=status.HTTP_409_CONFLICT)

        if not novos_registros:
            return Response({"message": "Nenhum usuario novo para importar."}, status=status.HTTP_200_OK)

        User.objects.bulk_create(novos_registros)
        return Response({"importados": len(novos_registros)}, status=status.HTTP_201_CREATED)


class RemoverUsuarioView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request):
        payload = request.data
        if not isinstance(payload, dict) or "email" not in payload:
            return Response(
                {"error": "Corpo invalido. Envie {'email': 'usuario@dominio.com'}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = str(payload.get("email", "")).strip().lower()
        if not email:
            return Response({"error": "E-mail e obrigatorio."}, status=status.HTTP_400_BAD_REQUEST)

        queryset = User.objects.filter(email=email)
        if _is_temporary_admin_request(request):
            queryset = queryset.filter(created_by_temporary_admin=request.user)
        else:
            queryset = queryset.filter(created_by_temporary_admin__isnull=True)

        deleted, _ = queryset.delete()
        if deleted == 0:
            return Response({"error": "Usuario nao encontrado."}, status=status.HTTP_404_NOT_FOUND)

        return Response({"message": "Usuario removido com sucesso."}, status=status.HTTP_200_OK)


class CriarUsuarioView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request):
        payload = request.data
        if not isinstance(payload, dict):
            return Response({"error": "Corpo invalido."}, status=status.HTTP_400_BAD_REQUEST)

        nome = str(payload.get("nome", "")).strip()
        email = str(payload.get("email", "")).strip().lower()
        senha = str(payload.get("password", "")).strip()
        role = str(payload.get("role", "user")).strip() or "user"
        is_temp_admin = _is_temporary_admin_request(request)

        if not nome:
            return Response({"error": "Nome e obrigatorio."}, status=status.HTTP_400_BAD_REQUEST)

        if not email:
            return Response({"error": "E-mail e obrigatorio."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_email(email)
        except ValidationError:
            return Response({"error": "E-mail invalido."}, status=status.HTTP_400_BAD_REQUEST)

        if not senha or len(senha) < 6:
            return Response({"error": "Senha deve ter pelo menos 6 caracteres."}, status=status.HTTP_400_BAD_REQUEST)

        if role not in ("admin", "user"):
            return Response({"error": "Role invalida."}, status=status.HTTP_400_BAD_REQUEST)

        if is_temp_admin and role != "user":
            return Response(
                {"error": "Conta temporaria pode criar apenas usuarios com role user."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if is_temp_admin:
            usuarios_gerenciados = User.objects.filter(created_by_temporary_admin=request.user).count()
            if usuarios_gerenciados >= TEMP_MANAGED_USERS_LIMIT:
                return Response(
                    {"error": f"Conta temporaria pode administrar no maximo {TEMP_MANAGED_USERS_LIMIT} usuarios."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        if User.objects.filter(email=email).exists():
            return Response({"error": "E-mail ja cadastrado."}, status=status.HTTP_409_CONFLICT)

        username = _generate_unique_username(email, set())

        user = User(
            email=email,
            username=username,
            first_name=nome,
            role=role,
            created_by_temporary_admin=request.user if is_temp_admin else None,
        )
        user.set_password(senha)
        user.save()

        return Response(
            {
                "id": user.id,
                "email": user.email,
                "nome": user.first_name,
                "role": user.role,
            },
            status=status.HTTP_201_CREATED,
        )


class AtualizarUsuarioView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request):
        payload = request.data
        if not isinstance(payload, dict):
            return Response({"error": "Corpo invalido."}, status=status.HTTP_400_BAD_REQUEST)

        email = str(payload.get("email", "")).strip().lower()
        nome = payload.get("nome")
        senha = payload.get("password")
        role = payload.get("role")

        if not email:
            return Response({"error": "E-mail e obrigatorio."}, status=status.HTTP_400_BAD_REQUEST)

        is_temp_admin = _is_temporary_admin_request(request)
        queryset = User.objects.filter(email=email)
        if is_temp_admin:
            queryset = queryset.filter(
                Q(created_by_temporary_admin=request.user) | Q(id=request.user.id)
            )
        else:
            queryset = queryset.filter(created_by_temporary_admin__isnull=True)

        user = queryset.first()
        if user is None:
            return Response({"error": "Usuario nao encontrado."}, status=status.HTTP_404_NOT_FOUND)

        if isinstance(nome, str) and nome.strip():
            user.first_name = nome.strip()

        if isinstance(role, str) and role.strip() in ("admin", "user"):
            requested_role = role.strip()
            if is_temp_admin:
                is_self_user = user.id == request.user.id
                current_role = str(getattr(user, "role", "user") or "user")

                if is_self_user and requested_role != current_role:
                    return Response(
                        {"error": "Conta temporaria nao pode alterar o proprio perfil de acesso."},
                        status=status.HTTP_403_FORBIDDEN,
                    )

                if (not is_self_user) and requested_role != "user":
                    return Response(
                        {"error": "Conta temporaria nao pode promover usuario para admin."},
                        status=status.HTTP_403_FORBIDDEN,
                    )

            user.role = requested_role

        if isinstance(senha, str) and senha.strip():
            if len(senha.strip()) < 6:
                return Response({"error": "Senha deve ter pelo menos 6 caracteres."}, status=status.HTTP_400_BAD_REQUEST)
            user.set_password(senha.strip())

        user.save()

        return Response(
            {
                "id": user.id,
                "email": user.email,
                "nome": user.first_name,
                "role": user.role,
            },
            status=status.HTTP_200_OK,
        )
