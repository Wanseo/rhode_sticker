"""Webcam fitting of an alpha PNG using MediaPipe's two shoulder landmarks."""
from __future__ import annotations

import argparse
import math
import os
import sys
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_IMAGE = ROOT / "assets" / "robe-full-preview-v1.png"
DEFAULT_MODEL = Path(__file__).resolve().parent / "models" / "pose_landmarker_lite.task"
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
)
# Shoulder seams on the approved 1312 x 1199 robe, in normalized PNG coordinates.
DEFAULT_ANCHORS = (0.31, 0.12, 0.69, 0.12)


@dataclass
class ShoulderPose:
    center: np.ndarray
    width: float
    angle: float  # radians in image coordinates (positive = clockwise)


class ShoulderTracker:
    """Time-based smoothing, short dropout hold, and fade-out on tracking loss."""

    def __init__(self, smoothing=0.08, confidence=0.5, hold=0.15, fade=0.15):
        self.smoothing, self.confidence = smoothing, confidence
        self.hold, self.fade = hold, fade
        self.pose: Optional[ShoulderPose] = None
        self.last_valid: Optional[float] = None

    def reset(self):
        self.pose = None
        self.last_valid = None

    def estimate(self, landmarks, frame_width, frame_height, now):
        measured = None
        if landmarks and len(landmarks) > 12:
            shoulders = [landmarks[11], landmarks[12]]
            confidence = lambda p: min(
                1.0 if getattr(p, "visibility", None) is None else p.visibility,
                1.0 if getattr(p, "presence", None) is None else p.presence,
            )
            points = np.array(
                [[p.x * frame_width, p.y * frame_height] for p in shoulders],
                dtype=np.float64,
            )
            if all(confidence(p) >= self.confidence for p in shoulders) and np.isfinite(points).all():
                points = points[np.argsort(points[:, 0])]
                vector = points[1] - points[0]
                width = float(np.linalg.norm(vector))
                if max(16, frame_width * 0.025) <= width <= frame_width * 2:
                    measured = ShoulderPose(points.mean(axis=0), width, math.atan2(vector[1], vector[0]))
        if measured is not None:
            elapsed = math.inf if self.last_valid is None else max(0.0, now - self.last_valid)
            if self.pose is None or elapsed >= self.hold + self.fade:
                self.pose = measured
            else:
                weight = 1.0 if self.smoothing <= 0 else -math.expm1(-elapsed / self.smoothing)
                difference = math.atan2(
                    math.sin(measured.angle - self.pose.angle),
                    math.cos(measured.angle - self.pose.angle),
                )
                self.pose = ShoulderPose(
                    self.pose.center + weight * (measured.center - self.pose.center),
                    math.exp(math.log(self.pose.width) + weight * math.log(measured.width / self.pose.width)),
                    self.pose.angle + weight * difference,
                )
            self.last_valid = now
            return self.pose, 1.0
        if self.pose is None or self.last_valid is None:
            return None, 0.0
        elapsed = max(0.0, now - self.last_valid)
        if elapsed >= self.hold + self.fade:
            self.reset()
            return None, 0.0
        opacity = 1.0 if elapsed <= self.hold else 1.0 - (elapsed - self.hold) / self.fade
        return self.pose, opacity


