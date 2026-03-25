import logging
import os

import requests

logger = logging.getLogger(__name__)
TEMP_ACCESS_TEMPLATE_ID = "vywj2lpy78ml7oqz"

def _send_mailersend_template_email(to_email, subject, template_id, data):
    api_key = os.getenv("MAILERSEND_API_KEY")
    from_email = os.getenv("MAILERSEND_FROM_EMAIL")

    if not api_key or not template_id or not from_email:
        logger.error(
            "MAILERSEND_CONFIG_ERROR: missing MAILERSEND env vars "
            "(api_key=%s template_id=%s from_email=%s)",
            bool(api_key),
            bool(template_id),
            bool(from_email),
        )
        return False

    try:
        response = requests.post(
            "https://api.mailersend.com/v1/email",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": {"email": from_email},
                "to": [{"email": to_email}],
                "subject": subject,
                "template_id": template_id,
                "personalization": [
                    {
                        "email": to_email,
                        "data": data,
                    }
                ],
            },
            timeout=12,
        )
    except requests.RequestException:
        logger.exception(
            "MAILERSEND_REQUEST_EXCEPTION: to=%s template_id=%s from=%s",
            to_email,
            template_id,
            from_email,
        )
        return False

    if response.status_code not in (200, 202):
        logger.error(
            "MAILERSEND_SEND_FAILED: status=%s to=%s template_id=%s from=%s body=%s",
            response.status_code,
            to_email,
            template_id,
            from_email,
            response.text[:1000],
        )
        return False

    logger.info(
        "MAILERSEND_SEND_ACCEPTED: status=%s to=%s template_id=%s",
        response.status_code,
        to_email,
        template_id,
    )
    return True


def send_password_reset_email(to_email, name, code):
    template_id = os.getenv("MAILERSEND_TEMPLATE_ID")
    return _send_mailersend_template_email(
        to_email=to_email,
        subject="Codigo de recuperacao de senha - GrenGame",
        template_id=template_id,
        data={"name": name, "code": code},
    )


def send_temporary_access_email(to_email, name, password, expires_at):
    return _send_mailersend_template_email(
        to_email=to_email,
        subject="Acesso temporario ao GrenGame",
        template_id=TEMP_ACCESS_TEMPLATE_ID,
        data={
            "name": name,
            "email": to_email,
            "password": password,
            "expires_at": expires_at,
        },
    )
