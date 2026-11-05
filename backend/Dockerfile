FROM python:3.13-slim-bookworm AS dependencies
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN python -m venv /opt/venv
COPY backend/requirements.txt /tmp/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install torch==2.15.0 torchvision==0.29.2 --index-url https://download.pytorch.org/whl/cpu \
    && pip install -r /tmp/requirements.txt \
    && pip check

FROM python:3.13-slim-bookworm AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 detectra \
    && useradd --uid 10001 --gid detectra --no-create-home detectra
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHON_DOTENV_DISABLED=1 \
    YOLO_AUTOINSTALL=false \
    YOLO_CONFIG_DIR=/tmp/ultralytics \
    MPLCONFIGDIR=/tmp/matplotlib \
    XDG_CACHE_HOME=/tmp/cache \
    OMP_NUM_THREADS=2 \
    DETECTRA_STATE_DIR=/app/backend/state
WORKDIR /app/backend
COPY --from=dependencies /opt/venv /opt/venv
COPY backend/app ./app
COPY backend/models/active.txt ./models/active.txt
COPY backend/models/yolov8s-oiv7 ./models/yolov8s-oiv7
COPY backend/database ./database
COPY backend/development_db.py backend/init_db.py backend/seed.py ./
RUN mkdir -p uploads state && chown detectra:detectra uploads state
USER detectra
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).close()"]
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
ARG VCS_REF=local
LABEL org.opencontainers.image.revision=$VCS_REF
