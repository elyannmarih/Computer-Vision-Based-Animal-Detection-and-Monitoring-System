"""List the detector models in backend/models/ and switch the one in use."""
from fastapi import APIRouter, HTTPException

from . import detector
from . import schemas as s

router = APIRouter(prefix="/detector", tags=["detector"])


def describe(model: detector.Model) -> dict:
    return {
        "version": model.version, "title": model.title, "classes": model.classes,
        "precision": model.precision, "active": model.version == detector.active().version,
        "selected_classes": detector.selected_classes(model),
    }


@router.get("", response_model=list[s.DetectorModel])
def list_models():
    """Every model in backend/models/, with the one in use marked active."""
    return [describe(m) for m in detector.available_models()]


@router.patch("", response_model=s.DetectorModel)
def select_classes(body: s.DetectorClasses):
    try:
        return describe(detector.select_classes(body.version, body.classes))
    except ValueError as error:
        raise HTTPException(422, str(error))


@router.put("", response_model=s.DetectorModel)
def select_model(body: s.DetectorSelect):
    """Switch the model used for uploads and live cameras from now on; it's remembered across restarts."""
    try:
        model = detector.use_model(body.version, remember=True)
    except ValueError as error:
        raise HTTPException(404, str(error))
    return describe(model)
