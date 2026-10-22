"""Manifest integrity, independent evaluation and clearly marked synthetic fixtures."""
from __future__ import annotations

import csv
import html
import json
from pathlib import Path

import numpy as np

from .core import DataError, fit_model, load_capture, predict, save_json

SCENARIOS = {
    'S1': ('empty', 'none', 'off'), 'S2': ('present', 'walking', 'off'),
    'S3': ('present', 'still', 'off'), 'S4': ('empty', 'none', 'on'),
    'S5': ('present', 'walking', 'on'), 'S6': ('present', 'still', 'on'),
}
SPLITS = {'development', 'validation', 'test', 'exclude'}


def read_manifest(path):
    path = Path(path).resolve()
    records, ids, hashes = [], set(), set()
    try:
        lines = path.read_text(encoding='utf-8-sig').splitlines()
    except OSError as exc:
        raise DataError(f'Cannot read manifest: {exc}') from exc
    for n, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            r = json.loads(line)
            required = {'trial_id', 'file', 'scenario', 'split', 'room', 'device'}
            if not isinstance(r, dict) or not required.issubset(r):
                raise DataError(f'Manifest line {n}: missing required fields.')
            if any(not isinstance(r[k], str) or not r[k].strip() for k in required):
                raise DataError(f'Manifest line {n}: required fields must be nonempty strings.')
            if r['trial_id'] in ids or r['split'] not in SPLITS or r['scenario'] not in {*SCENARIOS, 'TRANSITION'}:
                raise DataError(f'Manifest line {n}: duplicate trial, invalid split or scenario.')
            p = (path.parent / r['file']).resolve()
            if not p.is_file():
                raise DataError(f'Manifest line {n}: file not found: {p}')
            digest = __import__('hashlib').sha256(p.read_bytes()).hexdigest()
            if digest in hashes:
                raise DataError('Duplicate raw file content across trial IDs: possible data leakage.')
            ids.add(r['trial_id']); hashes.add(digest)
            r['_path'], r['_sha256'] = str(p), digest
            if r['scenario'] == 'TRANSITION':
                events = r.get('motion_events')
                if not isinstance(events, list) or not events:
                    raise DataError('TRANSITION needs motion_events with real start_s/end_s markers.')
                last = -1.0
                for e in events:
                    start, end = float(e['start_s']), float(e['end_s'])
                    if not np.isfinite([start, end]).all() or not (0 <= start < end and start >= last):
                        raise DataError('Motion events must be finite, ordered and non-overlapping.')
                    uncertainty = e.get('timing_uncertainty_s')
                    if uncertainty is not None and (not np.isfinite(float(uncertainty)) or float(uncertainty) < 0):
                        raise DataError('Invalid timing uncertainty.')
                    last = end
            records.append(r)
        except (ValueError, TypeError, KeyError, OSError) as exc:
            if isinstance(exc, DataError):
                raise
            raise DataError(f'Manifest line {n}: {exc}') from exc
    if not records:
        raise DataError('Manifest is empty.')
    return records


def calibrate_manifest(path, config, expected_pps=None):
    records = read_manifest(path)
    selected = [r for r in records if r['split'] == 'development' and r['scenario'] == 'S1']
    if not selected:
        raise DataError('Calibration uses only development S1 (empty, fan off) trials.')
    return fit_model([load_capture(r['_path'], expected_pps) for r in selected],
                     [r['trial_id'] for r in selected], config)


def write_predictions(path, rows):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    names = ['start_s', 'end_s', 'score', 'occupancy', 'max_gap_s', 'quality', 'baseline', 'candidate']
    try:
        with path.open('x', newline='', encoding='utf-8-sig') as stream:
            writer = csv.DictWriter(stream, fieldnames=names)
            writer.writeheader(); writer.writerows({k: r[k] for k in names} for r in rows)
    except FileExistsError as exc:
        raise DataError('Output already exists; choose a new file to preserve existing data.') from exc


def event_latencies(rows, events, method):
    result = []
    for e in events:
        start, end = float(e['start_s']), float(e['end_s'])
        # Windows are right-open: a window ending at onset contains no post-onset data.
        before = [r for r in rows if r['end_s'] <= start]
        confounded = bool(before and before[-1][method] == 'MOTION')
        observations = [r for r in rows if start < r['end_s'] <= end]
        valid = [r for r in observations if r[method] != 'UNKNOWN']
        hits = [r for r in valid if r[method] == 'MOTION']
        coverage = 'unavailable' if not valid else ('partial' if len(valid) < len(observations) else 'complete')
        status = ('preexisting_motion' if confounded else 'unavailable' if not valid else
                  'detected' if hits else 'not_detected_partial_observation' if coverage == 'partial' else 'not_detected')
        result.append({'start_s': start, 'end_s': end, 'status': status,
                       'latency_s': round(hits[0]['end_s'] - start, 8) if hits and not confounded else None,
                       'observation_status': coverage, 'valid_observations': len(valid),
                       'unknown_observations': len(observations) - len(valid),
                       'timing_uncertainty_s': e.get('timing_uncertainty_s')})
    return result


