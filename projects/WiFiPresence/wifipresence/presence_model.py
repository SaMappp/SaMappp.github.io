"""Small supervised presence research model, with explicit data and domain gates."""
from __future__ import annotations

import hashlib
import json
from collections import Counter, defaultdict
from dataclasses import asdict
from pathlib import Path

import numpy as np

from .core import Capture, Config, DataError, extract_windows, load_capture
from .experiments import read_manifest

SCENES = ('S1', 'S2', 'S3', 'S4', 'S5', 'S6')
SPLITS = ('development', 'validation', 'test')
FEATURE_VERSION = 'amplitude-bands-logreg-v1'
FEATURE_NAMES = ([f'log_mean_band_{i}' for i in range(8)]
                 + [f'log_std_band_{i}' for i in range(8)]
                 + ['log_median_std', 'log_mean_difference', 'median_cv', 'spatial_cv'])


def target_for(scene):
    if scene not in SCENES:
        raise DataError('Presence training supports S1-S6 only.')
    return 0 if scene in ('S1', 'S4') else 1


def file_digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_inventory(path):
    obj = json.loads(Path(path).read_text(encoding='utf-8-sig'))
    records = obj.get('files')
    if not isinstance(records, list):
        raise DataError('Inventory needs a files list with canonical quality receipts.')
    result = {}
    for record in records:
        digest = record.get('sha256')
        if not isinstance(digest, str) or len(digest) != 64 or digest in result:
            raise DataError('Missing or duplicate inventory hash.')
        result[digest] = record
    return result


def admission(record):
    checks = record.get('quality_checks', []) if record else []
    return (record is not None and record.get('official_admission_passed') is True
            and not record.get('official_failures') and bool(checks)
            and not any(c.get('status') == 'FAIL' for c in checks)
            and {'file_load', 'temporal_occupancy'}.issubset({c.get('name') for c in checks}))


def readiness(manifest, inventory):
    records = read_manifest(manifest)
    receipts = load_inventory(inventory)
    counts = {s: {c: 0 for c in SCENES} for s in SPLITS}
    qualified = Counter()
    rows, reasons, batch_splits, origin_splits, devices, domains = [], [], defaultdict(set), defaultdict(set), set(), set()
    for r in records:
        receipt = receipts.get(r['_sha256'])
        passed = admission(receipt)
        if passed and receipt.get('synthetic_fixture_only') and not load_capture(r['_path']).synthetic:
            passed = False
        if r['scenario'] in SCENES and passed:
            qualified['empty' if target_for(r['scenario']) == 0 else 'present'] += 1
        eligible = passed and r['split'] in SPLITS and r.get('analysis_role') != 'pilot_only'
        issues = []
        if not passed:
            issues.append('official_admission_failed_or_unverified')
        if r['split'] == 'exclude' or r.get('analysis_role') == 'pilot_only':
            issues.append('pilot_or_excluded')
        if eligible:
            if r['scenario'] not in SCENES:
                issues.append('unsupported_scene')
            elif r.get('truth_confirmed') is not True:
                issues.append('independent_truth_not_confirmed')
            if not r.get('collection_batch') or not r.get('origin_id'):
                issues.append('collection_batch_and_original_recording_id_required')
            if not issues:
                counts[r['split']][r['scenario']] += 1
                batch_splits[r['collection_batch']].add(r['split'])
                origin_splits[r['origin_id']].add(r['split'])
                c = load_capture(r['_path'])
                devices.add((r['room'], c.info['device_id'], c.expected_pps, c.info['firmware_version']))
                domains.add(c.synthetic)
        rows.append({'trial_id': r['trial_id'], 'scenario': r['scenario'], 'split': r['split'],
                     'official_admitted': passed, 'eligible': eligible and not issues, 'issues': issues})
    for split in SPLITS:
        missing = [s for s, n in counts[split].items() if n < 1]
        if missing:
            reasons.append({'code': 'missing_independent_trials', 'split': split, 'scenarios': missing})
    if any(len(v) > 1 for v in batch_splits.values()):
        reasons.append({'code': 'collection_batch_leaks_across_splits'})
    if any(len(v) > 1 for v in origin_splits.values()):
        reasons.append({'code': 'original_recording_leaks_across_splits'})
    if len(devices) > 1:
        reasons.append({'code': 'mixed_room_device_rate_or_firmware_not_supported'})
    if len(domains) > 1:
        reasons.append({'code': 'synthetic_real_mixing'})
    bad_selected = [r['trial_id'] for r in rows if r['split'] in SPLITS and not r['eligible']]
    if bad_selected:
        reasons.append({'code': 'ineligible_selected_trials', 'trial_ids': bad_selected})
    return {'ready': not reasons, 'status': 'READY_FOR_EXPERIMENTAL_TRAINING' if not reasons else 'NOT_READY',
            'qualified_observed_files': {'empty': qualified['empty'], 'present': qualified['present']},
            'counts': counts, 'reasons': reasons, 'trials': rows,
            'minimum_rule': 'One independent admitted trial per S1-S6 per split; not a course mandate or proof of statistical adequacy. Original five-per-scene design remains recommended.'}


