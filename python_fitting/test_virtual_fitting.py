"""Numerical tests: no webcam, GUI window or model download is needed."""
import math
import unittest
from types import SimpleNamespace

import numpy as np

from virtual_fitting import DEFAULT_IMAGE, Garment, ShoulderPose, ShoulderTracker


def landmarks(a=(0.3, 0.4), b=(0.7, 0.4), confidence=1.0):
    points = [SimpleNamespace(x=0.0, y=0.0, visibility=1.0, presence=1.0) for _ in range(33)]
    points[11] = SimpleNamespace(x=a[0], y=a[1], visibility=confidence, presence=confidence)
    points[12] = SimpleNamespace(x=b[0], y=b[1], visibility=confidence, presence=confidence)
    return points


def sample_garment():
    image = np.zeros((100, 100, 4), dtype=np.uint8)
    image[10:90, 10:90] = (160, 180, 220, 255)
    return Garment(image, (0.2, 0.3, 0.8, 0.3))


class FittingTests(unittest.TestCase):
    def test_approved_asset_is_loaded_with_real_alpha(self):
        garment = Garment.load(DEFAULT_IMAGE)
        self.assertEqual((garment.width, garment.height), (1312, 1199))
        self.assertEqual(float(garment.pixels[..., 3].min()), 0)
        self.assertGreater(float(garment.pixels[..., 3].max()), 0.99)

    def test_both_shoulder_anchors_match_after_scale_rotation_translation(self):
        garment = sample_garment()
        pose = ShoulderPose(np.array([300.0, 240.0]), 180.0, math.radians(27))
        matrix = garment.transform(pose)
        actual = np.column_stack((garment.anchors, np.ones(2))) @ matrix.T
        axis = np.array([math.cos(pose.angle), math.sin(pose.angle)])
        expected = np.array([pose.center - axis * 90, pose.center + axis * 90])
        np.testing.assert_allclose(actual, expected, atol=1e-6)

    def test_offset_follows_body_down_axis(self):
        garment = sample_garment()
        pose = ShoulderPose(np.array([100.0, 100.0]), 80.0, math.radians(20))
        first = garment.transform(pose)
        shifted = garment.transform(pose, vertical_offset=0.2)
        np.testing.assert_allclose(shifted[:, 2] - first[:, 2], [-math.sin(pose.angle) * 16, math.cos(pose.angle) * 16])

    def test_alpha_blend_matches_expected_colors(self):
        image = np.zeros((2, 2, 4), dtype=np.uint8)
        image[0, 0] = (200, 100, 50, 255)
        image[1, 0] = (200, 100, 50, 128)
        garment = Garment(image)
        background = np.full((2, 2, 3), 20, dtype=np.uint8)
        output = garment.blend(background, np.array([[1, 0, 0], [0, 1, 0]]), softness=0)
        np.testing.assert_array_equal(output[0, 0], image[0, 0, :3])
        expected = np.rint(np.array([200, 100, 50]) * (128 / 255) + 20 * (127 / 255)).astype(np.uint8)
        np.testing.assert_array_equal(output[1, 0], expected)
        np.testing.assert_array_equal(output[:, 1], background[:, 1])
        np.testing.assert_array_equal(background, np.full((2, 2, 3), 20, dtype=np.uint8))

    def test_rotated_transparent_rgb_does_not_create_dark_or_colored_fringe(self):
        image = np.zeros((4, 4, 4), dtype=np.uint8)
        image[..., :3] = (255, 0, 0)  # Hidden blue under alpha=0 must never bleed.
        image[1:3, 1:3] = (255, 255, 255, 255)
        garment = Garment(image)
        angle, scale = math.radians(31), 4.0
        matrix = np.array([[math.cos(angle) * scale, -math.sin(angle) * scale, 8], [math.sin(angle) * scale, math.cos(angle) * scale, 3]])
        output = garment.blend(np.full((30, 30, 3), 255, dtype=np.uint8), matrix, opacity=0.6, softness=0.7)
        np.testing.assert_array_equal(output, np.full((30, 30, 3), 255, dtype=np.uint8))

    def test_partly_and_completely_outside_frame(self):
        garment = sample_garment()
        frame = np.zeros((32, 32, 3), dtype=np.uint8)
        partial = garment.blend(frame, np.array([[1, 0, -70], [0, 1, -70]]), softness=0)
        self.assertEqual(partial.shape, frame.shape)
        self.assertTrue(partial.any())
        outside = garment.blend(frame, np.array([[1, 0, -1000], [0, 1, -1000]]))
        np.testing.assert_array_equal(outside, frame)

    def test_mirrored_landmark_order_produces_same_fit(self):
        first, _ = ShoulderTracker().estimate(landmarks(), 640, 480, 0)
        second, _ = ShoulderTracker().estimate(landmarks((0.7, 0.4), (0.3, 0.4)), 640, 480, 0)
        np.testing.assert_allclose(first.center, second.center)
        self.assertAlmostEqual(first.width, second.width)
        self.assertAlmostEqual(first.angle, second.angle)

    def test_smoothing_uses_elapsed_time(self):
        tracker = ShoulderTracker(smoothing=0.1)
        start, _ = tracker.estimate(landmarks(), 640, 480, 0)
        end, _ = tracker.estimate(landmarks((0.4, 0.4), (0.8, 0.4)), 640, 480, 0.1)
        weight = 1 - math.exp(-1)
        self.assertAlmostEqual(end.center[0], start.center[0] + 64 * weight)
        self.assertGreater(end.width, 0)

    def test_tracking_loss_fades_then_resets_before_reacquisition(self):
        tracker = ShoulderTracker()
        tracker.estimate(landmarks(), 640, 480, 0)
        pose, opacity = tracker.estimate(None, 640, 480, 0.2)
        self.assertIsNotNone(pose)
        self.assertTrue(0 < opacity < 1)
        self.assertEqual(tracker.estimate(None, 640, 480, 0.31), (None, 0.0))
        pose, opacity = tracker.estimate(landmarks((0.1, 0.3), (0.4, 0.3)), 640, 480, 0.4)
        np.testing.assert_allclose(pose.center, [160, 144])
        self.assertEqual(opacity, 1)

    def test_bad_landmarks_and_nontransparent_images_are_rejected(self):
        self.assertEqual(ShoulderTracker().estimate(landmarks(confidence=0.1), 640, 480, 0), (None, 0.0))
        self.assertEqual(ShoulderTracker().estimate(landmarks((float("nan"), 0.4)), 640, 480, 0), (None, 0.0))
        with self.assertRaises(ValueError):
            Garment(np.full((10, 10, 4), 255, dtype=np.uint8))
        with self.assertRaises(ValueError):
            Garment(np.zeros((10, 10, 3), dtype=np.uint8))


if __name__ == "__main__":
    unittest.main()