def trial_metrics(record, rows, method):
    unknown = sum(r[method] == 'UNKNOWN' for r in rows)
    motion = sum(r[method] == 'MOTION' for r in rows)
    valid = len(rows) - unknown
    scenario = record['scenario']
    metric = 'transition_only' if scenario == 'TRANSITION' else (
        'empty_false_positive_fraction' if SCENARIOS[scenario][0] == 'empty' else
        'walking_detection_fraction' if SCENARIOS[scenario][1] == 'walking' else
        'stationary_motion_fraction_EXPLORATORY')
    return {'trial_id': record['trial_id'], 'scenario': scenario, 'method': method,
            'windows': len(rows), 'valid_windows': valid, 'unknown_windows': unknown,
            'motion_windows': motion, 'unknown_fraction': unknown / len(rows),
            'metric': metric, 'value': motion / valid if valid and scenario != 'TRANSITION' else None,
            'events': event_latencies(rows, record.get('motion_events', []), method)}


def evaluate_manifest(manifest, model, out, split='test', expected_pps=None):
    records = read_manifest(manifest)
    chosen = [r for r in records if r['split'] == split]
    if not chosen:
        raise DataError(f'No {split} trials.')
    out = Path(out).resolve()
    if out.exists() and any(out.iterdir()):
        raise DataError('Report directory must be empty; choose a new output to preserve earlier results.')
    out.mkdir(parents=True, exist_ok=True)
    metrics, sources = [], []
    for r in chosen:
        if r['_sha256'] in model['fit_sha256'] or r['trial_id'] in model['fit_trial_ids']:
            raise DataError('Evaluation overlaps calibration data. No independent result can be reported.')
        capture = load_capture(r['_path'], expected_pps)
        if any(float(e['end_s']) > capture.duration_s for e in r.get('motion_events', [])):
            raise DataError('Motion event is outside the capture interval, relative to the first raw timestamp.')
        rows = predict(capture, model)
        # Filenames use a digest; a user-provided trial ID never becomes a path.
        stem = r['_sha256'][:16]
        write_predictions(out / f'{stem}.csv', rows)
        sources.append({'trial_id': r['trial_id'], 'sha256': capture.sha256,
                        'scenario': r['scenario'], 'synthetic': capture.synthetic,
                        'prediction_file': f'{stem}.csv', 'capture_info': capture.info})
        metrics.extend(trial_metrics(r, rows, m) for m in ('baseline', 'candidate'))
    groups = []
    for scenario in sorted({m['scenario'] for m in metrics}):
        for method in ('baseline', 'candidate'):
            subset = [m for m in metrics if m['scenario'] == scenario and m['method'] == method]
            total = sum(m['windows'] for m in subset)
            valid = sum(m['valid_windows'] for m in subset)
            positive = sum(m['motion_windows'] for m in subset)
            groups.append({'scenario': scenario, 'method': method, 'trials': len(subset),
                           'metric': subset[0]['metric'], 'valid_windows': valid,
                           'pooled_value': positive / valid if valid and scenario != 'TRANSITION' else None,
                           'mean_trial_value': float(np.mean([m['value'] for m in subset if m['value'] is not None]))
                           if any(m['value'] is not None for m in subset) else None,
                           'unknown_fraction': (total - valid) / total})
    lookup = {(g['scenario'], g['method']): g['pooled_value'] for g in groups}
    needed = [(s, m) for s in ('S2', 'S4', 'S5') for m in ('baseline', 'candidate')]
    if any(lookup.get(k) is None for k in needed):
        gate = 'NOT ASSESSABLE: missing valid S2/S4/S5 data.'
    elif lookup['S4', 'baseline'] == 0:
        gate = 'NO OBSERVED ROOM FOR FALSE-POSITIVE REDUCTION in S4.'
    else:
        passes = lookup['S4', 'candidate'] < lookup['S4', 'baseline'] and all(
            lookup[s, 'candidate'] >= lookup[s, 'baseline'] - .05 for s in ('S2', 'S5'))
        gate = 'MEETS EXPLORATORY RATE GATE; review latency and limitations.' if passes else 'DOES NOT MEET EXPLORATORY RATE GATE.'
    synthetic = bool(model['synthetic'])
    report = {'status': 'SYNTHETIC SOFTWARE CHECK - NO HUMAN PERFORMANCE CLAIM' if synthetic else
              'PROVISIONAL REAL-CAPTURE EVALUATION - REVIEW LABELS AND TIMING',
              'synthetic': synthetic, 'split': split, 'trial_count': len(chosen), 'model': model,
              'rate_gate': gate, 'group_metrics': groups, 'trial_metrics': metrics, 'sources': sources,
              'limitations': ['IDLE means no detected motion, not absence.',
                  'Overlapping windows are correlated; trial counts are the independent reporting unit.',
                  'Stationary motion fractions are not occupancy accuracy.',
                  'Stable trials have no onset latency; event markers are required.',
                  'This software does not validate truth labels or a real device automatically.']}
    save_json(out / 'report.json', report)
    def esc(x):
        return html.escape(str(x))
    def number(v):
        return 'N/A' if v is None else f'{v:.3%}'
    table = ''.join('<tr>' + ''.join(f'<td>{esc(v)}</td>' for v in (
        g['scenario'], g['method'], g['trials'], g['metric'], number(g['pooled_value']),
        number(g['unknown_fraction']))) + '</tr>' for g in groups)
    individual = ''.join(f'<li>{esc(s["trial_id"])}: <a href="{esc(s["prediction_file"])}">predictions CSV</a></li>' for s in sources)
    (out / 'report.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8">'
        '<title>WiFiPresence evaluation</title><style>body{font:17px Arial;max-width:1100px;margin:40px auto;padding:20px;color:#142334}'
        'h1{font-size:27px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbc6d0;padding:9px;text-align:left}'
        'th{background:#eaf1f6}.status{background:#fff1cf;padding:15px}li{margin:7px 0}</style>'
        f'<h1>WiFiPresence evaluation</h1><p class="status">{esc(report["status"])}</p>'
        f'<p>{esc(gate)}</p><p>{len(chosen)} complete trials. Full configuration, per-trial metrics and event latency are in '
        '<a href="report.json">report.json</a>.</p><table><tr><th>Scene</th><th>Method</th><th>Trials</th>'
        '<th>Measure</th><th>Fraction</th><th>UNKNOWN</th></tr>' + table + '</table><h2>Limits</h2><ul>' +
        ''.join(f'<li>{esc(x)}</li>' for x in report['limitations']) + '</ul><h2>Trial outputs</h2><ul>' + individual +
        '</ul></html>', encoding='utf-8')
    return report