def feature_windows(capture, config=Config()):
    rows = extract_windows(capture, config)
    for row in rows:
        row['features'] = None
        lo, hi = np.searchsorted(capture.times, [row['start_s'], row['end_s']], side='left')
        samples = capture.amplitude[lo:hi]
        row['amplitude'] = float(np.median(samples)) if len(samples) else None
        if row['score'] is None:
            continue
        times = capture.times[lo:hi]
        slots = np.floor((times - row['start_s']) * capture.expected_pps + 1e-7).astype(np.int64)
        _, first = np.unique(slots, return_index=True)
        a = samples[first]
        mean, std = a.mean(axis=0), a.std(axis=0)
        features = np.concatenate((np.log1p(mean.reshape(8, 8).mean(axis=1)),
                                   np.log1p(std.reshape(8, 8).mean(axis=1)),
                                   [np.log1p(np.median(std)), np.log1p(np.abs(np.diff(a, axis=0)).mean()),
                                    np.median(std / np.maximum(mean, 1.0)), float(mean.std() / max(mean.mean(), 1.0))]))
        if np.isfinite(features).all():
            row['features'] = features.tolist()
    return rows


def fit_logistic(x, y, weights, *, iterations=900):
    """Deterministic weighted L2 logistic fit; scaler is learned on development only."""
    x, y, weights = np.asarray(x, float), np.asarray(y, float), np.asarray(weights, float)
    if x.ndim != 2 or x.shape[1] != len(FEATURE_NAMES) or len(x) != len(y) or set(y) != {0.0, 1.0}:
        raise DataError('Need finite features and both EMPTY/PRESENT classes.')
    if len(weights) != len(y) or not np.isfinite(x).all() or not np.isfinite(weights).all() or np.any(weights <= 0):
        raise DataError('Invalid feature matrix or weights.')
    center = np.median(x, axis=0)
    scale = np.maximum(np.quantile(x, .75, axis=0) - np.quantile(x, .25, axis=0), .05)
    z = np.clip((x - center) / scale, -10, 10)
    for label in (0, 1):
        weights[y == label] *= .5 / weights[y == label].sum()
    w, bias = np.zeros(x.shape[1]), 0.0
    for _ in range(iterations):
        probability = 1 / (1 + np.exp(-np.clip(z @ w + bias, -35, 35)))
        error = (probability - y) * weights
        w -= .15 * (z.T @ error + .01 * w)
        bias -= .15 * error.sum()
    return {'center': center.tolist(), 'scale': scale.tolist(), 'weights': w.tolist(), 'bias': float(bias)}


def train(manifest, inventory):
    report = readiness(manifest, inventory)
    if not report['ready']:
        raise DataError('NOT_READY: no model created. See readiness report; admitted EMPTY files=' + str(report['qualified_observed_files']['empty']))
    records = [r for r in read_manifest(manifest) if r['split'] == 'development']
    x, y, weights, captures = [], [], [], []
    for r in records:
        c = load_capture(r['_path'])
        captures.append(c)
        valid = [v['features'] for v in feature_windows(c) if v['features'] is not None]
        if len(valid) < 4:
            raise DataError('Fewer than four valid development windows: ' + r['trial_id'])
        x.extend(valid); y.extend([target_for(r['scenario'])] * len(valid)); weights.extend([1 / len(valid)] * len(valid))
    c = captures[0]
    model = {'schema_version': 1, 'kind': 'experimental_presence_logistic', 'feature_version': FEATURE_VERSION,
             'feature_names': FEATURE_NAMES, 'synthetic': c.synthetic, 'confidence': .8,
             'status': 'SYNTHETIC_SOFTWARE_MODEL' if c.synthetic else 'EXPERIMENTAL_REAL_MODEL_NOT_DEPLOYMENT_VALIDATED',
             'profile': {'device_id': c.info['device_id'], 'firmware_version': c.info['firmware_version'],
                         'requested_pps': c.expected_pps, 'room': records[0]['room']},
             'config': asdict(Config()), 'fit_sha256': [v.sha256 for v in captures],
             'fit_trial_ids': [r['trial_id'] for r in records], 'fit_batches': sorted({r['collection_batch'] for r in records}),
             'fit_origin_ids': sorted({r['origin_id'] for r in records}),
             'score_warning': 'Model score is not calibrated probability, accuracy, or proof of stationary presence.'}
    model.update(fit_logistic(x, y, weights))
    return model


