"""Image storage: an S3-compatible bucket when configured, otherwise local disk.

S3 mode works with AWS S3, Cloudflare R2, Backblaze B2, MinIO and other
S3-compatible services. It is enabled by setting S3_BUCKET; see .env.example.
"""
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"

S3_BUCKET = os.getenv("S3_BUCKET")
S3_PUBLIC_BASE_URL = os.getenv("S3_PUBLIC_BASE_URL", "").rstrip("/")

_s3 = None


def _client():
    global _s3
    if _s3 is None:
        import boto3  # only needed in S3 mode

        _s3 = boto3.client(
            "s3",
            endpoint_url=os.getenv("S3_ENDPOINT_URL") or None,
            region_name=os.getenv("S3_REGION") or None,
        )
    return _s3


def using_s3() -> bool:
    return bool(S3_BUCKET)


def save(data: bytes, extension: str, content_type: str, base_url: str) -> tuple[str, str]:
    """Store the bytes and return (storage key, public URL)."""
    key = f"images/{datetime.now(timezone.utc):%Y/%m/%d}/{uuid.uuid4().hex}.{extension}"
    if using_s3():
        if not S3_PUBLIC_BASE_URL:
            raise RuntimeError("S3_PUBLIC_BASE_URL must be set when S3_BUCKET is set")
        _client().put_object(Bucket=S3_BUCKET, Key=key, Body=data, ContentType=content_type)
        return key, f"{S3_PUBLIC_BASE_URL}/{key}"

    path = UPLOAD_DIR / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return key, f"{base_url.rstrip('/')}/uploads/{key}"


def delete(key: str) -> None:
    if using_s3():
        _client().delete_object(Bucket=S3_BUCKET, Key=key)
    else:
        (UPLOAD_DIR / key).unlink(missing_ok=True)