def synthetic_fixture(path, scenario='S1', seed=0, duration_s=6, dropout=False):
    rng = np.random.default_rng(seed)
    t = np.arange(round(duration_s * 100)) / 100
    base = rng.normal(36, 2, (1, 64))
    amplitude = base + rng.normal(0, .85, (len(t), 64))
    if scenario in ('S2', 'S5'):
        amplitude += 7 * np.sin(2 * np.pi * 2 * t)[:, None]
    if scenario in ('S4', 'S5', 'S6'):
        amplitude[(t > 2) & (t < 2.08)] += 12
    if scenario in ('S3', 'S6'):
        amplitude += .2 * np.sin(2 * np.pi * .3 * t)[:, None]
    raw = np.zeros((len(t), 128), dtype=np.int8)
    raw[:, 1::2] = np.rint(np.clip(amplitude, -127, 127)).astype(np.int8)
    keep = ~((t > 3) & (t < 4.2)) if dropout else np.ones(len(t), dtype=bool)
    p = Path(path); p.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(p, csi_data=raw[keep], device_ticks_us=(1_000_000 + np.rint(t[keep] * 1e6)).astype(np.uint64),
        raw_stream_sequence=np.arange(1, len(t) + 1, dtype=np.uint64)[keep], num_subcarriers=64,
        requested_pps=100., duration_ms=duration_s * 1000., synthetic=True,
        label=scenario, firmware_version='SYNTHETIC_FIXTURE_NO_DEVICE', device_id=np.uint64(0),
        phy_mode=np.full(keep.sum(), 'ht'), ltf_type=np.full(keep.sum(), 'ht-ltf'), channel_width=np.full(keep.sum(), '20'))


def run_demo(out, config):
    out = Path(out).resolve()
    if out.exists() and any(out.iterdir()):
        raise DataError('Demo output must be empty. Choose a new directory.')
    out.mkdir(parents=True, exist_ok=True)
    records = []
    for s_index, scenario in enumerate(SCENARIOS):
        for run in range(1, 6):
            filename = f'raw/{scenario}-R{run:02d}.npz'
            synthetic_fixture(out / filename, scenario, seed=100 * s_index + run,
                              dropout=(scenario == 'S4' and run == 5))
            records.append({'trial_id': f'SYNTHETIC-{scenario}-R{run:02d}', 'file': filename,
                            'scenario': scenario, 'split': 'development' if run <= 2 else 'validation' if run == 3 else 'test',
                            'room': 'SYNTHETIC_ROOM', 'device': 'NO_PHYSICAL_DEVICE'})
    manifest = out / 'trials.jsonl'
    manifest.write_text('\n'.join(json.dumps(r) for r in records) + '\n', encoding='utf-8')
    model = calibrate_manifest(manifest, config)
    save_json(out / 'model.json', model)
    report = evaluate_manifest(manifest, model, out / 'evaluation')
    (out / 'SYNTHETIC_ONLY.txt').write_text('Generated 6-second fixtures. No measured CSI, hardware test or human detection accuracy.\n', encoding='utf-8')
    return report
