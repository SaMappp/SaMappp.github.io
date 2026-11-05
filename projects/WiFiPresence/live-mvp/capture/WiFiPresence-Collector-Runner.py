"""Run the pinned official collector with a balanced Windows timer request."""
from contextlib import contextmanager
from pathlib import Path
import runpy
import signal
import sys


@contextmanager
def collection_timer():
    if sys.platform != 'win32':
        yield
        return
    import ctypes
    timer = ctypes.WinDLL('winmm')
    timer.timeBeginPeriod.argtypes = [ctypes.c_uint]
    timer.timeBeginPeriod.restype = ctypes.c_uint
    timer.timeEndPeriod.argtypes = [ctypes.c_uint]
    timer.timeEndPeriod.restype = ctypes.c_uint
    if timer.timeBeginPeriod(1) != 0:
        raise RuntimeError('Cannot enable the Windows 1 ms timer; collection was not started.')
    try:
        yield
    finally:
        timer.timeEndPeriod(1)


def handle_break(signum, frame):
    handler = signal.getsignal(signal.SIGINT)
    if callable(handler):
        handler(signal.SIGINT, frame)


def main():
    repo = Path(__file__).resolve().parent / 'WiFiPresence-Capture'
    sys.path.insert(0, str(repo))
    sys.argv = [str(repo / 'espectre'), *sys.argv[1:]]
    if sys.platform == 'win32':
        signal.signal(signal.SIGBREAK, handle_break)
    with collection_timer():
        print('[Windows timer] 1 ms timing enabled for this collector process; released on exit.', flush=True)
        runpy.run_path(str(repo / 'espectre'), run_name='__main__')


if __name__ == '__main__':
    main()
