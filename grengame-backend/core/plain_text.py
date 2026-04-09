from django.core.exceptions import ValidationError
from django.utils.html import strip_tags


def normalize_plain_text_input(value, *, field_label="Campo", max_length=None):
    normalized = " ".join(str(value or "").split())

    if not normalized:
        return ""

    if strip_tags(normalized) != normalized or "<" in normalized or ">" in normalized:
        raise ValidationError(f"{field_label} deve ser texto puro, sem HTML.")

    if max_length is not None and len(normalized) > int(max_length):
        raise ValidationError(
            f"{field_label} deve ter no máximo {int(max_length)} caracteres."
        )

    return normalized
