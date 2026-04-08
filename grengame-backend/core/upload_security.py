from __future__ import annotations

from typing import Iterable

from PIL import Image, UnidentifiedImageError


class FileUploadSecurityError(ValueError):
    pass


IMAGE_FORMAT_EXTENSIONS = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "WEBP": ".webp",
}

IMAGE_FORMAT_MIME_TYPES = {
    "JPEG": {"image/jpeg", "image/pjpeg"},
    "PNG": {"image/png"},
    "WEBP": {"image/webp"},
}

VIDEO_SIGNATURE_EXTENSIONS = {
    "mp4": {".mp4"},
    "mov": {".mov"},
    "webm": {".webm"},
    "avi": {".avi"},
}

VIDEO_SIGNATURE_MIME_TYPES = {
    "mp4": {"video/mp4"},
    "mov": {"video/quicktime"},
    "webm": {"video/webm"},
    "avi": {"video/x-msvideo", "video/avi"},
}

GENERIC_CONTENT_TYPES = {"", "application/octet-stream"}
ISO_BMFF_MP4_BRANDS = {
    b"isom",
    b"iso2",
    b"iso3",
    b"iso4",
    b"iso5",
    b"iso6",
    b"avc1",
    b"dash",
    b"mp41",
    b"mp42",
    b"M4V ",
    b"MSNV",
}


def _rewind_uploaded_file(uploaded_file):
    seek = getattr(uploaded_file, "seek", None)
    if callable(seek):
        try:
            seek(0)
            return
        except Exception:
            pass

    reopen = getattr(uploaded_file, "open", None)
    if callable(reopen):
        reopen()
        if callable(seek):
            seek(0)


def _read_uploaded_file_header(uploaded_file, size=512):
    _rewind_uploaded_file(uploaded_file)
    data = uploaded_file.read(size)
    _rewind_uploaded_file(uploaded_file)
    return data or b""


def _normalize_content_type(uploaded_file):
    return str(getattr(uploaded_file, "content_type", "") or "").strip().lower()


def _validate_content_type(normalized_content_type: str, allowed_types: Iterable[str], error_message: str):
    if (
        normalized_content_type
        and normalized_content_type not in GENERIC_CONTENT_TYPES
        and normalized_content_type not in allowed_types
    ):
        raise FileUploadSecurityError(error_message)


def validate_image_upload(
    uploaded_file,
    *,
    max_size: int,
    size_error_message: str,
    invalid_format_message: str,
    invalid_content_message: str,
):
    if uploaded_file.size > max_size:
        raise FileUploadSecurityError(size_error_message)

    try:
        _rewind_uploaded_file(uploaded_file)
        image = Image.open(uploaded_file)
        image.verify()
        detected_format = str(image.format or "").upper()
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        raise FileUploadSecurityError(invalid_content_message)
    finally:
        _rewind_uploaded_file(uploaded_file)

    if detected_format not in IMAGE_FORMAT_EXTENSIONS:
        raise FileUploadSecurityError(invalid_format_message)

    _validate_content_type(
        _normalize_content_type(uploaded_file),
        IMAGE_FORMAT_MIME_TYPES[detected_format],
        invalid_format_message,
    )
    return IMAGE_FORMAT_EXTENSIONS[detected_format]


def _detect_video_signature(header: bytes):
    if len(header) >= 12 and header[4:8] == b"ftyp":
        major_brand = header[8:12]
        if major_brand == b"qt  ":
            return "mov"
        if major_brand in ISO_BMFF_MP4_BRANDS:
            return "mp4"
        return None

    if header.startswith(b"\x1A\x45\xDF\xA3") and b"webm" in header.lower():
        return "webm"

    if len(header) >= 12 and header.startswith(b"RIFF") and header[8:12] == b"AVI ":
        return "avi"

    return None


def validate_video_upload(
    uploaded_file,
    *,
    max_size: int,
    size_error_message: str,
    invalid_format_message: str,
    invalid_content_message: str,
):
    if uploaded_file.size > max_size:
        raise FileUploadSecurityError(size_error_message)

    file_name = str(getattr(uploaded_file, "name", "") or "")
    file_extension = ""
    if "." in file_name:
        file_extension = f".{file_name.rsplit('.', 1)[-1].lower()}"

    if file_extension not in {".mp4", ".webm", ".mov", ".avi"}:
        raise FileUploadSecurityError(invalid_format_message)

    detected_signature = _detect_video_signature(_read_uploaded_file_header(uploaded_file))
    if detected_signature is None:
        raise FileUploadSecurityError(invalid_content_message)

    if file_extension not in VIDEO_SIGNATURE_EXTENSIONS[detected_signature]:
        raise FileUploadSecurityError(invalid_format_message)

    _validate_content_type(
        _normalize_content_type(uploaded_file),
        VIDEO_SIGNATURE_MIME_TYPES[detected_signature],
        invalid_format_message,
    )
