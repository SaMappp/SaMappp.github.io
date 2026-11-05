"""Checks on real recordings, quality gates and the local demonstration API."""
import csv
import hashlib
import io
import json
import threading
import unittest
from copy import deepcopy
from urllib.error import HTTPError
from urllib.request import urlopen

import app
from wifipresence.core import DataError

@unittest.skipUnless(len(app.TRIALS)==26, 'Private recorded dataset is not bundled; set WIFIPRESENCE_DATA_DIR for these checks.')
class DemoChecks(unittest.TestCase):
    def selected_id(self, scene):
        return next(r['trial_id'] for r in app.TRIALS if r['batch']=='batch5' and r['scenario']==scene)

    def test_private_recording_hashes(self):
        self.assertEqual(len(app.TRIALS),26)
        for r in app.TRIALS:
            self.assertEqual(hashlib.sha256((app.DATA/r['file']).read_bytes()).hexdigest(),r['sha256'])
            self.assertTrue(app.admission(r['receipt']))

    def test_real_empty_room_counterexample_is_reproduced(self):
        r=app.replay(self.selected_id('S4'))
        self.assertEqual(r['recorded_condition'],'EMPTY')
        self.assertEqual(r['window_count'],237)
        self.assertEqual(r['counts']['presence'],{'PRESENT':237})
        self.assertEqual(r['counts']['baseline'],{'MOTION':139,'IDLE':98})
        self.assertEqual(r['counts']['candidate'],{'MOTION':197,'IDLE':40})
        for w in r['windows']:
            self.assertEqual(w['baseline']=='UNKNOWN',w['candidate']=='UNKNOWN')

    def test_invalid_recording_and_bad_hash_are_rejected(self):
        with self.assertRaises(DataError):app.replay('nonexistent')
        original=app.BY_ID[self.selected_id('S4')]
        altered=deepcopy(original);altered['sha256']='0'*64
        app.BY_ID[altered['trial_id']]=altered
        try:
            with self.assertRaisesRegex(DataError,'hash mismatch'):app.replay(altered['trial_id'])
        finally:app.BY_ID[original['trial_id']]=original

    def test_csv_export_matches_recording(self):
        result=app.replay(self.selected_id('S1'))
        rows=list(csv.DictReader(io.StringIO(app.csv_bytes(result).decode('utf-8-sig'))))
        self.assertEqual(len(rows),result['window_count'])
        self.assertEqual(sum(x['presence']=='PRESENT' for x in rows),213)
        self.assertEqual(sum(x['presence']=='UNKNOWN' for x in rows),24)

    def test_http_api_and_invalid_selection(self):
        server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        url=f'http://127.0.0.1:{server.server_port}'
        try:
            with urlopen(url+'/api/trials',timeout=10) as response:self.assertEqual(len(json.load(response)['trials']),26)
            with urlopen(url+'/api/replay?id='+self.selected_id('S4'),timeout=10) as response:
                self.assertEqual(json.load(response)['counts']['presence']['PRESENT'],237)
            with self.assertRaises(HTTPError) as failure:urlopen(url+'/api/replay?id=bad',timeout=10)
            self.assertEqual(failure.exception.code,400)
            failure.exception.close()
        finally:server.shutdown();server.server_close();thread.join(3)

if __name__=='__main__':unittest.main()
