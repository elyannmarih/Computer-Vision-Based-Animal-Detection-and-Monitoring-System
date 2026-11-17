-- Detectra's existing application schema, reproduced for PostgreSQL 16+.
-- Run on an empty development database, in one transaction. No rows are removed.

CREATE TABLE public.cameras (
    camera_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rtsp_stream_url text NOT NULL,
    location_name varchar(128) NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.models (
    model_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_number varchar(32) NOT NULL,
    precision_rating numeric(5,4) CHECK (precision_rating >= 0 AND precision_rating <= 1),
    created_date timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.trusted_persons (
    trusted_person_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    primary_account_id uuid NOT NULL,
    first_name varchar(64) NOT NULL,
    last_name varchar(64) NOT NULL,
    email varchar(255) NOT NULL,
    phone_number varchar(32) NOT NULL,
    receive_email boolean NOT NULL DEFAULT true,
    receive_sms boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.human_verifications (
    verification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    verified_by_id uuid NOT NULL,
    target_found boolean NOT NULL,
    verified_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_human_verifications_trusted_person FOREIGN KEY (verified_by_id)
        REFERENCES public.trusted_persons(trusted_person_id) ON DELETE CASCADE
);

CREATE TABLE public.images (
    image_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    camera_id uuid,
    image_url text NOT NULL,
    captured_at timestamptz NOT NULL,
    human_verified boolean NOT NULL DEFAULT false,
    targets_detected boolean NOT NULL DEFAULT false,
    number_detections integer NOT NULL DEFAULT 0 CHECK (number_detections >= 0),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    number_targets_verified integer NOT NULL DEFAULT 0 CHECK (number_targets_verified >= 0),
    number_targets_detected integer NOT NULL DEFAULT 0 CHECK (number_targets_detected >= 0),
    uploaded_at timestamptz,
    verification_id uuid REFERENCES public.human_verifications(verification_id) ON DELETE SET NULL,
    CONSTRAINT fk_images_camera FOREIGN KEY (camera_id)
        REFERENCES public.cameras(camera_id) ON DELETE SET NULL
);

CREATE TABLE public.detections (
    detection_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    image_id uuid NOT NULL REFERENCES public.images(image_id) ON DELETE CASCADE,
    class_label varchar(64) NOT NULL,
    confidence numeric(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    human_verified boolean NOT NULL DEFAULT false,
    x_min numeric(6,5) NOT NULL CHECK (x_min >= 0 AND x_min <= 1),
    y_min numeric(6,5) NOT NULL CHECK (y_min >= 0 AND y_min <= 1),
    width numeric(6,5) NOT NULL CHECK (width > 0 AND width <= 1),
    height numeric(6,5) NOT NULL CHECK (height > 0 AND height <= 1),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    verification_id uuid REFERENCES public.human_verifications(verification_id) ON DELETE SET NULL,
    model_id uuid REFERENCES public.models(model_id) ON DELETE SET NULL
);

-- Support the application's filtered lists and verification joins.
CREATE INDEX cameras_stream_lookup_idx ON public.cameras (rtsp_stream_url, created_at);
CREATE INDEX models_version_lookup_idx ON public.models (version_number, created_date DESC);
CREATE INDEX trusted_persons_account_idx ON public.trusted_persons (primary_account_id);
CREATE INDEX human_verifications_reviewer_idx ON public.human_verifications (verified_by_id);
CREATE INDEX images_camera_recent_idx ON public.images (camera_id, created_at DESC);
CREATE INDEX images_recent_idx ON public.images (created_at DESC);
CREATE INDEX images_verification_idx ON public.images (verification_id);
CREATE INDEX detections_image_idx ON public.detections (image_id, created_at DESC);
CREATE INDEX detections_model_idx ON public.detections (model_id);
CREATE INDEX detections_verification_idx ON public.detections (verification_id);

-- A repeat setup can recognize this schema without changing existing tables.
COMMENT ON TABLE public.cameras IS 'Detectra development schema v1';