def validate_model(model):
    if model.get('kind') != 'experimental_presence_logistic' or model.get('feature_version') != FEATURE_VERSION:
        raise DataError('Unsupported presence model.')
    if model.get('feature_names') != FEATURE_NAMES or type(model.get('synthetic')) is not bool:
        raise DataError('Wrong feature order/domain.')
    for key in ('center', 'scale', 'weights'):
        a = np.asarray(model.get(key), float)
        if a.shape != (len(FEATURE_NAMES),) or not np.isfinite(a).all():
            raise DataError('Invalid model parameters: ' + key)
    if min(model['scale']) <= 0 or not np.isfinite(model.get('bias', float('nan'))) or not .5 < model.get('confidence', 0) < 1:
        raise DataError('Invalid scaling/bias/confidence.')
    if not model.get('fit_sha256') or not model.get('fit_trial_ids') or not isinstance(model.get('profile'), dict):
        raise DataError('Missing training provenance/profile.')
    Config(**model['config']).validate()


def classify_features(features, model):
    z = np.clip((np.asarray(features) - np.asarray(model['center'])) / np.asarray(model['scale']), -10, 10)
    p = float(1 / (1 + np.exp(-np.clip(z @ np.asarray(model['weights']) + model['bias'], -35, 35))))
    label = 'PRESENT' if p >= model['confidence'] else 'EMPTY' if p <= 1 - model['confidence'] else 'UNKNOWN'
    return label, p


def infer(capture, model=None, *, admitted=False, room=None):
    if model:
        validate_model(model)
    config = Config(**model['config']) if model else Config()
    reason = None
    if not model:
        reason = 'model_not_ready'
    elif model['synthetic'] != capture.synthetic:
        reason = 'synthetic_real_domain_mismatch'
    elif not admitted:
        reason = 'official_file_admission_failed_or_unverified'
    elif room != model['profile'].get('room'):
        reason = 'room_scope_not_confirmed'
    elif any(str(model['profile'].get(k)) != str(capture.info.get(k)) for k in ('device_id', 'firmware_version', 'requested_pps')):
        reason = 'device_firmware_or_rate_mismatch'
    rows = feature_windows(capture, config)
    for row in rows:
        row['presence'], row['model_score'] = 'UNKNOWN', None
        row['reason'] = reason or ('insufficient_window_quality' if row['features'] is None else 'experimental_model_output')
        if reason is None and row['features'] is not None:
            row['presence'], row['model_score'] = classify_features(row['features'], model)
            if row['presence'] == 'UNKNOWN': row['reason'] = 'model_score_uncertain'
        del row['features']
    return rows


def predict_file(path, inventory, model=None, room=None):
    c = load_capture(path)
    receipt = load_inventory(inventory).get(c.sha256)
    rows = infer(c, model, admitted=admission(receipt), room=room)
    return {'source': 'SYNTHETIC' if c.synthetic else 'REAL_FILE', 'sha256': c.sha256,
            'official_admitted': admission(receipt), 'presence': rows[-1]['presence'],
            'reason': rows[-1]['reason'], 'model_loaded': model is not None,
            'experimental': True, 'windows': rows, 'note': 'UNKNOWN is not EMPTY; IDLE is not absence.'}


def evaluate(manifest, inventory, model, split='test'):
    validate_model(model)
    state = readiness(manifest, inventory)
    if not state['ready']:
        raise DataError('Dataset is not ready for independent evaluation.')
    receipts = load_inventory(inventory)
    summaries = []
    for r in read_manifest(manifest):
        if r['split'] != split: continue
        if (r['_sha256'] in model['fit_sha256'] or r['trial_id'] in model['fit_trial_ids']
                or r['collection_batch'] in model['fit_batches'] or r['origin_id'] in model['fit_origin_ids']):
            raise DataError('Evaluation overlaps training recording/batch.')
        c = load_capture(r['_path'])
        if c.synthetic != model['synthetic']: raise DataError('Mixed synthetic/real evaluation.')
        rows = infer(c, model, admitted=admission(receipts.get(c.sha256)), room=r['room'])
        n = len(rows); valid = [v for v in rows if v['presence'] != 'UNKNOWN']
        correct = sum((v['presence'] == 'PRESENT') == bool(target_for(r['scenario'])) for v in valid)
        summaries.append({'trial_id': r['trial_id'], 'scenario': r['scenario'], 'windows': n,
                          'valid_windows': len(valid), 'unknown_fraction': 1 - len(valid) / n,
                          'correct_fraction_of_valid': correct / len(valid) if valid else None,
                          'independent_unit': 'whole original trial; windows are correlated'})
    if not summaries: raise DataError('No selected independent trials.')
    return {'status': 'SYNTHETIC_SOFTWARE_CHECK' if model['synthetic'] else 'EXPERIMENTAL_HELD_OUT_RESULTS',
            'split': split, 'trials': summaries, 'latency': 'N/A without actual onset markers',
            'warning': 'Report per-scene trial outcomes and UNKNOWN; no deployment guarantee or pooled window independence.'}
