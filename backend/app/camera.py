"""Live RTSP cameras: run the active detector on every frame, stream the annotated video, and save frames.

The camera comes from CAMERA_RTSP_URL (credentials included, kept only in .env). On startup it's
matched to a cameras row by its URL *without* credentials, creating the row if needed, so the
password never reaches the database or the API. Frames with targets are saved like uploads, at
most once every CAMERA_SAVE_INTERVAL seconds; POST /live/{camera_id}/scan saves the current frame.
"""
import asyncio
import logging
import os
import threading
import time
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID

# Read by OpenCV's FFmpeg backend when a capture opens: TCP is far more reliable than UDP for RTSP,
# and quiet logs keep the stream URL (and its password) out of the console.
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp")
os.environ.setdefault("OPENCV_FFMPEG_LOGLEVEL", "-8")
os.environ.setdefault("OPENCV_LOG_LEVEL", "ERROR")

import cv2  # noqa: E402  (must follow the environment settings above)
from dotenv import load_dotenv  # noqa: E402
from fastapi import APIRouter, HTTPException, Request  # noqa: E402
from fastapi.responses import StreamingResponse  # noqa: E402

from . import analysis, detector  # noqa: E402
from . import schemas as s  # noqa: E402
from .crud import Conn  # noqa: E402
from .db import pool  # noqa: E402

load_dotenv()

log = logging.getLogger(__name__)

SAVE_INTERVAL = float(os.getenv("CAMERA_SAVE_INTERVAL", "30"))
# Automatic saves need a surer detection than the live view shows, so low-confidence guesses
# about an unfamiliar scene don't pile up in the database
SAVE_CONFIDENCE = float(os.getenv("CAMERA_SAVE_CONFIDENCE", "0.5"))
PREVIEW_WIDTH = 1280  # the live view is downscaled to this; detection and saved frames use full size
# Where saved camera frames are served from when stored locally (uploads use the request's URL)
PUBLIC_API_URL = os.getenv("PUBLIC_API_URL", "http://127.0.0.1:8000")
RECONNECT_DELAY = 5

router = APIRouter(prefix="/live", tags=["live cameras"])
cameras: dict[UUID, "LiveCamera"] = {}


def without_credentials(url: str) -> str:
    parts = urlsplit(url)
    host = parts.hostname or ""
    return urlunsplit(parts._replace(netloc=host + (f":{parts.port}" if parts.port else "")))


class LiveCamera:
    def __init__(self, camera_id: UUID, location_name: str, url: str):
        self.camera_id, self.location_name, self._url = camera_id, location_name, url
        self._stop = threading.Event()
        self._new_frame = threading.Event()
        self._lock = threading.Lock()
        self._frame = self._frame_at = None  # latest frame read, not yet analyzed
        self.jpeg: bytes | None = None  # latest analyzed frame with boxes drawn
        self.detections: list[detector.Detection] = []
        self.model_version: str | None = None
        self.connected, self.error = False, None
        self.width = self.height = self.fps = None
        self.last_frame_at = self.last_saved_at = None
        self._threads = [threading.Thread(target=f, daemon=True, name=f"{f.__name__}-{camera_id}")
                         for f in (self._read, self._analyze)]

    def start(self):
        for t in self._threads:
            t.start()

    def stop(self):
        self._stop.set()
        self._new_frame.set()
        for t in self._threads:
            t.join(timeout=15)

    def _read(self):
        """Keep only the newest frame, so analysis never falls behind the live stream."""
        while not self._stop.is_set():
            cap = cv2.VideoCapture(self._url, cv2.CAP_FFMPEG, [
                cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 10000, cv2.CAP_PROP_READ_TIMEOUT_MSEC, 10000,
            ])
            if not cap.isOpened():
                self.connected, self.error = False, "Can't open the camera stream; retrying."
                cap.release()
                self._stop.wait(RECONNECT_DELAY)
                continue
            self.error = None
            # A video file (handy for testing) is read as fast as possible, so play it at its own frame rate
            is_file = "://" not in self._url
            frame_time = 1 / (cap.get(cv2.CAP_PROP_FPS) or 10) if is_file else 0
            while not self._stop.is_set():
                if frame_time:
                    self._stop.wait(frame_time)
                ok, frame = cap.read()
                if not ok:
                    self.connected, self.error = False, "The camera stream stopped; reconnecting."
                    break
                with self._lock:
                    self._frame, self._frame_at = frame, datetime.now(timezone.utc)
                self.connected = True
                self.height, self.width = frame.shape[:2]
                self._new_frame.set()
            cap.release()
            self._stop.wait(RECONNECT_DELAY if not self._stop.is_set() else 0)

    def latest(self):
        """The newest frame and when it was read, or (None, None)."""
        with self._lock:
            return self._frame, self._frame_at

    def _analyze(self):
        times = []
        while not self._stop.is_set():
            self._new_frame.wait(timeout=1)
            self._new_frame.clear()
            frame, frame_at = self.latest()
            if frame is None or frame_at == self.last_frame_at:
                continue
            try:
                model = detector.active()
                found = detector.detect_frame(frame, model)
                self.jpeg = cv2.imencode(".jpg", annotate(frame, found), [cv2.IMWRITE_JPEG_QUALITY, 80])[1].tobytes()
                self.detections, self.model_version, self.last_frame_at = found, model.version, frame_at
                times = [t for t in times if time.monotonic() - t < 5] + [time.monotonic()]
                self.fps = round(len(times) / 5, 1)
                due = SAVE_INTERVAL > 0 and (
                    self.last_saved_at is None or (frame_at - self.last_saved_at).total_seconds() >= SAVE_INTERVAL)
                if due and any(detector.is_target(d.class_label) and d.confidence >= SAVE_CONFIDENCE for d in found):
                    with pool.connection() as conn:
                        self.save(conn, PUBLIC_API_URL, frame, frame_at, model, found)
            except Exception:
                log.exception("Analyzing a frame from camera %s failed", self.camera_id)
                self._stop.wait(1)

    def save(self, conn, base_url: str, frame, frame_at: datetime, model: detector.Model, found) -> dict:
        """Save the raw frame (boxes are stored as data, not drawn in) like an uploaded image."""
        data = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 92])[1].tobytes()
        result = analysis.record(conn, data, "image/jpeg", base_url, model, found, self.camera_id, frame_at)
        self.last_saved_at = frame_at
        return result

    def status(self) -> dict:
        return {
            "camera_id": self.camera_id, "location_name": self.location_name,
            "connected": self.connected, "error": self.error,
            "width": self.width, "height": self.height, "fps": self.fps,
            "model_version": self.model_version,
            "detections": [vars(d) for d in self.detections],
            "last_frame_at": self.last_frame_at, "last_saved_at": self.last_saved_at,
            "save_interval": SAVE_INTERVAL, "save_confidence": SAVE_CONFIDENCE,
        }