class Garment:
    def __init__(self, bgra, anchors=DEFAULT_ANCHORS):
        if bgra is None or bgra.ndim != 3 or bgra.shape[2] != 4:
            raise ValueError("의상은 알파 채널이 있는 BGRA/RGBA PNG여야 합니다.")
        if bgra.dtype != np.uint8:
            raise ValueError("의상은 8비트 RGBA PNG로 저장해주세요.")
        alpha = bgra[..., 3].astype(np.float32) / 255.0
        if not np.any(alpha > 0) or not np.any(alpha < 1):
            raise ValueError("의상 PNG에는 옷과 투명 배경이 모두 있어야 합니다.")
        self.height, self.width = bgra.shape[:2]
        normalized = np.asarray(anchors, dtype=np.float64).reshape(2, 2)
        if not np.isfinite(normalized).all() or (normalized < 0).any() or (normalized > 1).any():
            raise ValueError("어깨 기준점 네 값은 0~1 사이여야 합니다.")
        if normalized[0, 0] >= normalized[1, 0]:
            raise ValueError("첫 번째 어깨 기준점은 이미지의 왼쪽에 있어야 합니다.")
        self.anchors = normalized * [self.width - 1, self.height - 1]
        # Warp premultiplied color AND alpha to prevent dark fringes at rotated edges.
        self.pixels = np.dstack((bgra[..., :3].astype(np.float32) * alpha[..., None], alpha))

    @classmethod
    def load(cls, path, anchors=DEFAULT_ANCHORS):
        path = Path(path)
        if not path.is_file():
            raise FileNotFoundError(f"의상 PNG를 찾을 수 없습니다: {path}")
        # imdecode supports non-ASCII paths on Windows as well.
        return cls(cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_UNCHANGED), anchors)

    def transform(self, pose, scale=1.0, vertical_offset=0.0):
        if not math.isfinite(scale) or scale <= 0 or not math.isfinite(vertical_offset):
            raise ValueError("크기는 양수, 위치 보정은 유한한 값이어야 합니다.")
        source = self.anchors[1] - self.anchors[0]
        ratio = pose.width * scale / np.linalg.norm(source)
        angle = pose.angle - math.atan2(source[1], source[0])
        c, s = math.cos(angle), math.sin(angle)
        linear = ratio * np.array([[c, -s], [s, c]])
        down = np.array([-math.sin(pose.angle), math.cos(pose.angle)])
        target = pose.center + down * pose.width * vertical_offset
        return np.column_stack((linear, target - linear @ self.anchors.mean(axis=0)))

    def blend(self, frame, matrix, opacity=1.0, softness=0.6):
        if frame.ndim != 3 or frame.shape[2] != 3 or frame.dtype != np.uint8:
            raise ValueError("카메라 프레임은 uint8 BGR 이미지여야 합니다.")
        matrix = np.asarray(matrix, dtype=np.float64)
        if matrix.shape != (2, 3) or not np.isfinite(matrix).all():
            raise ValueError("변환 행렬은 유한한 2×3 행렬이어야 합니다.")
        if not math.isfinite(softness) or softness < 0:
            raise ValueError("경계 부드러움은 0 이상의 값이어야 합니다.")
        opacity = float(np.clip(opacity, 0, 1))
        output = frame.copy()
        if opacity == 0:
            return output
        corners = np.array([[0, 0, 1], [self.width, 0, 1], [0, self.height, 1], [self.width, self.height, 1]])
        projected = corners @ matrix.T
        pad = 2 + math.ceil(3 * softness)
        left, top = np.floor(projected.min(axis=0)).astype(int) - pad
        right, bottom = np.ceil(projected.max(axis=0)).astype(int) + pad
        left, top = max(0, left), max(0, top)
        right, bottom = min(frame.shape[1], right), min(frame.shape[0], bottom)
        if right <= left or bottom <= top:
            return output
        local = matrix.copy()
        local[:, 2] -= [left, top]
        warped = cv2.warpAffine(
            self.pixels, local, (right - left, bottom - top),
            flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0),
        )
        if softness > 0:
            warped = cv2.GaussianBlur(warped, (0, 0), softness, borderType=cv2.BORDER_CONSTANT)
        alpha = np.clip(warped[..., 3:4] * opacity, 0, 1)
        background = frame[top:bottom, left:right].astype(np.float32)
        blended = warped[..., :3] * opacity + background * (1 - alpha)
        output[top:bottom, left:right] = np.clip(np.rint(blended), 0, 255).astype(np.uint8)
        return output


