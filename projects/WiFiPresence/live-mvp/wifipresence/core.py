"""Strict NPZ ingestion and transparent motion baselines, independent of the UI."""
from __future__ import annotations

import hashlib
import json
import math
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np


class DataError(ValueError):
    """Input cannot support the requested measurement or comparison."""


@dataclass(frozen=True)
class Config:
    window_s: float = 1.0
    hop_s: float = 0.25
    min_occupancy: float = 0.70
    max_gap_s: float = 0.50
    enter_count: int = 3
    exit_count: int = 8

    def validate(self):
        numbers = (self.window_s, self.hop_s, self.min_occupancy, self.max_gap_s)
        if not all(math.isfinite(x) for x in numbers):
            raise DataError('Configuration values must be finite.')
        if not (0 < self.hop_s <= self.window_s and 0 < self.min_occupancy <= 1 and self.max_gap_s > 0):
            raise DataError('Invalid window, hop, occupancy or gap configuration.')
        if self.enter_count < 1 or self.exit_count < 1:
            raise DataError('Persistence counts must be positive.')


@dataclass
class Capture:
    path: Path
    times: np.ndarray
    amplitude: np.ndarray
    expected_pps: float | None
    duration_s: float
    synthetic: bool
    sha256: str
    info: dict


def _scalar(data, key, default=None):
    if key not in data:
        return default
    item = np.asarray(data[key])
    if item.size != 1:
        raise DataError(f'{key} must be a scalar.')
    value = item.item()
    if isinstance(value, bytes):
        value = value.decode('utf-8')
    return value


