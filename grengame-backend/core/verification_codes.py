import hashlib
import secrets

from django.contrib.auth.hashers import check_password, make_password
from django.utils.crypto import constant_time_compare


def generate_numeric_code(length: int = 6) -> str:
    normalized_length = max(int(length or 0), 1)
    return "".join(str(secrets.randbelow(10)) for _ in range(normalized_length))


def generate_session_token(length: int = 32) -> str:
    normalized_length = max(int(length or 0), 16)
    return secrets.token_urlsafe(normalized_length)


def hash_verification_code(raw_code: str) -> str:
    return make_password(str(raw_code).strip())


def hash_session_token(raw_token: str) -> str:
    normalized_token = str(raw_token or "").strip()
    return hashlib.sha256(normalized_token.encode("utf-8")).hexdigest()


def build_unusable_verification_code() -> str:
    return make_password(None)


def verification_code_matches(raw_code: str, stored_value: str) -> bool:
    normalized_code = str(raw_code).strip()
    candidate = str(stored_value or "")

    try:
        return check_password(normalized_code, candidate)
    except ValueError:
        return constant_time_compare(normalized_code, candidate)