def ensure_model(path):
    path = Path(path).expanduser().resolve()
    if path.is_file() and path.stat().st_size > 0:
        return path
    if path != DEFAULT_MODEL.resolve():
        raise FileNotFoundError(f"지정한 Pose 모델 파일을 찾을 수 없습니다: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    print("MediaPipe Pose Lite 모델을 다운로드합니다...")
    temporary = None
    try:
        with urllib.request.urlopen(MODEL_URL, timeout=45) as response:
            with tempfile.NamedTemporaryFile(dir=path.parent, suffix=".part", delete=False) as target:
                temporary = Path(target.name)
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    target.write(chunk)
        if temporary.stat().st_size < 1024:
            raise ValueError("다운로드한 모델 파일이 올바르지 않습니다.")
        os.replace(temporary, path)
        return path
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def render_demo(garment, destination):
    """Synthetic preview of the transform; never opens a camera or infers a pose."""
    frame = np.full((720, 960, 3), (105, 100, 93), dtype=np.uint8)
    for x in range(0, 960, 40):
        cv2.line(frame, (x, 0), (x, 719), (115, 110, 103), 1)
    pose = ShoulderPose(np.array([480.0, 220.0]), 240.0, math.radians(8))
    frame = garment.blend(frame, garment.transform(pose), softness=0.6)
    cv2.putText(frame, "Synthetic preview - not a webcam capture", (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (245, 245, 245), 1, cv2.LINE_AA)
    path = Path(destination)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(path), frame):
        raise OSError(f"미리보기를 저장하지 못했습니다: {path}")
    print(f"합성 미리보기 저장: {path}")


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--image", type=Path, default=DEFAULT_IMAGE, help="투명 PNG 의상")
    p.add_argument("--anchors", nargs=4, type=float, default=DEFAULT_ANCHORS, metavar=("LEFT_X", "LEFT_Y", "RIGHT_X", "RIGHT_Y"), help="PNG 안의 좌우 어깨 위치(0~1)")
    p.add_argument("--camera", type=int, default=0)
    p.add_argument("--input", type=Path, help="웹캠 대신 처리할 영상 파일")
    p.add_argument("--output", type=Path, help="결과 영상 경로(.mp4 또는 .avi)")
    p.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    p.add_argument("--download-model-only", action="store_true")
    p.add_argument("--demo", type=Path, metavar="PNG", help="카메라 없이 합성 예시 PNG 생성")
    p.add_argument("--width", type=int, default=960)
    p.add_argument("--height", type=int, default=720)
    p.add_argument("--mirror", action=argparse.BooleanOptionalAction, default=True)
    p.add_argument("--scale", type=float, default=1.0)
    p.add_argument("--vertical-offset", type=float, default=0.0, help="어깨 너비에 대한 비율. 양수는 아래로 이동")
    p.add_argument("--smooth-time", type=float, default=0.08, help="추적 보정 시간(초); 0이면 보정 없음")
    p.add_argument("--softness", type=float, default=0.6, help="PNG 경계 보간 부드러움(픽셀)")
    p.add_argument("--headless", action="store_true", help="OpenCV 창을 띄우지 않음")
    p.add_argument("--max-frames", type=int, default=0, help="0이면 종료할 때까지 처리")
    p.add_argument("--debug", action="store_true", help="어깨 기준점과 추적 상태 표시")
    return p


def run(args):
    if args.scale <= 0 or args.smooth_time < 0 or args.softness < 0:
        raise ValueError("--scale은 양수, --smooth-time과 --softness는 0 이상이어야 합니다.")
    if not all(math.isfinite(v) for v in [args.scale, args.smooth_time, args.softness, args.vertical_offset]):
        raise ValueError("보정값은 유한한 숫자여야 합니다.")
    if min(args.width, args.height) < 1 or args.max_frames < 0:
        raise ValueError("카메라 크기는 양수, --max-frames는 0 이상이어야 합니다.")
    if args.input and not args.input.is_file():
        raise FileNotFoundError(f"입력 영상을 찾을 수 없습니다: {args.input}")
    if args.output and args.output.suffix.lower() not in (".mp4", ".avi"):
        raise ValueError("--output은 .mp4 또는 .avi 경로로 지정해주세요.")
    if args.input and args.output and args.input.resolve() == args.output.resolve():
        raise ValueError("입력과 출력 영상은 서로 다른 파일이어야 합니다.")
    if args.download_model_only:
        print(ensure_model(args.model))
        return
    garment = Garment.load(args.image, args.anchors)
    if args.demo:
        render_demo(garment, args.demo)
        return
    import mediapipe as mp
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision

    model = ensure_model(args.model)
    options = vision.PoseLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=str(model)),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    source = str(args.input) if args.input else args.camera
    capture = cv2.VideoCapture(source)
    writer = None
    try:
        if not capture.isOpened():
            raise RuntimeError("영상 입력을 열지 못했습니다. 카메라 번호·권한 또는 영상 파일 경로를 확인해주세요.")
        if not args.input:
            capture.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
            capture.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)
            capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        fps = capture.get(cv2.CAP_PROP_FPS)
        fps = fps if math.isfinite(fps) and fps > 0 else 30.0
        tracker = ShoulderTracker(args.smooth_time)
        frame_count, last_timestamp = 0, -1
        scale, offset, debug = args.scale, args.vertical_offset, args.debug
        if not args.headless:
            print("Q/ESC 종료 · +/- 크기 · W/S 위아래 이동 · R 보정 초기화 · D 어깨 표시")
        with vision.PoseLandmarker.create_from_options(options) as landmarker:
            while True:
                ok, frame = capture.read()
                if not ok:
                    if frame_count == 0 or not args.input:
                        raise RuntimeError("카메라/영상에서 프레임을 읽지 못했습니다.")
                    break
                if args.mirror:
                    frame = cv2.flip(frame, 1)
                height, width = frame.shape[:2]
                timestamp = int(frame_count * 1000 / fps) if args.input else time.monotonic_ns() // 1_000_000
                timestamp = max(last_timestamp + 1, timestamp)
                last_timestamp = timestamp
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = landmarker.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), timestamp)
                landmarks = result.pose_landmarks[0] if result.pose_landmarks else None
                pose, opacity = tracker.estimate(landmarks, width, height, timestamp / 1000.0)
                display = garment.blend(frame, garment.transform(pose, scale, offset), opacity, args.softness) if pose else frame.copy()
                if debug:
                    if landmarks:
                        for index in (11, 12):
                            p = landmarks[index]
                            cv2.circle(display, (round(p.x * width), round(p.y * height)), 5, (0, 220, 255), -1)
                    status = "Shoulders tracked" if opacity == 1 else "Show both shoulders"
                    cv2.putText(display, f"{status} | scale {scale:.2f} | offset {offset:+.2f}", (15, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)
                if args.output:
                    if writer is None:
                        args.output.parent.mkdir(parents=True, exist_ok=True)
                        fourcc = cv2.VideoWriter_fourcc(*("MJPG" if args.output.suffix.lower() == ".avi" else "mp4v"))
                        writer = cv2.VideoWriter(str(args.output), fourcc, fps, (width, height))
                        if not writer.isOpened():
                            raise RuntimeError(f"결과 영상 파일을 생성하지 못했습니다: {args.output}")
                    writer.write(display)
                frame_count += 1
                if args.max_frames and frame_count >= args.max_frames:
                    break
                if not args.headless:
                    cv2.imshow("Rhode - virtual fitting", display)
                    key = cv2.waitKey(1) & 0xFF
                    if key in (27, ord("q"), ord("Q")) or cv2.getWindowProperty("Rhode - virtual fitting", cv2.WND_PROP_VISIBLE) < 1:
                        break
                    if key in (ord("+"), ord("=")):
                        scale = min(3.0, scale + 0.03)
                    elif key == ord("-"):
                        scale = max(0.2, scale - 0.03)
                    elif key in (ord("w"), ord("W")):
                        offset -= 0.02
                    elif key in (ord("s"), ord("S")):
                        offset += 0.02
                    elif key in (ord("r"), ord("R")):
                        scale, offset = args.scale, args.vertical_offset
                        tracker.reset()
                    elif key in (ord("d"), ord("D")):
                        debug = not debug
            print(f"처리 완료: {frame_count} 프레임")
    finally:
        capture.release()
        if writer is not None:
            writer.release()
        if not args.headless:
            cv2.destroyAllWindows()


def main():
    args = parser().parse_args()
    try:
        run(args)
    except KeyboardInterrupt:
        return 130
    except (ValueError, OSError, RuntimeError, urllib.error.URLError, cv2.error) as error:
        print(f"오류: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
