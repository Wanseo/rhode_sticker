# Python 실시간 가상 피팅

승인된 투명 PNG `../assets/robe-full-preview-v1.png`를 웹캠 영상에 합성합니다. 기존 웹사이트의 JavaScript와 스타일에는 영향을 주지 않는 별도 프로그램입니다.

## 설치 및 실행

프로젝트 루트에서 실행합니다. Python 3.9 이상을 사용하세요. macOS Apple Silicon / Python 3.9.6에서 의존성 설치와 자동 검사를 수행했습니다.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r python_fitting/requirements.txt
python python_fitting/virtual_fitting.py
```

Windows에서는 활성화 명령을 `.venv\Scripts\activate`로 바꿉니다. 카메라 권한은 프로그램 실행 시 허용해주세요. 첫 실행에서는 Google의 Pose Lite 모델을 `python_fitting/models/`에 자동 다운로드합니다. 카메라 번호가 다르면 `--camera 1`을 사용합니다.

`opencv-contrib-python`이 `cv2`를 제공합니다. MediaPipe의 의존성과 맞추기 위해 이 패키지 하나를 사용하며, 같은 환경에 `opencv-python`이나 `opencv-python-headless`를 중복 설치하지 않습니다.

## 동작 방식

1. MediaPipe Tasks Pose Landmarker의 `VIDEO` 모드로 양쪽 어깨(11, 12번)를 찾습니다. 미러링한 프레임에서 추론하므로 화면과 추적 좌표가 일치합니다.
2. 의상 PNG의 어깨 기준점 사이 거리와 사용자의 실제 어깨 거리를 비교해 배율을 구합니다. 두 어깨를 잇는 선의 각도로 회전하고, 양쪽 중심을 맞춥니다.
3. 위치·크기·회전을 시간 기준으로 보정해 작은 흔들림을 줄입니다. 어깨 인식을 잠깐 놓치면 최대 0.15초 유지한 뒤 0.15초 동안 사라집니다.
4. **RGB에 알파를 먼저 곱한 상태**로 선형 보간과 회전을 수행합니다. 마지막 합성은 `의상 RGB × 알파 + 카메라 RGB × (1 - 알파)`이며, 회전한 투명 경계의 검은 테두리를 방지합니다.
5. 화면 밖으로 나간 의상은 프레임과 겹치는 영역만 잘라 합성합니다. 카메라와 창은 종료 시 해제됩니다.

모델 처리와 화면 출력은 한 프레임씩 진행합니다. 이 버전은 **어깨를 기준으로 2D 이미지 전체를 이동·확대·회전**하며, 팔꿈치에 따라 소매를 따로 변형하거나 손·얼굴의 앞뒤를 분리하는 기능은 포함하지 않습니다. PNG의 목 구멍과 소매 사이 빈 공간은 원래 알파를 유지합니다.

## 크기와 위치 조정

기본 PNG의 어깨 기준점은 `(0.31, 0.12)`, `(0.69, 0.12)`입니다. 이미지 너비·높이에 대한 0~1 비율입니다. 실제 착용 높이와 크기는 카메라 거리와 체형에 맞게 조정할 수 있습니다.

| 키 | 동작 |
| --- | --- |
| `+` / `-` | 의상 크기 조정 |
| `W` / `S` | 위 / 아래로 이동 |
| `R` | 시작 보정값과 추적 상태 초기화 |
| `D` | 어깨 좌표·추적 상태 표시 |
| `Q` / `Esc` | 종료 |

```bash
python python_fitting/virtual_fitting.py --scale 1.08 --vertical-offset 0.08 --debug
```

`--vertical-offset`은 어깨 너비에 대한 비율이며, 양수면 아래로 이동합니다. `--smooth-time`은 기본 0.08초이고, 더 빠른 반응이 필요하면 줄입니다. `--softness`는 PNG 가장자리의 부드러움(기본 0.6픽셀)입니다. `--no-mirror`로 좌우 반전을 끌 수 있습니다.

다른 티셔츠 PNG에도 같은 코드를 사용할 수 있습니다. 그 이미지에서 실제 좌우 어깨에 해당하는 기준점을 지정해주세요.

```bash
python python_fitting/virtual_fitting.py --image /path/to/tshirt.png --anchors 0.25 0.16 0.75 0.16
```

## 카메라 없이 확인

숫자 기반 검사에는 카메라·모델 다운로드가 필요하지 않습니다.

```bash
python -m unittest discover -s python_fitting -v
python python_fitting/virtual_fitting.py --demo python_fitting/output/demo.png
python python_fitting/virtual_fitting.py --download-model-only
```

검사에는 어깨 매핑, 회전·위치 보정, 미러링, 추적 보정·유실, 알파 블렌딩, 투명 RGB의 경계 번짐, 화면 밖 클리핑이 포함됩니다. `--demo`는 가짜 어깨 좌표를 이용한 합성 예시이며 실제 웹캠 결과가 아닙니다.

미리 녹화한 영상도 처리할 수 있습니다.

```bash
python python_fitting/virtual_fitting.py --input input.mp4 --output python_fitting/output/fitted.mp4 --no-mirror --headless
```

실제 웹캠의 착용 위치와 프레임 속도는 사용자 카메라에서 확인해야 합니다. 모델·가상환경·검사 출력은 Git에 포함하지 않습니다.

이번 환경에서는 자동 검사 10개, 빈 영상 6프레임, MediaPipe 테스트용 인물 이미지로 만든 회전 영상 12프레임의 모델 추론·합성·파일 저장을 확인했습니다. 실제 카메라 촬영은 실행하지 않았습니다. [MediaPipe 공식 Pose 검사 코드](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/python/test/vision/pose_landmarker_test.py)에서 사용하는 `pose.jpg`는 검사 출력 폴더에만 보관했습니다.

## 참고한 공식 문서

- [MediaPipe Pose Landmarker Python 가이드](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker?tab=Python)
- [MediaPipe Python 설치 가이드](https://developers.google.com/edge/mediapipe/solutions/setup_python)
- [OpenCV 기하 변환 및 warpAffine](https://docs.opencv.org/4.x/da/d54/group__imgproc__transform.html)
