import logging
import os
from urllib.parse import quote

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def _parse_template_id(raw_template_id):
    if raw_template_id is None:
        return None
    value = str(raw_template_id).strip()
    if not value:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _send_brevo_template_email(to_email, subject, template_env_name, data):
    api_key = os.getenv("BREVO_API_KEY")
    from_email = os.getenv("BREVO_FROM_EMAIL")
    from_name = os.getenv("BREVO_FROM_NAME", "GrenGame").strip()
    api_base_url = os.getenv("BREVO_API_BASE_URL", "https://api.brevo.com/v3").strip().rstrip("/")
    template_id = _parse_template_id(os.getenv(template_env_name))

    if not api_key or not from_email or not template_id:
        logger.error(
            "BREVO_CONFIG_ERROR: missing/invalid BREVO env vars "
            "(api_key=%s from_email=%s template_env=%s template_id=%s)",
            bool(api_key),
            bool(from_email),
            template_env_name,
            bool(template_id),
        )
        return False

    try:
        response = requests.post(
            f"{api_base_url}/smtp/email",
            headers={
                "api-key": api_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json={
                "sender": {
                    "email": from_email,
                    "name": from_name,
                },
                "to": [
                    {
                        "email": to_email,
                    }
                ],
                "subject": subject,
                "templateId": template_id,
                "params": data,
            },
            timeout=12,
        )
    except requests.RequestException:
        logger.exception(
            "BREVO_REQUEST_EXCEPTION: to=%s template_env=%s template_id=%s from=%s",
            to_email,
            template_env_name,
            template_id,
            from_email,
        )
        return False

    if response.status_code not in (200, 201, 202):
        logger.error(
            "BREVO_SEND_FAILED: status=%s to=%s template_env=%s template_id=%s from=%s body=%s",
            response.status_code,
            to_email,
            template_env_name,
            template_id,
            from_email,
            response.text[:1000],
        )
        return False

    logger.info(
        "BREVO_SEND_ACCEPTED: status=%s to=%s template_env=%s template_id=%s",
        response.status_code,
        to_email,
        template_env_name,
        template_id,
    )
    return True


def _build_password_reset_link(to_email):
    frontend_url = os.getenv("PASSWORD_RESET_FRONTEND_URL", "").strip()
    if not frontend_url:
        return ""

    separator = "&" if "?" in frontend_url else "?"
    return f"{frontend_url}{separator}email={quote(to_email)}"


def send_password_reset_email(to_email, name, code):
    return _send_brevo_template_email(
        to_email=to_email,
        subject="Codigo de recuperacao de senha - GrenGame",
        template_env_name="BREVO_PASSWORD_RESET_TEMPLATE_ID",
        data={
            "name": name,
            "code": code,
            "email": to_email,
            "reset_link": _build_password_reset_link(to_email),
        },
    )


def send_temporary_access_email(to_email, name, password, expires_at):
    login_url = getattr(
        settings,
        "TEMP_ACCESS_LOGIN_URL",
        "https://tic55-grengame-showcase.pages.dev/login",
    ).strip()

    return _send_brevo_template_email(
        to_email=to_email,
        subject="Acesso temporario ao GrenGame",
        template_env_name="BREVO_TEMP_ACCESS_TEMPLATE_ID",
        data={
            "name": name,
            "email": to_email,
            "password": password,
            "expires_at": expires_at,
            "login_url": login_url,
        },
    )
