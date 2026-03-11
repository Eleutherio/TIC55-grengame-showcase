from typing import List, TypedDict

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.utils.crypto import get_random_string
import unicodedata
from rest_framework import status
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

User = get_user_model()

ALLOWED_EMAIL_DOMAIN = "grendene.com.br"


class IsAdminRole(BasePermission):
    message = "Você não tem permissão para acessar este recurso."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
            return True

        if getattr(user, "role", None) == "admin":
            return True

        roles = []
        auth = getattr(request, "auth", None)
        if hasattr(auth, "payload"):
            roles = auth.payload.get("roles", []) or []
        elif isinstance(auth, dict):
            roles = auth.get("roles", []) or []

        return "admin" in roles


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


class UsuarioListView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        usuarios = [
            {
                "id": user.id,
                "nome": (user.first_name or user.get_full_name() or "").strip() or user.email.split("@")[0],
                "email": user.email,
                "role": getattr(user, "role", "user"),
                "cursosCompletos": getattr(user, "cursosCompletos", 0) if hasattr(user, "cursosCompletos") else 0,
            }
            for user in User.objects.all().order_by("first_name", "email")
        ]
        return Response(usuarios, status=status.HTTP_200_OK)


class ImportarUsuariosView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request):
        payload = request.data
        if not isinstance(payload, dict) or "usuarios" not in payload:
            return Response({"error": "Corpo inválido. Envie {'usuarios': [...]}."}, status=status.HTTP_400_BAD_REQUEST)

        usuarios = payload.get("usuarios")
        if not isinstance(usuarios, list):
            return Response({"error": "Campo 'usuarios' deve ser uma lista."}, status=status.HTTP_400_BAD_REQUEST)

        emails_existentes = set(User.objects.values_list("email", flat=True))
        usernames_existentes = set(User.objects.values_list("username", flat=True))

        erros: List[dict] = []
        novos_registros: List[User] = []
        usernames_csv: set[str] = set()
        emails_csv: set[str] = set()

        for idx, item in enumerate(usuarios, start=1):
            if not isinstance(item, dict):
                erros.append({"linha": idx, "motivo": "Linha inválida (formato incorreto)."})
                continue
            nome = str(item.get("nome", "")).strip()
            email = str(item.get("email", "")).strip().lower()
            email = _normalize_email_ascii(email)
            if not nome or not email:
                erros.append({"linha": idx, "motivo": "Nome e e-mail são obrigatórios.", "email": email or None})
                continue
            try:
                validate_email(email)
            except ValidationError:
                erros.append({"linha": idx, "motivo": "E-mail inválido.", "email": email})
                continue

            try:
                _, domain = email.rsplit("@", 1)
            except ValueError:
                erros.append({"linha": idx, "motivo": "E-mail inválido.", "email": email})
                continue

            if domain.lower() != ALLOWED_EMAIL_DOMAIN:
                erros.append(
                    {
                        "linha": idx,
                        "motivo": f"E-mail deve ser do domínio @{ALLOWED_EMAIL_DOMAIN}.",
                        "email": email,
                    }
                )
                continue

            if email in emails_existentes or email in emails_csv:
                erros.append({"linha": idx, "motivo": "E-mail já cadastrado.", "email": email})
                continue

            username = email.split("@")[0]
            if username in usernames_existentes or username in usernames_csv:
                erros.append({"linha": idx, "motivo": "Prefixo de e-mail já utilizado como usuário.", "email": email})
                continue

            emails_existentes.add(email)
            emails_csv.add(email)
            usernames_csv.add(username)

            user = User(
                email=email,
                username=username,
                first_name=nome,
                role="user",
            )
            # Define senha provisória aleatória.
            # Hoje essa senha não é comunicada automaticamente ao colaborador.
            # Admin deve redefinir a senha após a importação ou implementar fluxo futuro de disparo de e-mail (fora do escopo MVP).
            user.set_password(get_random_string(16))
            novos_registros.append(user)

        if erros:
            return Response({"errors": erros}, status=status.HTTP_409_CONFLICT)

        if not novos_registros:
            return Response({"message": "Nenhum usuário novo para importar."}, status=status.HTTP_200_OK)

        User.objects.bulk_create(novos_registros)
        return Response({"importados": len(novos_registros)}, status=status.HTTP_201_CREATED)


class RemoverUsuarioView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request):
        payload = request.data
        if not isinstance(payload, dict) or "email" not in payload:
            return Response(
                {"error": "Corpo inválido. Envie {'email': 'usuario@dominio.com'}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = str(payload.get("email", "")).strip().lower()
        if not email:
            return Response({"error": "E-mail é obrigatório."}, status=status.HTTP_400_BAD_REQUEST)

        deleted, _ = User.objects.filter(email=email).delete()

        if deleted == 0:
            return Response({"error": "Usuário não encontrado."}, status=status.HTTP_404_NOT_FOUND)

        return Response({"message": "Usuário removido com sucesso."}, status=status.HTTP_200_OK)


class CriarUsuarioView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request):
        payload = request.data
        if not isinstance(payload, dict):
            return Response({"error": "Corpo inválido."}, status=status.HTTP_400_BAD_REQUEST)

        nome = str(payload.get("nome", "")).strip()
        email = str(payload.get("email", "")).strip().lower()
        senha = str(payload.get("password", "")).strip()
        role = str(payload.get("role", "user")).strip() or "user"

        if not nome:
            return Response({"error": "Nome é obrigatório."}, status=status.HTTP_400_BAD_REQUEST)

        if not email:
            return Response({"error": "E-mail é obrigatório."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_email(email)
        except ValidationError:
            return Response({"error": "E-mail inválido."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            _, domain = email.rsplit("@", 1)
        except ValueError:
            return Response({"error": "E-mail inválido."}, status=status.HTTP_400_BAD_REQUEST)

        if domain.lower() != ALLOWED_EMAIL_DOMAIN:
            return Response(
                {"error": f"E-mail deve ser do domínio @{ALLOWED_EMAIL_DOMAIN}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not senha or len(senha) < 6:
            return Response({"error": "Senha deve ter pelo menos 6 caracteres."}, status=status.HTTP_400_BAD_REQUEST)

        if role not in ("admin", "user"):
            return Response({"error": "Role inválida."}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(email=email).exists():
            return Response({"error": "E-mail já cadastrado."}, status=status.HTTP_409_CONFLICT)

        username = email.split("@")[0]

        user = User(
            email=email,
            username=username,
            first_name=nome,
            role=role,
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
            return Response({"error": "Corpo inválido."}, status=status.HTTP_400_BAD_REQUEST)

        email = str(payload.get("email", "")).strip().lower()
        nome = payload.get("nome")
        senha = payload.get("password")
        role = payload.get("role")

        if not email:
            return Response({"error": "E-mail é obrigatório."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({"error": "Usuário não encontrado."}, status=status.HTTP_404_NOT_FOUND)

        if isinstance(nome, str) and nome.strip():
            user.first_name = nome.strip()

        if isinstance(role, str) and role.strip() in ("admin", "user"):
            user.role = role.strip()

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