def annotate(frame, found: list[detector.Detection]):
    """A copy of the frame, at most PREVIEW_WIDTH wide, with the detections drawn on."""
    h, w = frame.shape[:2]
    if w > PREVIEW_WIDTH:
        out = cv2.resize(frame, (PREVIEW_WIDTH, round(h * PREVIEW_WIDTH / w)), interpolation=cv2.INTER_AREA)
    else:
        out = frame.copy()
    h, w = out.shape[:2]
    thickness = max(2, round(min(w, h) / 360))
    for d in found:
        x1, y1 = round(d.x_min * w), round(d.y_min * h)
        x2, y2 = round((d.x_min + d.width) * w), round((d.y_min + d.height) * h)
        cv2.rectangle(out, (x1, y1), (x2, y2), (90, 220, 90), thickness)
        text = f"{d.class_label} {d.confidence:.0%}"
        scale = thickness / 3
        (tw, th), base = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, scale, thickness)
        top = max(0, y1 - th - base - 4)
        cv2.rectangle(out, (x1, top), (x1 + tw + 6, top + th + base + 4), (90, 220, 90), -1)
        cv2.putText(out, text, (x1 + 3, top + th + 2), cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), thickness)
    return out


def start():
    """Register and start the camera from CAMERA_RTSP_URL, if set and its cameras row is enabled."""
    url = os.getenv("CAMERA_RTSP_URL", "").strip()
    if not url:
        log.info("CAMERA_RTSP_URL is not set; no live camera.")
        return
    public = without_credentials(url)
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT camera_id, location_name, enabled FROM cameras WHERE rtsp_stream_url = %s"
            " ORDER BY created_at LIMIT 1", [public],
        ).fetchone() or conn.execute(
            "INSERT INTO cameras (rtsp_stream_url, location_name) VALUES (%s, %s)"
            " RETURNING camera_id, location_name, enabled",
            [public, os.getenv("CAMERA_NAME") or "Camera"],
        ).fetchone()
    if not row["enabled"]:
        log.info("Camera %s (%s) is disabled; not streaming.", row["camera_id"], public)
        return
    camera = LiveCamera(row["camera_id"], row["location_name"], url)
    cameras[camera.camera_id] = camera
    camera.start()
    log.info("Streaming camera %s from %s", camera.camera_id, public)


def stop():
    for camera in cameras.values():
        camera.stop()
    cameras.clear()


def get(camera_id: UUID) -> LiveCamera:
    if camera := cameras.get(camera_id):
        return camera
    raise HTTPException(404, "No live stream for this camera")


@router.get("", response_model=list[s.LiveCameraStatus])
def list_live():
    """Cameras being streamed and analyzed right now."""
    return [c.status() for c in cameras.values()]


@router.get("/{camera_id}", response_model=s.LiveCameraStatus)
def live_status(camera_id: UUID):
    return get(camera_id).status()


@router.get("/{camera_id}/video", response_class=StreamingResponse)
async def live_video(camera_id: UUID, request: Request):
    """The analyzed stream with detections drawn on, as MJPEG (use it as an <img> src)."""
    camera = get(camera_id)

    async def frames():
        sent, sent_at = None, 0.0
        while not await request.is_disconnected():
            jpeg = camera.jpeg
            # Browsers show a frame only once the next one starts, so repeat it while the stream is paused
            if jpeg is not None and (jpeg is not sent or time.monotonic() - sent_at > 1):
                sent, sent_at = jpeg, time.monotonic()
                yield b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n%b\r\n" % (len(jpeg), jpeg)
            await asyncio.sleep(0.03)

    return StreamingResponse(frames(), media_type="multipart/x-mixed-replace; boundary=frame",
                             headers={"Cache-Control": "no-store"})


@router.post("/{camera_id}/scan", response_model=s.AnalysisResult, status_code=201)
def scan(camera_id: UUID, request: Request, conn: Conn):
    """Analyze the camera's current frame and save it with its detections, like an upload."""
    camera = get(camera_id)
    frame, frame_at = camera.latest()
    if frame is None:
        raise HTTPException(503, camera.error or "No frame from the camera yet")
    model = detector.active()
    return camera.save(conn, str(request.base_url), frame, frame_at, model, detector.detect_frame(frame, model))
