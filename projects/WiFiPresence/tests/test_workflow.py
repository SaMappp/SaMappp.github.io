import copy
from contextlib import redirect_stderr, redirect_stdout
import io
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

from wifipresence.core import Config, DataError, extract_windows, fit_model, load_capture, predict, save_json
from wifipresence.cli import main
from wifipresence.experiments import (
    calibrate_manifest, evaluate_manifest, event_latencies, read_manifest, run_demo, synthetic_fixture, write_predictions,
)


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        scratch = (Path.cwd() / '.test-work').resolve()
        scratch.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=scratch)
        self.root = Path(self.temp.name)
        assert self.root.resolve().is_relative_to(scratch)
        self.path = self.root / 'empty.npz'
        synthetic_fixture(self.path, seed=1)
        self.capture = load_capture(self.path)
        self.model = fit_model([self.capture], ['dev-empty'])

    def tearDown(self):
        self.temp.cleanup()

    def mutate(self, name, **changes):
        with np.load(self.path, allow_pickle=False) as z:
            arrays = {k: z[k] for k in z.files}
        for k, v in changes.items():
            if v is None:
                arrays.pop(k, None)
            else:
                arrays[k] = v
        p = self.root / name
        np.savez_compressed(p, **arrays)
        return p

    def test_official_q_i_order_and_magnitude(self):
        raw = np.tile(np.array([3, 4] * 64, dtype=np.int8), (200, 1))
        p = self.root / 'known.npz'
        np.savez_compressed(p, csi_data=raw, device_ticks_us=np.arange(200) * 10000,
                            requested_pps=100, duration_ms=2000, synthetic=True)
        c = load_capture(p)
        np.testing.assert_allclose(c.amplitude, 5)

    def test_missing_time_is_rejected_instead_of_assuming_rate(self):
        with self.assertRaisesRegex(DataError, 'Timing is never invented'):
            load_capture(self.mutate('no-time.npz', device_ticks_us=None))

    def test_reversed_time_is_rejected(self):
        times = np.arange(600) * 10000
        times[50] = times[49]
        with self.assertRaisesRegex(DataError, 'strictly'):
            load_capture(self.mutate('bad-time.npz', device_ticks_us=times))

    def test_partial_phy_is_rejected(self):
        with self.assertRaisesRegex(DataError, 'Partial PHY'):
            load_capture(self.mutate('partial.npz', ltf_type=None))

    def test_zero_measurements_are_not_idle_evidence(self):
        with self.assertRaises(DataError):
            load_capture(self.mutate('zeros.npz', csi_data=np.zeros((600, 128), dtype=np.int8)))

    def test_corrupt_file_has_actionable_error(self):
        p = self.root / 'broken.npz'
        p.write_bytes(b'not a numpy file')
        with self.assertRaises(DataError):
            load_capture(p)

    def test_missing_requested_rate_requires_explicit_rate(self):
        p = self.mutate('no-rate.npz', requested_pps=None)
        with self.assertRaisesRegex(DataError, 'expected-pps'):
            extract_windows(load_capture(p))
        self.assertTrue(extract_windows(load_capture(p, 100)))
        self.assertEqual(load_capture(p, 100).info['packet_rate_source'], 'explicit_expected_pps')

    def test_supplied_rate_cannot_override_stored_metadata(self):
        with self.assertRaisesRegex(DataError, 'conflicts with stored'):
            load_capture(self.path, 50)
        same = load_capture(self.path, 100)
        self.assertEqual(same.expected_pps, 100)
        self.assertEqual(same.info['packet_rate_source'], 'capture_requested_pps')

    def test_model_output_preserves_existing_file(self):
        original = self.path.read_bytes()
        with self.assertRaisesRegex(DataError, 'Output already exists'):
            save_json(self.path, self.model)
        self.assertEqual(self.path.read_bytes(), original)

    def test_prediction_output_preserves_existing_file(self):
        original = self.path.read_bytes()
        with self.assertRaisesRegex(DataError, 'Output already exists'):
            write_predictions(self.path, predict(self.capture, self.model))
        self.assertEqual(self.path.read_bytes(), original)

    def test_cli_rejects_input_as_output_without_modifying_raw_data(self):
        model = self.root / 'model.json'
        save_json(model, self.model)
        original = self.path.read_bytes()
        with redirect_stderr(io.StringIO()) as stderr, redirect_stdout(io.StringIO()):
            code = main(['replay', '--input', str(self.path), '--model', str(model), '--out', str(self.path)])
        self.assertEqual(code, 2)
        self.assertIn('Output already exists', stderr.getvalue())
        self.assertEqual(self.path.read_bytes(), original)

    def test_dropout_is_unknown_for_both_methods(self):
        p = self.root / 'drop.npz'
        synthetic_fixture(p, scenario='S4', seed=5, dropout=True)
        rows = predict(load_capture(p), self.model)
        bad = [r for r in rows if r['quality'] != 'valid']
        self.assertTrue(bad)
        self.assertTrue(all(r['baseline'] == r['candidate'] == 'UNKNOWN' for r in bad))

    def test_burst_packets_do_not_inflate_slot_occupancy(self):
        times = np.concatenate([second + np.arange(100) * .0001 for second in range(6)])
        p = self.mutate('burst.npz', device_ticks_us=np.rint(times * 1e6).astype(np.uint64))
        rows = extract_windows(load_capture(p))
        self.assertTrue(all(r['score'] is None for r in rows))

    def test_replay_is_deterministic(self):
        p = self.root / 'walking.npz'
        synthetic_fixture(p, scenario='S2', seed=7)
        c = load_capture(p)
        self.assertEqual(predict(c, self.model), predict(c, self.model))
        self.assertTrue(any(r['candidate'] == 'MOTION' for r in predict(c, self.model)))

    def test_synthetic_model_cannot_score_real_claim(self):
        p = self.mutate('marked-real.npz', synthetic=False)
        with self.assertRaisesRegex(DataError, 'Synthetic'):
            predict(load_capture(p), self.model)

    def test_rate_change_requires_recalibration(self):
        p = self.mutate('rate50.npz', requested_pps=50)
        with self.assertRaisesRegex(DataError, 'rate profiles differ'):
            predict(load_capture(p), self.model)

    def test_missing_fit_provenance_is_rejected(self):
        model = copy.deepcopy(self.model)
        del model['fit_sha256']
        with self.assertRaises(DataError):
            predict(self.capture, model)

    def manifest(self, records):
        p = self.root / 'trials.jsonl'
        p.write_text('\n'.join(json.dumps(r) for r in records), encoding='utf-8')
        return p

    def record(self, trial_id='one', file='empty.npz', split='development', scenario='S1'):
        return dict(trial_id=trial_id, file=file, scenario=scenario, split=split, room='room', device='device')

    def test_duplicate_data_under_different_id_is_rejected(self):
        p = self.manifest([self.record(), self.record('two', split='test')])
        with self.assertRaisesRegex(DataError, 'Duplicate raw file'):
            read_manifest(p)

    def test_calibration_uses_only_development_empty_room(self):
        p = self.root / 'walking.npz'
        synthetic_fixture(p, 'S2', seed=2)
        manifest = self.manifest([self.record(), self.record('walking', 'walking.npz', 'development', 'S2')])
        model = calibrate_manifest(manifest, Config())
        self.assertEqual(model['fit_trial_ids'], ['one'])
        self.assertEqual(model['fit_sha256'], [self.capture.sha256])

    def test_holdout_content_overlap_is_blocked(self):
        manifest = self.manifest([self.record('new-id', split='test')])
        with self.assertRaisesRegex(DataError, 'overlaps calibration'):
            evaluate_manifest(manifest, self.model, self.root / 'bad-report')

    def test_latency_missing_detection_not_zero(self):
        rows = [{'end_s': .5, 'baseline': 'IDLE'}, {'end_s': 1.5, 'baseline': 'IDLE'}]
        result = event_latencies(rows, [{'start_s': 1., 'end_s': 2.}], 'baseline')[0]
        self.assertEqual(result['status'], 'not_detected')
        self.assertIsNone(result['latency_s'])

    def test_latency_with_real_marker(self):
        rows = [{'end_s': .5, 'baseline': 'IDLE'}, {'end_s': 1.75, 'baseline': 'MOTION'}]
        result = event_latencies(rows, [{'start_s': 1., 'end_s': 2., 'timing_uncertainty_s': .1}], 'baseline')[0]
        self.assertEqual(result['latency_s'], .75)
        self.assertEqual(result['timing_uncertainty_s'], .1)

    def test_motion_at_exact_onset_is_preexisting_not_zero_latency(self):
        rows = [{'end_s': .5, 'baseline': 'IDLE'}, {'end_s': 1., 'baseline': 'MOTION'},
                {'end_s': 1.25, 'baseline': 'MOTION'}]
        result = event_latencies(rows, [{'start_s': 1., 'end_s': 2.}], 'baseline')[0]
        self.assertEqual(result['status'], 'preexisting_motion')
        self.assertIsNone(result['latency_s'])

    def test_unavailable_and_partial_event_input_are_not_clean_misses(self):
        rows = [{'end_s': .5, 'baseline': 'IDLE'}, {'end_s': 1.5, 'baseline': 'UNKNOWN'},
                {'end_s': 2., 'baseline': 'UNKNOWN'}]
        event = [{'start_s': 1., 'end_s': 2.}]
        result = event_latencies(rows, event, 'baseline')[0]
        self.assertEqual(result['status'], 'unavailable')
        self.assertIsNone(result['latency_s'])
        rows[-1]['baseline'] = 'IDLE'
        result = event_latencies(rows, event, 'baseline')[0]
        self.assertEqual(result['status'], 'not_detected_partial_observation')
        self.assertEqual(result['observation_status'], 'partial')

    def test_events_outside_real_capture_interval_are_rejected(self):
        raw = self.root / 'transition.npz'
        synthetic_fixture(raw, 'S2', seed=17)
        record = self.record('transition', raw.name, 'test', 'TRANSITION')
        record['motion_events'] = [{'start_s': 20., 'end_s': 40.}]
        manifest = self.manifest([record])
        with self.assertRaisesRegex(DataError, 'outside the capture interval'):
            evaluate_manifest(manifest, self.model, self.root / 'bad-event-report')

    def test_full_demo_has_no_human_performance_claim(self):
        out = self.root / 'demo'
        report = run_demo(out, Config())
        self.assertTrue(report['synthetic'])
        self.assertEqual(report['trial_count'], 12)
        self.assertIn('NO HUMAN PERFORMANCE CLAIM', report['status'])
        self.assertTrue((out / 'evaluation' / 'report.html').exists())
        self.assertEqual(len(report['trial_metrics']), 24)
        self.assertTrue(any(x['unknown_windows'] for x in report['trial_metrics']))
        with self.assertRaises(DataError):
            run_demo(out, Config())


if __name__ == '__main__':
    unittest.main()
