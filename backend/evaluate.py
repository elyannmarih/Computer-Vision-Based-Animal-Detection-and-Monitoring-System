"""Evaluate the actual application detector offline, without database or camera calls.

JSON manifest: list of {id, path, split, truth: [[class, [x,y,w,h]]],
complete_annotations: true, verified_empty: bool}. Coordinates are normalized.
Use --allow-partial-annotations only for the historical research manifest;
excluded predictions are explicitly counted and precision is conditional.
"""
import argparse
from collections import Counter
from dataclasses import asdict
import hashlib
from io import BytesIO
import json
import math
from pathlib import Path
import statistics
import time

from PIL import Image


def iou(a, b):
    x, y, w, h = a
    u, v, bw, bh = b
    area = max(0, min(x+w, u+bw)-max(x, u)) * max(0, min(y+h, v+bh)-max(y, v))
    return area / max(w*h+bw*bh-area, 1e-12)


def match(found, truth, threshold=.5):
    counts = {label: Counter(tp=0, fp=0, fn=0) for label, _ in truth}
    remaining = list(truth)
    for label, confidence, box in sorted(found, key=lambda item: item[1], reverse=True):
        counts.setdefault(label, Counter(tp=0, fp=0, fn=0))
        choices = [(i, iou(box, target)) for i, (name, target) in enumerate(remaining) if name == label]
        best = max(choices, key=lambda item: item[1], default=None)
        if best and best[1] >= threshold:
            counts[label]['tp'] += 1
            remaining.pop(best[0])
        else:
            counts[label]['fp'] += 1
    for label, _ in remaining:
        counts[label]['fn'] += 1
    return counts


def verified_classes(record, supported, allow_partial):
    if record.get('complete_annotations') is True:
        if not record['truth'] and not record.get('verified_empty'):
            raise ValueError('Empty annotations require explicit verified_empty=true')
        return set(supported)
    if not allow_partial:
        raise ValueError('Incomplete annotations; use complete ground truth or explicitly opt into conditional evaluation')
    source = record.get('source', '')
    if source.startswith('openimages'):
        return {label for label, box in record['truth']}
    if source in {'caltech', 'sawit', 'nacti_empty'}:
        return {'lizard'}
    raise ValueError('Unknown partial-annotation policy for source: ' + source)


def metrics(counts):
    tp, fp, fn = (counts[key] for key in ('tp', 'fp', 'fn'))
    return dict(tp=tp, fp=fp, fn=fn, precision=tp/(tp+fp) if tp+fp else None,
                recall=tp/(tp+fn) if tp+fn else None,
                f1=2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else None)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--split', default='val')
    parser.add_argument('--original-root', type=Path)
    parser.add_argument('--data-root', type=Path)
    parser.add_argument('--allow-partial-annotations', action='store_true')
    args = parser.parse_args()
    if args.out.exists():
        parser.error('Output exists; choose a new result filename')
    if bool(args.original_root) != bool(args.data_root):
        parser.error('Relocation requires both --original-root and --data-root')
    # Only the detector and schemas are imported: no API startup, pool, camera, or storage.
    from app import detector
    from app.schemas import LiveDetection, DetectionCreate
    from uuid import UUID
    model = detector.load_model('yolov8s-oiv7')
    detector.CONFIDENCE = .25
    detector._selected_classes = {}  # all supported classes; process-local, never persisted
    records = [e for e in json.loads(args.manifest.read_text(encoding='utf-8')) if e.get('split', args.split) == args.split]
    if not records:
        parser.error('No images in requested split')
    # Validate every path/label before loading the model or starting inference.
    prepared = []
    for e in records:
        classes = verified_classes(e, model.classes, args.allow_partial_annotations)
        for name, box in e['truth']:
            if name not in model.classes or len(box) != 4 or not all(math.isfinite(v) for v in box):
                raise ValueError('Invalid class/box: ' + e['id'])
            x, y, w, h = box
            if w <= 0 or h <= 0 or min(x, y) < -1e-5 or x+w > 1.00001 or y+h > 1.00001:
                raise ValueError('Out-of-bounds box: ' + e['id'])
        path = Path(e['path'])
        if args.original_root:
            path = args.data_root / path.relative_to(args.original_root)
        if not path.is_absolute():
            path = args.manifest.parent / path
        if not path.is_file():
            raise FileNotFoundError(path)
        prepared.append((e, path, classes))
    warmup = BytesIO()
    Image.new('RGB', (640, 640)).save(warmup, format='PNG')
    detector.detect(warmup.getvalue(), model)
    totals = {name: Counter(tp=0, fp=0, fn=0) for name in model.classes}
    unscored = Counter()
    per_image = []
    negative_images = alarm_images = negative_boxes = payloads = 0
    for index, (e, path, classes) in enumerate(prepared, 1):
        with Image.open(path) as image:
            if image.getexif().get(274, 1) != 1:
                raise ValueError('Normalize image orientation and GT together before evaluation: ' + e['id'])
            if 'crop' in e:
                stream = BytesIO()
                image.convert('RGB').crop(e['crop']).save(stream, format='PNG')
                data = stream.getvalue()
            else:
                data = path.read_bytes()
        start = time.perf_counter()
        detections = detector.detect(data, model)
        elapsed = (time.perf_counter()-start)*1000
        found = []
        for detection in detections:
            payload = asdict(detection)
            LiveDetection(**payload)
            DetectionCreate(image_id=UUID(int=1), **payload)
            payloads += 1
            found.append((detection.class_label, detection.confidence,
                          [detection.x_min, detection.y_min, detection.width, detection.height]))
        counts = match([p for p in found if p[0] in classes], e['truth'])
        for name, c in counts.items():
            totals[name].update(c)
        unscored.update(p[0] for p in found if p[0] not in classes)
        if not e['truth'] and e.get('verified_empty'):
            negative_images += 1
            alarm_images += bool(found)
            negative_boxes += len(found)
        per_image.append(dict(id=e['id'], source=e.get('source'), inference_ms=elapsed,
                              classes={name: dict(c) for name, c in counts.items()},
                              unscored_predictions=sum(p[0] not in classes for p in found)))
        print(f'{index}/{len(prepared)} {e["id"]}: {len(found)} detections', flush=True)
    result = dict(model=model.version, weights_sha256=digest(model.weights), mapping_sha256=digest(model.weights.with_name('model.json')),
                  manifest_sha256=digest(args.manifest), split=args.split, images=len(records),
                  evaluation_scope='Historical partial-annotation validation, NOT independent test' if args.allow_partial_annotations else 'Complete supplied annotations; independence requires a separate provenance audit',
                  confidence=.25, matching_iou=.5, image_size=640, all_supported_classes=True,
                  classes={name: metrics(c) for name, c in totals.items()},
                  unscored_predictions=dict(unscored), precision_is_conditional=args.allow_partial_annotations,
                  negatives=dict(images=negative_images, alarm_images=alarm_images, false_boxes=negative_boxes),
                  actual_application_contracts_validated=payloads,
                  mean_inference_ms=statistics.mean(e['inference_ms'] for e in per_image),
                  timing_scope='Actual detector.detect: decode, EXIF conversion, inference and conversion; excludes source read/crop preparation, warmup, HTTP, storage and database.',
                  per_image=per_image)
    with args.out.open('x', encoding='utf-8') as stream:
        json.dump(result, stream, indent=2)
    print(json.dumps({k: v for k, v in result.items() if k != 'per_image'}, indent=2))


if __name__ == '__main__':
    main()
