"""Local operator launcher for the unmodified ESPectre 3.0.0 collector."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import queue
import re
import signal
import subprocess
import sys
import threading
import time
import uuid

BASE = Path(__file__).resolve().parent
REPO = BASE / 'WiFiPresence-Capture'
PYTHON = REPO / '.venv' / 'Scripts' / 'python.exe'
RUNNER = BASE / 'WiFiPresence-Collector-Runner.py'
SCENARIOS = {
    'S1': ('empty', 'empty', 'off', '空房，风扇关闭'),
    'S2': ('motion', 'walking', 'off', '一人走动，风扇关闭'),
    'S3': ('static_presence', 'stationary', 'off', '一人静坐，风扇关闭'),
    'S4': ('empty', 'empty', 'on', '空房，风扇开启'),
    'S5': ('motion', 'walking', 'on', '一人走动，风扇开启'),
    'S6': ('static_presence', 'stationary', 'on', '一人静坐，风扇开启'),
}


def validate_target(value):
    value = value.strip()
    address = ipaddress.ip_address(value)
    if address.version != 4 or address.is_unspecified or address.is_loopback or address.is_multicast or str(address) == '255.255.255.255':
        raise ValueError('请输入 ESP32 的实际 IPv4 地址，例如 192.168.1.50。')
    return str(address)


def build_command(target, scenario, duration, room, trial_id):
    if scenario not in SCENARIOS or not 5 <= duration <= 600:
        raise ValueError('场景须为 S1–S6；每次时长须为 5–600 秒。')
    label, activity, fan, _ = SCENARIOS[scenario]
    return [str(PYTHON), str(RUNNER), 'collect', '--target', validate_target(target),
            '--label', label, '--duration', str(duration), '--pps', '100', '--start-delay', '15',
            '--description', f'WiFiPresence; trial={trial_id}; scenario={scenario}; room={room}; fan={fan}; activity={activity}']


def stop_collector(process):
    """Ask only this collector group to stop, allowing official cleanup first."""
    if process.poll() is not None:
        return
    try:
        process.send_signal(signal.CTRL_BREAK_EVENT if sys.platform == 'win32' else signal.SIGINT)
        process.wait(timeout=10)
    except (OSError, subprocess.TimeoutExpired):
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)


def run_supervised_capture(command, console_path, *, duration, startup_timeout=90, start_delay=15,
                           grace_seconds=30, show_output=True):
    """Bound preparation and recording, retaining the full official console log.

    The pinned CLI progress labels drive the preparation watchdog only. The
    official exit status and quality checks remain authoritative for success.
    """
    env = dict(os.environ, PYTHONUTF8='1', PYTHONUNBUFFERED='1', PYTHONIOENCODING='utf-8')
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == 'win32' else 0
    output = queue.Queue()
    process = subprocess.Popen(command, cwd=REPO, env=env, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, text=True, encoding='utf-8',
                               errors='replace', bufsize=1, creationflags=flags)
    started = time.monotonic()
    recording_at = None
    reason = None
    last_summary = last_detail = -float('inf')
    last_phase = None

    def read_output():
        try:
            for line in process.stdout:
                output.put(line)
        finally:
            output.put(None)

    reader = threading.Thread(target=read_output, daemon=True)
    reader.start()
    done = False
    console_path = Path(console_path)
    console_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with console_path.open('x', encoding='utf-8') as console:
            while not (done and process.poll() is not None):
                try:
                    line = output.get(timeout=.1)
                except queue.Empty:
                    line = ''
                now = time.monotonic()
                if line is None:
                    done = True
                elif line:
                    console.write(line)
                    console.flush()
                    clean = re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', line).rstrip()
                    match = re.match(r'\s*STATUS:\s+(\w+)', clean)
                    if match:
                        phase = match[1]
                        if phase == 'RECORDING' and recording_at is None:
                            recording_at = now
                        if show_output and (phase != last_phase or now - last_summary >= 2):
                            prefix = f'[准备 {now-started:.0f}s] ' if recording_at is None else ''
                            print(prefix + clean.strip(), flush=True)
                            last_summary = now
                        last_phase = phase
                    elif clean.lstrip().startswith('ip='):
                        if show_output and now - last_detail >= 3:
                            print(clean, flush=True)
                            last_detail = now
                    elif show_output:
                        print(clean, flush=True)
                if process.poll() is not None or reason is not None:
                    continue
                if recording_at is None and now - started > start_delay + startup_timeout:
                    reason = 'preparation_timeout'
                elif recording_at is not None and now - recording_at > duration + grace_seconds:
                    reason = 'recording_or_save_timeout'
                elif now - started > start_delay + startup_timeout + duration + grace_seconds:
                    reason = 'session_timeout'
                if reason is not None:
                    message = f'WATCHDOG: {reason}; stopping collector without accepting a partial trial.\n'
                    console.write(message)
                    console.flush()
                    if show_output:
                        print('\n等待超时，正在停止；本次不会登记为成功。详见完整终端日志。', flush=True)
                    stop_collector(process)
    except KeyboardInterrupt:
        reason = 'operator_interrupted'
        stop_collector(process)
        if show_output:
            print('\n采集被中断，未完成试次不能登记为成功。', flush=True)
    finally:
        if process.poll() is None:
            stop_collector(process)
        reader.join(timeout=2)
        process.stdout.close()
    return {'exit_code': process.returncode, 'watchdog_reason': reason,
            'recording_observed': recording_at is not None,
            'recording_seen_after_s': round(recording_at - started, 3) if recording_at is not None else None,
            'elapsed_wall_s': round(time.monotonic() - started, 3), 'console_log': str(console_path)}


def inspect_saved_file(path):
    import numpy as np
    with np.load(path, allow_pickle=False) as data:
        raw = data['csi_data']
        ticks = data['device_ticks_us']
        if raw.ndim != 2 or len(raw) < 2 or raw.shape[1] != 128 or raw.dtype != np.int8:
            raise ValueError('文件不是预期的 HT20 int8[N,128] CSI 数组。请保留原文件排查。')
        if ticks.ndim != 1 or len(ticks) != len(raw) or not np.isfinite(ticks).all() or not np.all(np.diff(ticks.astype(float)) > 0):
            raise ValueError('CSI 与时间戳数量不一致，或时间戳不严格递增。')
        summary = {'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                   'shape': list(raw.shape), 'dtype': str(raw.dtype), 'timestamp_count': len(ticks),
                   'elapsed_device_seconds': float((float(ticks[-1]) - float(ticks[0])) / 1e6),
                   'synthetic': bool(data['synthetic'].item()) if 'synthetic' in data else False}
    if summary['synthetic']:
        raise ValueError('文件标为合成数据，不能当成真实采集结果。')
    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description='Use the official ESPectre 3.0.0 collector with operator trial labels.')
    parser.add_argument('--check', action='store_true', help='Check the local launcher only; no device access.')
    parser.add_argument('--dry-run', action='store_true', help='Print a command without connecting or collecting.')
    parser.add_argument('--target')
    parser.add_argument('--scenario', choices=list(SCENARIOS))
    parser.add_argument('--duration', type=int)
    parser.add_argument('--room')
    parser.add_argument('--startup-timeout', type=int, default=90,
                        help='Maximum preparation seconds after the initial delay (default: 90).')
    args = parser.parse_args(argv)
    if not PYTHON.is_file() or not (REPO / 'espectre').is_file() or not RUNNER.is_file():
        raise ValueError(f'采集环境不完整：{REPO}')
    if not 10 <= args.startup_timeout <= 300:
        raise ValueError('准备超时须为 10–300 秒。')
    if args.check:
        import numpy as np
        print(json.dumps({'launcher': 'ready', 'python': sys.version.split()[0], 'numpy': np.__version__,
                          'repo': str(REPO), 'data': str(REPO / 'data'),
                          'windows_high_resolution_timer': True, 'bounded_preparation': True,
                          'device_contacted_by_this_check': False}, indent=2))
        return 0

    print('WiFiPresence 原始 CSI 采集（官方 ESPectre 3.0.0）')
    print('请先连接教室路由器；停止网页 CSI 流，并记下原来的 Wi-Fi traffic source。')
    print('场景由你独立确认；程序不会自动判断房间实际有没有人或风扇是否开启。')
    target = args.target
    while target is None:
        try:
            target = validate_target(input('ESP32 实际 IP：'))
        except ValueError as error:
            print(error)
    target = validate_target(target)
    scenario = args.scenario
    if scenario is None:
        for key, values in SCENARIOS.items():
            print(f'  {key[1:]} / {key}: {values[3]}')
        while scenario is None:
            value = input('选择实际场景 [默认 1 / S1]：').strip().upper() or 'S1'
            value = 'S' + value if value.isdigit() else value
            if value in SCENARIOS:
                scenario = value
            else:
                print('请选择 1–6。')
    duration = args.duration
    while duration is None:
        try:
            duration = int(input('录制秒数 [默认 60；5–600]：').strip() or '60')
            if not 5 <= duration <= 600:
                raise ValueError()
        except ValueError:
            duration = None
            print('请输入 5–600 的整数。')
    room = args.room if args.room is not None else input('教室名称 [留空记为未记录]：').strip()
    room = room.strip() or 'UNRECORDED'
    trial_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
    command = build_command(target, scenario, duration, room, trial_id)
    if args.dry_run:
        print(json.dumps({'dry_run': True, 'command': command, 'device_contacted': False}, ensure_ascii=False, indent=2))
        return 0

    before = set((REPO / 'data').rglob('*.npz'))
    logs = BASE / 'WiFiPresence-Capture-Logs'
    logs.mkdir(exist_ok=True)
    log = logs / (trial_id + '.json')
    label, activity, fan, _ = SCENARIOS[scenario]
    record = {'trial_id': trial_id, 'start_utc': datetime.now(timezone.utc).isoformat(), 'target': target,
              'scenario': scenario, 'label': label, 'activity': activity, 'fan': fan, 'room': room,
              'truth_source': 'operator-selected scenario; not independently verified by software',
              'duration_requested_s': duration, 'pps_requested': 100, 'command': command,
              'startup_timeout_s': args.startup_timeout, 'initial_delay_s': 15,
              'windows_high_resolution_timer': True,
              'status': 'started_not_yet_verified', 'restoration_checked': False, 'files': []}
    log.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('\n先保持安静等待校准；以官方终端的录制开始提示为准，再执行所选场景。')
    print(f'先延迟 15 秒，随后准备最多 {args.startup_timeout} 秒；{duration} 秒仅从 RECORDING 开始计算。')
    print('空房采集请离开目标房间。固定时长录制请等待自动结束；Ctrl+C 会丢弃未完成录制。\n', flush=True)
    supervision = run_supervised_capture(command, logs / (trial_id + '.console.log'), duration=duration,
                                         startup_timeout=args.startup_timeout)
    code = supervision['exit_code']
    new_files = sorted(set((REPO / 'data').rglob('*.npz')) - before)
    errors = []
    for path in new_files:
        try:
            record['files'].append(inspect_saved_file(path))
        except (OSError, ValueError, KeyError) as error:
            errors.append({'path': str(path), 'error': str(error)})
    passed = code == 0 and supervision['watchdog_reason'] is None and bool(record['files']) and not errors
    record.update({'exit_code': code, 'end_utc': datetime.now(timezone.utc).isoformat(), 'file_errors': errors,
                   'supervision': supervision,
                   'status': 'saved_and_reopened_review_upstream_quality' if passed else 'failed_or_needs_review'})
    log.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'\n本次记录：{log}')
    if passed:
        for item in record['files']:
            print(f"已保存并重新读取：{item['path']}  {item['shape']} {item['dtype']}")
        print('请同时检查上方官方采集质量结果；文件可读取不等于检测准确或抗干扰有效。')
    else:
        print('本次未确认成功。保留终端错误、文件与记录；不要将其登记为合格试次。')
    print('最后回 Monitor → Advanced sensing settings，恢复采集前的 traffic source 并检查普通运动检测。')
    return 0 if passed else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, OSError, EOFError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        raise SystemExit(2)
