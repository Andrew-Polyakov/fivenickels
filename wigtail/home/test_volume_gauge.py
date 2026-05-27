"""Unit tests for relative volume gauge helpers."""

from django.test import SimpleTestCase

from home.volume_gauge import (
    build_volume_gauge_payload,
    gauge_position_pct,
    relative_volume_ratio,
    _ratio_from_daily_bars,
)


class RelativeVolumeRatioTests(SimpleTestCase):
    def test_ratio_is_current_over_average(self):
        self.assertAlmostEqual(relative_volume_ratio(200, [100, 100, 100]), 2.0)

    def test_empty_history_returns_none(self):
        self.assertIsNone(relative_volume_ratio(100, []))


class GaugePositionTests(SimpleTestCase):
    def test_one_x_is_center(self):
        self.assertEqual(gauge_position_pct(1.0), 50)

    def test_clamps_high(self):
        self.assertEqual(gauge_position_pct(4.0), 100)


class DailyBarsRatioTests(SimpleTestCase):
    def test_uses_snapshot_over_last_bar(self):
        bars = [{"v": 1_000_000}] * 10 + [{"v": 500_000}]
        ratio = _ratio_from_daily_bars(bars, snapshot_day_volume=2_000_000)
        self.assertAlmostEqual(ratio, 2.0)


class BuildPayloadTests(SimpleTestCase):
    def test_payload_includes_timeframe_label(self):
        p = build_volume_gauge_payload(1.5, timeframe="1Day")
        self.assertIsNotNone(p)
        assert p is not None
        self.assertEqual(p["timeframe_label"], "Daily")
        self.assertEqual(p["ratio_formatted"], "1.5×")
