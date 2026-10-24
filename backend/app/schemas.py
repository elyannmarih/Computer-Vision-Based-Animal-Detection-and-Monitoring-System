from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field

# Mirrors the CHECK constraints in the database.
Unit = Annotated[float, Field(ge=0, le=1)]
PositiveUnit = Annotated[float, Field(gt=0, le=1)]
Count = Annotated[int, Field(ge=0)]


class Page(BaseModel):
    limit: int = Field(50, ge=1, le=500)
    offset: int = Field(0, ge=0)


# --- cameras ---------------------------------------------------------------

class CameraCreate(BaseModel):
    rtsp_stream_url: str
    location_name: str
    enabled: bool = True


class CameraUpdate(BaseModel):
    rtsp_stream_url: str | None = None
    location_name: str | None = None
    enabled: bool | None = None


class CameraRead(CameraCreate):
    camera_id: UUID
    created_at: datetime


class CameraFilter(Page):
    enabled: bool | None = None


# --- models ----------------------------------------------------------------

class ModelCreate(BaseModel):
    version_number: str
    precision_rating: Unit | None = None


class ModelUpdate(BaseModel):
    version_number: str | None = None
    precision_rating: Unit | None = None


class ModelRead(ModelCreate):
    model_id: UUID
    created_date: datetime


class ModelFilter(Page):
    version_number: str | None = None


# --- trusted_persons -------------------------------------------------------

class TrustedPersonCreate(BaseModel):
    primary_account_id: UUID
    first_name: str
    last_name: str
    email: str
    phone_number: str
    receive_email: bool = True
    receive_sms: bool = True


class TrustedPersonUpdate(BaseModel):
    primary_account_id: UUID | None = None
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone_number: str | None = None
    receive_email: bool | None = None
    receive_sms: bool | None = None


class TrustedPersonRead(TrustedPersonCreate):
    trusted_person_id: UUID
    created_at: datetime


class TrustedPersonFilter(Page):
    primary_account_id: UUID | None = None
    email: str | None = None


# --- human_verifications ---------------------------------------------------

class HumanVerificationCreate(BaseModel):
    verified_by_id: UUID
    target_found: bool
    verified_at: datetime | None = None  # omitted -> database default (now)


class HumanVerificationUpdate(BaseModel):
    verified_by_id: UUID | None = None
    target_found: bool | None = None
    verified_at: datetime | None = None


class HumanVerificationRead(BaseModel):
    verification_id: UUID
    verified_by_id: UUID
    target_found: bool
    verified_at: datetime
    created_at: datetime


class HumanVerificationFilter(Page):
    verified_by_id: UUID | None = None
    target_found: bool | None = None


# --- images ----------------------------------------------------------------

class ImageCreate(BaseModel):
    camera_id: UUID | None = None
    image_url: str
    captured_at: datetime
    uploaded_at: datetime | None = None
    human_verified: bool = False
    targets_detected: bool = False
    number_detections: Count = 0
    number_targets_detected: Count = 0
    number_targets_verified: Count = 0
    verification_id: UUID | None = None


class ImageUpdate(BaseModel):
    camera_id: UUID | None = None
    image_url: str | None = None
    captured_at: datetime | None = None
    uploaded_at: datetime | None = None
    human_verified: bool | None = None
    targets_detected: bool | None = None
    number_detections: Count | None = None
    number_targets_detected: Count | None = None
    number_targets_verified: Count | None = None
    verification_id: UUID | None = None


class ImageRead(ImageCreate):
    image_id: UUID
    created_at: datetime


class ImageFilter(Page):
    camera_id: UUID | None = None
    human_verified: bool | None = None
    targets_detected: bool | None = None
    verification_id: UUID | None = None


# --- detections ------------------------------------------------------------

class DetectionCreate(BaseModel):
    image_id: UUID
    model_id: UUID | None = None
    class_label: str
    confidence: Unit
    x_min: Unit
    y_min: Unit
    width: PositiveUnit
    height: PositiveUnit
    human_verified: bool = False
    verification_id: UUID | None = None


class DetectionUpdate(BaseModel):
    image_id: UUID | None = None
    model_id: UUID | None = None
    class_label: str | None = None
    confidence: Unit | None = None
    x_min: Unit | None = None
    y_min: Unit | None = None
    width: PositiveUnit | None = None
    height: PositiveUnit | None = None
    human_verified: bool | None = None
    verification_id: UUID | None = None


class DetectionRead(DetectionCreate):
    detection_id: UUID
    created_at: datetime


class DetectionFilter(Page):
    image_id: UUID | None = None
    model_id: UUID | None = None
    class_label: str | None = None
    human_verified: bool | None = None


# --- workflows -------------------------------------------------------------

class ImageVerification(BaseModel):
    verified_by_id: UUID
    target_found: bool
    detection_ids: list[UUID] | None = Field(
        None, description="Detections covered by this verification; omit for all detections on the image."
    )


class DetectionVerification(BaseModel):
    image_id: UUID | None = Field(None, description="Expected parent image; optional for existing API clients")
    verified_by_id: UUID
    verdict: Literal["correct", "incorrect"]


class AnalysisResult(BaseModel):
    image: ImageRead
    detections: list[DetectionRead]
    model_version: str