def load_capture(path, expected_pps=None):
    path = Path(path).resolve()
    try:
        with np.load(path, allow_pickle=False) as z:
            if 'csi_data' not in z or 'device_ticks_us' not in z:
                raise DataError('Need csi_data and real device_ticks_us. Timing is never invented.')
            raw = np.asarray(z['csi_data'])
            if raw.ndim != 2 or raw.shape[1] != 128 or raw.shape[0] < 2 or raw.dtype != np.int8:
                raise DataError('Supported profile: int8[N,128], N >= 2, 64 logical HT20 subcarriers.')
            if int(_scalar(z, 'num_subcarriers', 64)) != 64:
                raise DataError('Unsupported subcarrier layout.')
            ticks = np.asarray(z['device_ticks_us'])
            if ticks.ndim != 1 or len(ticks) != len(raw) or not np.issubdtype(ticks.dtype, np.number):
                raise DataError('Invalid device timestamp array.')
            ticks = ticks.astype(np.float64)
            if not np.all(np.isfinite(ticks)) or np.any(np.diff(ticks) <= 0):
                raise DataError('Timestamps must increase strictly; repair is not performed silently.')
            times = (ticks - ticks[0]) / 1_000_000.0
            requested = _scalar(z, 'requested_pps')
            stored_rate = float(requested) if requested is not None else None
            supplied_rate = float(expected_pps) if expected_pps is not None else None
            for value in (stored_rate, supplied_rate):
                if value is not None and (not math.isfinite(value) or value <= 0 or value > 10000):
                    raise DataError('Invalid expected packet rate.')
            if stored_rate is not None and supplied_rate is not None and not math.isclose(stored_rate, supplied_rate):
                raise DataError('--expected-pps conflicts with stored requested_pps; it may only fill missing metadata.')
            rate = stored_rate if stored_rate is not None else supplied_rate
            if rate is not None and (not math.isfinite(rate) or rate <= 0 or rate > 10000):
                raise DataError('Invalid expected packet rate.')
            phy_names = ('phy_mode', 'ltf_type', 'channel_width')
            phy_count = sum(name in z for name in phy_names)
            if phy_count not in (0, 3):
                raise DataError('Partial PHY metadata is suspect and unsupported.')
            keep = np.ones(len(raw), dtype=bool)
            if phy_count == 3:
                arrays = [np.asarray(z[name]).astype(str) for name in phy_names]
                if any(a.ndim != 1 or len(a) != len(raw) for a in arrays):
                    raise DataError('PHY array lengths do not match CSI.')
                keep = (arrays[0] == 'ht') & (arrays[1] == 'ht-ltf') & (arrays[2] == '20')
            phy_excluded = int((~keep).sum())
            zero_rows = ~np.any(raw != 0, axis=1)
            keep &= ~zero_rows
            if np.count_nonzero(keep) < 2:
                raise DataError('Fewer than two supported HT20/HT-LTF packets.')
            synthetic_value = _scalar(z, 'synthetic', False)
            if not isinstance(synthetic_value, (bool, int)) or synthetic_value not in (True, False, 0, 1):
                raise DataError('synthetic must be a boolean flag when present.')
            synthetic = bool(synthetic_value)
            duration = float(_scalar(z, 'duration_ms', times[-1] * 1000)) / 1000
            if not math.isfinite(duration) or duration <= 0 or duration > 86400:
                raise DataError('Invalid duration_ms, maximum supported capture is 24 hours.')
            duration = max(duration, float(times[-1]) + (1 / rate if rate else 0))
            info = {
                'path': str(path), 'packets_raw': len(raw), 'packets_supported': int(keep.sum()),
                'packets_phy_excluded': phy_excluded, 'packets_all_zero': int(zero_rows.sum()), 'subcarriers': 64,
                'requested_pps': rate, 'observed_supported_pps': float(keep.sum() / duration),
                'packet_rate_source': 'capture_requested_pps' if stored_rate is not None else
                                      ('explicit_expected_pps' if supplied_rate is not None else 'missing'),
                'duration_s': duration, 'synthetic': synthetic,
                'label': str(_scalar(z, 'label', 'unknown')),
                'firmware_version': str(_scalar(z, 'firmware_version', 'not recorded')),
                'device_id': str(_scalar(z, 'device_id', 'not recorded')),
                'phy_metadata': 'present' if phy_count else 'legacy canonical 64-bin layout',
                'timing': 'device monotonic timestamps',
            }
            if 'raw_stream_sequence' in z:
                seq = np.asarray(z['raw_stream_sequence'])
                if seq.ndim != 1 or len(seq) != len(raw) or not np.issubdtype(seq.dtype, np.integer):
                    raise DataError('Invalid raw_stream_sequence.')
                if any(int(b) <= int(a) for a, b in zip(seq[:-1], seq[1:])):
                    raise DataError('Raw sequence must increase strictly.')
                info['observable_sequence_gaps'] = int(seq[-1]) - int(seq[0]) + 1 - len(seq)
            else:
                info['observable_sequence_gaps'] = None
            values = raw[keep].astype(np.float64)
            # Espressif storage is [Q0,I0,Q1,I1,...]. Null bins remain in the
            # canonical 64-bin score in both calibration and replay.
            amplitude = np.hypot(values[:, 0::2], values[:, 1::2])
            return Capture(path, times[keep], amplitude, rate, duration, synthetic,
                           hashlib.sha256(path.read_bytes()).hexdigest(), info)
    except DataError:
        raise
    except (OSError, ValueError, KeyError, TypeError, OverflowError, EOFError, zipfile.BadZipFile) as exc:
        raise DataError(f'Cannot read {path.name}: {exc}') from exc


def extract_windows(capture, config=Config()):
    config.validate()
    rate = capture.expected_pps
    if rate is None:
        raise DataError('requested_pps missing: provide an explicitly known --expected-pps.')
    count = int(math.floor((capture.duration_s - config.window_s) / config.hop_s + 1e-8)) + 1
    if count < 1:
        raise DataError('Capture is shorter than one complete window.')
    if count > 500000:
        raise DataError('Too many windows; reduce capture duration or increase hop.')
    rows = []
    for index in range(count):
        start = index * config.hop_s
        end = start + config.window_s
        lo, hi = np.searchsorted(capture.times, [start, end], side='left')
        t = capture.times[lo:hi]
        score, reason = None, 'insufficient slot occupancy'
        slots = np.floor((t - start) * rate + 1e-7).astype(np.int64)
        _, first = np.unique(slots, return_index=True)
        occupancy = min(1.0, len(first) / max(1, math.ceil(rate * config.window_s)))
        gap = float(np.max(np.diff(np.concatenate(([start], t, [end])))))
        if occupancy >= config.min_occupancy and gap <= config.max_gap_s and len(first) >= 2:
            score = float(np.median(np.std(capture.amplitude[lo:hi][first], axis=0)))
            reason = 'valid'
        elif gap > config.max_gap_s:
            reason = 'input gap'
        rows.append({'start_s': round(start, 8), 'end_s': round(end, 8),
                     'score': score, 'occupancy': occupancy, 'max_gap_s': gap, 'quality': reason})
    return rows


