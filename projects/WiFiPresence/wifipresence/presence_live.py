"""Explicit, bounded live raw-CSI adapter; optional upstream dependency only."""
from __future__ import annotations

from collections import deque
from contextlib import nullcontext
import importlib.util
import ipaddress
from pathlib import Path
import subprocess
import sys
import threading
import time

import numpy as np

from .core import Capture, DataError
from .presence_model import infer

PINNED_COMMIT = '12fce9354d3506290e70a853a4f22866f0e987ef'


def load_upstream(repo):
    repo = Path(repo).resolve()
    revision = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True, timeout=5).strip()
    if revision != PINNED_COMMIT:
        raise DataError('Live adapter requires the pinned ESPectre 3.0.0 source checkout.')
    if str(repo) not in sys.path: sys.path.insert(0, str(repo))
    from tools.lib.csi_io import DirectRawCSIReceiver
    from src.python.espectre_cli.device_transport import DirectClient
    from tools.ha_traffic_generator_addon.espectre_traffic_generator import ExternalTrafficGenerator
    return DirectClient, DirectRawCSIReceiver, ExternalTrafficGenerator


class LiveSession:
    def __init__(self, *, model=None, room='418', clock=time.monotonic):
        self.model, self.room, self.clock = model, room, clock
        self.lock = threading.RLock()
        self.buffer = deque(maxlen=1000)
        self.thread = None
        self.receiver = None
        self.stop_event = threading.Event()
        self.reset()

    def reset(self):
        with self.lock:
            self.buffer.clear()
            self.status = 'STOPPED'
            self.error = None
            self.total = 0
            self.invalid_packets = 0
            self.last_arrival = None
            self.metadata = {}
            self.restored = None
            self.session_closed = None
            self.original_mode = None
            self.transport_problem = False

    def accept_packet(self, packet):
        raw = np.asarray(packet.iq_raw).reshape(-1)
        if (raw.dtype != np.int8 or raw.shape != (128,) or packet.device_ticks_us is None
                or (packet.phy_mode, packet.ltf_type, str(packet.channel_width)) != ('ht', 'ht-ltf', '20')):
            with self.lock: self.invalid_packets += 1
            return
        amplitude = np.hypot(raw[0::2].astype(float), raw[1::2].astype(float))
        if not np.any(raw):
            with self.lock: self.invalid_packets += 1
            return
        tick = int(packet.device_ticks_us)
        with self.lock:
            if self.buffer and tick <= self.buffer[-1][0]: self.buffer.clear()
            self.buffer.append((tick, amplitude))
            while self.buffer and tick - self.buffer[0][0] > 2_200_000: self.buffer.popleft()
            self.total += 1
            self.last_arrival = self.clock()
            self.metadata = {'device_id': str(packet.device_id), 'firmware_version': str(packet.firmware_version),
                             'requested_pps': 100.0}
            self.transport_problem |= bool(getattr(packet, 'raw_drop_total', 0) or getattr(packet, 'raw_send_backpressure_total', 0))

    def start(self, target, repo, duration=60, factories=None):
        address = ipaddress.ip_address(target)
        if address.version != 4 or not address.is_private or address.is_loopback or address.is_unspecified or address.is_multicast or str(address).endswith('.255'):
            raise DataError('Enter the single ESP32 private-LAN IPv4 address, not a broadcast or URL.')
        if not 3 <= duration <= 600: raise DataError('Live session duration must be 3-600 seconds.')
        if self.thread and self.thread.is_alive(): raise DataError('A live session is already active.')
        self.reset(); self.stop_event.clear()
        self.status = 'CONNECTING'
        self.thread = threading.Thread(target=self._run, args=(str(address), repo, duration, factories), daemon=True)
        self.thread.start()

    def _run(self, target, repo, duration, factories):
        control, receiver, generator, timer = None, None, None, nullcontext()
        try:
            client_cls, receiver_cls, generator_cls = factories or load_upstream(repo)
            timer_path = Path(__file__).resolve().parents[1] / 'capture' / 'WiFiPresence-Collector-Runner.py'
            spec = importlib.util.spec_from_file_location('presence_timer_runner', timer_path)
            module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
            timer = module.collection_timer()
            control = client_cls(f'http://{target}:62587/espectre/v1', timeout=3.0)
            device = control.request('get', 'device')
            if device.get('chip') != 'esp32c6' or device.get('firmware') != '3.0.0':
                raise DataError('Device/profile is not the tested C6 Native 3.0.0 target.')
            sensing = control.request('get', 'sensing')
            original = sensing.get('traffic_generator_mode')
            if not isinstance(original, str) or not original: raise DataError('Cannot preserve original traffic mode.')
            self.original_mode = original
            caps = control.request('get', 'capabilities').get('csi', {})
            if caps.get('protocol_version') != 1 or caps.get('marker') != generator_cls.TRAFFIC_MARKER:
                raise DataError('Raw capability/traffic marker mismatch.')
            if self.stop_event.is_set(): return
            control.request('patch', 'sensing', {'traffic_generator_mode': 'external'})
            receiver = receiver_cls(f'http://{target}:62587', buffer_size=500, derive_complex=False, timeout=3.0)
            self.receiver = receiver
            receiver.requested_pps = 100.0
            receiver.add_callback(self.accept_packet)
            generator = generator_cls([target], port=int(caps.get('traffic_udp_port', 5555)), rate_pps=100)
            with timer:
                receiver.start_session(); generator.start(); receiver.bind_stream()
                if self.stop_event.is_set(): return
                self.status = 'STREAMING'
                receiver.run(timeout=duration, quiet=True)
        except Exception as exc:
            self.error = f'{type(exc).__name__}: {exc}'
        finally:
            for resource in (generator, receiver):
                if resource:
                    try: resource.stop()
                    except Exception as exc: self.error = self.error or str(exc)
            if control:
                try:
                    if self.original_mode is not None:
                        # Closing TCP and firmware releasing CSI are asynchronous.
                        deadline = time.monotonic() + 3.0
                        self.session_closed = False
                        while time.monotonic() < deadline:
                            raw = control.request('get', 'diagnostics', {'fields': ['raw_csi']}).get('raw_csi', {})
                            if raw.get('active') is False:
                                self.session_closed = True
                                break
                            time.sleep(.1)
                        current = control.request('get', 'sensing').get('traffic_generator_mode')
                        if current != self.original_mode:
                            if not self.session_closed:
                                raise RuntimeError('Raw session did not close; original traffic source restoration deferred.')
                            control.request('patch', 'sensing', {'traffic_generator_mode': self.original_mode})
                        restored = control.request('get', 'sensing').get('traffic_generator_mode')
                        self.restored = restored == self.original_mode
                        if not self.restored: self.error = self.error or 'Original traffic mode was not restored.'
                        if not self.session_closed: self.error = self.error or 'Raw session closure not confirmed.'
                except Exception as exc:
                    self.restored = False; self.error = self.error or str(exc)
                finally: control.close()
            self.status = 'ERROR' if self.error else 'STOPPED'

    def stop(self):
        self.stop_event.set()
        if self.receiver is not None: self.receiver.running = False
        if self.thread and self.thread is not threading.current_thread(): self.thread.join(timeout=8)
        if self.thread and self.thread.is_alive():
            self.error = 'Live worker has not stopped; data output is UNKNOWN.'
            self.status = 'ERROR'

    def snapshot(self):
        with self.lock:
            samples = list(self.buffer)
            result = {'source': 'LIVE', 'status': self.status, 'presence': 'UNKNOWN', 'reason': 'live_not_streaming',
                      'packets': self.total, 'invalid_packets': self.invalid_packets, 'error': self.error,
                      'original_mode': self.original_mode, 'restored': self.restored,
                      'session_closed': self.session_closed, 'windows': []}
            if self.status != 'STREAMING': return result
            if self.last_arrival is None or self.clock() - self.last_arrival > 3:
                result['reason'] = 'waiting_for_packets' if self.last_arrival is None else 'stale_stream'
                return result
            if self.transport_problem:
                result['reason'] = 'raw_transport_drops_or_backpressure'; return result
            meta = dict(self.metadata)
        if len(samples) < 2 or samples[-1][0] - samples[0][0] < 1_000_000:
            result['reason'] = 'window_warmup'; return result
        ticks = np.array([v[0] for v in samples], float)
        times = (ticks - ticks[0]) / 1e6
        c = Capture(Path('LIVE'), times, np.array([v[1] for v in samples]), 100.0,
                    float(times[-1] + .01), False, '', meta)
        rows = infer(c, self.model, admitted=True, room=self.room)
        result.update({'presence': rows[-1]['presence'], 'reason': rows[-1]['reason'], 'windows': rows,
                       'quality_scope': 'online project window checks; not official whole-file admission',
                       'model_loaded': self.model is not None})
        return result
