from contextlib import redirect_stdout
import importlib.util
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

BASE=Path(__file__).resolve().parents[1]/'capture'
WORK=Path(__file__).resolve().parent

def load(name,filename):
    spec=importlib.util.spec_from_file_location(name,BASE/filename)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

launcher=load('launcher_fix','WiFiPresence-Capture-Start.py')
runner=load('collector_runner','WiFiPresence-Collector-Runner.py')

class LauncherFixTests(unittest.TestCase):
    def setUp(self):
        runtime = patch.object(launcher, 'PYTHON', Path(sys.executable))
        runtime.start()
        self.addCleanup(runtime.stop)
        self.temp=tempfile.TemporaryDirectory(dir=WORK)
        self.root=Path(self.temp.name)
        working_directory = patch.object(launcher, 'REPO', self.root)
        working_directory.start()
        self.addCleanup(working_directory.stop)

    def tearDown(self):
        self.temp.cleanup()

    def run_child(self,body,**options):
        child=self.root/'fake_collector.py'
        child.write_text('import sys,time,signal\n'
                         'if hasattr(signal,"SIGBREAK"): signal.signal(signal.SIGBREAK,lambda *_:sys.exit(7))\n'+body,
                         encoding='utf-8')
        return launcher.run_supervised_capture([str(launcher.PYTHON),str(child)],self.root/'console.log',
                                                start_delay=0,show_output=False,**options)

    def test_preparation_that_never_finishes_is_stopped(self):
        result=self.run_child('print("STATUS: CALIBRATING 1/1 | capture 0",flush=True)\n'
                              'for _ in range(200): time.sleep(.05)\n',
                              duration=1,startup_timeout=.6,grace_seconds=.3)
        self.assertEqual(result['watchdog_reason'],'preparation_timeout')
        self.assertFalse(result['recording_observed'])
        self.assertLess(result['elapsed_wall_s'],5)

    def test_normal_recording_is_not_cut_off_by_preparation_deadline(self):
        result=self.run_child('print("STATUS: CALIBRATING",flush=True)\ntime.sleep(.15)\n'
                              'print("STATUS: RECORDING 1/1 | elapsed 0/1s",flush=True)\ntime.sleep(.3)\n',
                              duration=.5,startup_timeout=1,grace_seconds=.5)
        self.assertEqual(result['exit_code'],0)
        self.assertIsNone(result['watchdog_reason'])
        self.assertTrue(result['recording_observed'])

    def test_recording_that_never_finishes_is_stopped(self):
        result=self.run_child('print("STATUS: RECORDING 1/1",flush=True)\n'
                              'for _ in range(200): time.sleep(.05)\n',
                              duration=.2,startup_timeout=1,grace_seconds=.3)
        self.assertEqual(result['watchdog_reason'],'recording_or_save_timeout')
        self.assertLess(result['elapsed_wall_s'],5)

    def test_official_quality_failure_retains_nonzero_exit(self):
        result=self.run_child('print("FAIL: capture quality",flush=True)\nsys.exit(5)\n',
                              duration=1,startup_timeout=1)
        self.assertEqual(result['exit_code'],5)
        self.assertIsNone(result['watchdog_reason'])
        self.assertIn('FAIL: capture quality',(self.root/'console.log').read_text(encoding='utf-8'))

    def test_unresponsive_child_is_killed_after_bounded_cleanup(self):
        process=Mock()
        process.poll.return_value=None
        process.wait.side_effect=[subprocess.TimeoutExpired('fake',10),0]
        launcher.stop_collector(process)
        process.kill.assert_called_once_with()
        self.assertEqual(process.wait.call_args_list[0].kwargs,{'timeout':10})
        self.assertEqual(process.wait.call_args_list[1].kwargs,{'timeout':5})

    def test_repeated_status_is_logged_fully_but_not_flooded_to_console(self):
        child=self.root/'status.py'
        child.write_text('print("STATUS: CALIBRATING\\n"*50,end="",flush=True)\n'
                         'print("STATUS: RECORDING 1/1",flush=True)\n',encoding='utf-8')
        visible=io.StringIO()
        with redirect_stdout(visible):
            result=launcher.run_supervised_capture([str(launcher.PYTHON),str(child)],self.root/'console.log',
                                                   duration=1,start_delay=0,startup_timeout=1)
        self.assertEqual(result['exit_code'],0)
        self.assertEqual((self.root/'console.log').read_text(encoding='utf-8').count('STATUS: CALIBRATING'),50)
        self.assertEqual(visible.getvalue().count('STATUS: CALIBRATING'),1)

    @unittest.skipUnless(sys.platform == 'win32', 'Windows timer API')
    def test_timer_request_is_released_even_if_collection_raises(self):
        api=Mock()
        api.timeBeginPeriod.return_value=0
        with patch('ctypes.WinDLL',return_value=api):
            with self.assertRaisesRegex(ValueError,'simulated'):
                with runner.collection_timer():
                    raise ValueError('simulated collection error')
        api.timeBeginPeriod.assert_called_once_with(1)
        api.timeEndPeriod.assert_called_once_with(1)

    @unittest.skipUnless(sys.platform == 'win32', 'Windows timer API')
    def test_failed_timer_request_does_not_start_collection(self):
        api=Mock()
        api.timeBeginPeriod.return_value=1
        with patch('ctypes.WinDLL',return_value=api):
            with self.assertRaises(RuntimeError):
                with runner.collection_timer():
                    self.fail('Collection entered after failed timer request')
        api.timeEndPeriod.assert_not_called()

    def test_command_retains_official_quality_and_calibration_defaults(self):
        command=launcher.build_command('192.0.2.1','S1',60,'418','TEST_ONLY')
        self.assertEqual(Path(command[1]),launcher.RUNNER)
        self.assertEqual(command[command.index('--pps')+1],'100')
        self.assertEqual(command[command.index('--duration')+1],'60')
        self.assertNotIn('--ready-stable-seconds',command)
        self.assertNotIn('--detector',command)

if __name__=='__main__':
    unittest.main()