def fit_model(captures, trial_ids, config=Config()):
    if not captures or len(captures) != len(trial_ids):
        raise DataError('Need identified development empty-room captures.')
    if len({c.synthetic for c in captures}) != 1:
        raise DataError('Real and synthetic calibration must not be mixed.')
    if any(c.expected_pps is None for c in captures):
        raise DataError('Calibration needs a known requested packet rate.')
    rate = captures[0].expected_pps
    if any(not math.isclose(c.expected_pps, rate) for c in captures):
        raise DataError('Calibration rates differ.')
    scores = [r['score'] for c in captures for r in extract_windows(c, config) if r['score'] is not None]
    if len(scores) < 4:
        raise DataError('Need at least four valid development windows. Pilot calibration remains provisional.')
    return {'schema_version': 1, 'method': 'canonical64-amplitude-std-median-v1',
            'config': asdict(config), 'expected_pps': rate,
            'enter_threshold': float(np.quantile(scores, .99)),
            'exit_threshold': float(np.quantile(scores, .95)),
            'synthetic': captures[0].synthetic,
            'fit_trial_ids': list(trial_ids), 'fit_sha256': [c.sha256 for c in captures],
            'fit_window_count': len(scores),
            'status': 'SYNTHETIC SOFTWARE CHECK' if captures[0].synthetic else 'provisional real-data calibration'}


def validate_model(model):
    try:
        if model['schema_version'] != 1 or model['method'] != 'canonical64-amplitude-std-median-v1':
            raise DataError('Unsupported model schema or method.')
        config = Config(**model['config'])
        config.validate()
        a, b, rate = model['enter_threshold'], model['exit_threshold'], model['expected_pps']
        if not all(math.isfinite(float(v)) for v in (a, b, rate)) or not (0 <= b <= a and rate > 0):
            raise DataError('Invalid model thresholds or rate.')
        if not isinstance(model['synthetic'], bool):
            raise DataError('Model synthetic flag must be boolean.')
        if not isinstance(model['fit_sha256'], list) or not isinstance(model['fit_trial_ids'], list):
            raise DataError('Model needs calibration provenance.')
        return config
    except (KeyError, TypeError, ValueError) as exc:
        if isinstance(exc, DataError):
            raise
        raise DataError(f'Invalid model: {exc}') from exc


def predict(capture, model):
    config = validate_model(model)
    if capture.synthetic != model['synthetic']:
        raise DataError('Synthetic calibration cannot be applied to real captures, or vice versa.')
    if capture.expected_pps is None or not math.isclose(capture.expected_pps, model['expected_pps']):
        raise DataError('Capture and model packet-rate profiles differ; recalibrate explicitly.')
    rows = extract_windows(capture, config)
    state, high, low = 'IDLE', 0, 0
    for row in rows:
        score = row['score']
        if score is None:
            row['baseline'] = row['candidate'] = 'UNKNOWN'
            state, high, low = 'IDLE', 0, 0
            continue
        row['baseline'] = 'MOTION' if score > model['enter_threshold'] else 'IDLE'
        if state == 'IDLE':
            high = high + 1 if score > model['enter_threshold'] else 0
            if high >= config.enter_count:
                state, high, low = 'MOTION', 0, 0
        else:
            low = low + 1 if score <= model['exit_threshold'] else 0
            if low >= config.exit_count:
                state, high, low = 'IDLE', 0, 0
        row['candidate'] = state
    return rows


def save_json(path, value):
    path = Path(path)
    payload = json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + '\n'
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open('x', encoding='utf-8') as stream:
            stream.write(payload)
    except FileExistsError as exc:
        raise DataError('Output already exists; choose a new file to preserve existing data.') from exc
