"""Small offline interface. No command opens a network connection."""
import argparse
import json
import sys
from pathlib import Path

from .core import Config, DataError, load_capture, predict, save_json
from .experiments import calibrate_manifest, evaluate_manifest, run_demo, write_predictions


def main(argv=None):
    p = argparse.ArgumentParser(description='WiFiPresence offline prototype. IDLE is not absence.')
    subs = p.add_subparsers(dest='command', required=True)
    for command in ('inspect', 'replay'):
        sub = subs.add_parser(command)
        sub.add_argument('--input', required=True)
        sub.add_argument('--expected-pps', type=float, help='Explicit known rate, never inferred from received packets.')
        if command == 'replay':
            sub.add_argument('--model', required=True)
            sub.add_argument('--out', required=True)
    for command in ('calibrate', 'evaluate'):
        sub = subs.add_parser(command)
        sub.add_argument('--manifest', required=True)
        sub.add_argument('--out', required=True)
        sub.add_argument('--expected-pps', type=float)
        if command == 'evaluate':
            sub.add_argument('--model', required=True)
            sub.add_argument('--split', choices=['validation', 'test'], default='test')
    demo = subs.add_parser('demo', help='Generate clearly marked synthetic fixtures and run the software pipeline.')
    demo.add_argument('--out', required=True)
    args = p.parse_args(argv)
    try:
        if args.command == 'inspect':
            c = load_capture(args.input, args.expected_pps)
            print(json.dumps(c.info, indent=2, ensure_ascii=False, allow_nan=False))
        elif args.command == 'calibrate':
            model = calibrate_manifest(args.manifest, Config(), args.expected_pps)
            save_json(args.out, model)
            print(f'Calibration saved: {args.out}. Status: {model["status"]}')
        elif args.command == 'replay':
            model = json.loads(Path(args.model).read_text(encoding='utf-8'))
            c = load_capture(args.input, args.expected_pps)
            rows = predict(c, model)
            write_predictions(args.out, rows)
            print(f'{len(rows)} windows written to {args.out}; IDLE is not absence.')
        elif args.command == 'evaluate':
            model = json.loads(Path(args.model).read_text(encoding='utf-8'))
            result = evaluate_manifest(args.manifest, model, args.out, args.split, args.expected_pps)
            print(result['status']); print(result['rate_gate']); print(f'Report: {Path(args.out) / "report.html"}')
        else:
            result = run_demo(args.out, Config())
            print(result['status']); print(f'Report: {Path(args.out) / "evaluation" / "report.html"}')
        return 0
    except (DataError, OSError, ValueError, KeyError, TypeError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 2
