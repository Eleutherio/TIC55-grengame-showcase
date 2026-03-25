from urllib.parse import quote

from django.conf import settings
from storages.backends.s3boto3 import S3Boto3Storage


class SupabaseS3Storage(S3Boto3Storage):
    """S3-compatible storage for Supabase buckets."""

    file_overwrite = False

    def url(self, name, parameters=None, expire=None, http_method=None):
        public_base = getattr(settings, "SUPABASE_PUBLIC_STORAGE_URL", "").rstrip("/")
        cleaned_name = str(name).lstrip("/")

        if public_base:
            encoded_name = "/".join(
                quote(part) for part in cleaned_name.split("/") if part
            )
            if not encoded_name:
                return public_base
            return f"{public_base}/{encoded_name}"

        return super().url(
            name,
            parameters=parameters,
            expire=expire,
            http_method=http_method,
        )
