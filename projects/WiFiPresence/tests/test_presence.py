"""Scientific boundaries, classifier behavior, live faults, and HTTP integration."""
import copy
from contextlib import nullcontext
import json
from pathlib import Path
import tempfile
import threading
from types import SimpleNamespace
import unittest
from urllib.error import HTTPError
from urllib.request import Request,urlopen
from unittest.mock import patch

import numpy as np

from wifipresence.core import DataError,load_capture
from wifipresence.presence_demo import make_fixture_dataset
from wifipresence.presence_model import (admission,evaluate,feature_windows,infer,readiness,train,validate_model)
from wifipresence.presence_live import LiveSession
from wifipresence.presence_server import PresenceApp,make_server

ROOT=Path(__file__).resolve().parents[1]


class PresenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        temporary_root=ROOT/'.test-work'
        temporary_root.mkdir(exist_ok=True)
        cls.temp=tempfile.TemporaryDirectory(dir=temporary_root)
        cls.manifest,cls.inventory=make_fixture_dataset(Path(cls.temp.name)/'fixtures')
        cls.model=train(cls.manifest,cls.inventory)
    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()

    def rewrite_manifest(self,edit):
        rows=[json.loads(s) for s in self.manifest.read_text().splitlines()]
        edit(rows)
        p=Path(self.temp.name)/'fixtures'/'modified.jsonl'
        p.write_text('\n'.join(json.dumps(r) for r in rows),encoding='utf-8')
        return p

    def test_real_pilot_blocks_training_without_creating_model(self):
        r=readiness(ROOT/'data/trials.jsonl',ROOT/'data/inventory.json')
        self.assertFalse(r['ready']);self.assertEqual(r['qualified_observed_files'],{'empty':0,'present':4})
        with self.assertRaisesRegex(DataError,'NOT_READY'):
            train(ROOT/'data/trials.jsonl',ROOT/'data/inventory.json')

    def test_failure_check_cannot_be_overridden_by_pass_boolean(self):
        self.assertFalse(admission({'official_admission_passed':True,'quality_checks':[
            {'name':'file_load','status':'PASS'},{'name':'temporal_occupancy','status':'FAIL'}]}))

    def test_unknown_quality_receipt_is_not_accepted(self):
        self.assertFalse(admission(None));self.assertFalse(admission({'official_admission_passed':True}))

    def test_recording_batch_leakage_is_rejected(self):
        p=self.rewrite_manifest(lambda rows:rows[6].update(collection_batch='SYNTHETIC_BATCH_development'))
        self.assertIn('collection_batch_leaks_across_splits',[r['code'] for r in readiness(p,self.inventory)['reasons']])

    def test_fragments_of_same_origin_cannot_cross_splits(self):
        p=self.rewrite_manifest(lambda rows:rows[6].update(origin_id=rows[0]['origin_id']))
        self.assertIn('original_recording_leaks_across_splits',[r['code'] for r in readiness(p,self.inventory)['reasons']])

    def test_truth_must_be_independently_confirmed(self):
        p=self.rewrite_manifest(lambda rows:rows[0].update(truth_confirmed=False))
        self.assertFalse(readiness(p,self.inventory)['ready'])

    def test_synthetic_classifier_and_held_out_pipeline(self):
        self.assertTrue(self.model['synthetic'])
        report=evaluate(self.manifest,self.inventory,self.model)
        self.assertEqual(report['status'],'SYNTHETIC_SOFTWARE_CHECK')
        self.assertEqual(len(report['trials']),6)
        # These generated classes are deliberately separable; this is a behavior check.
        self.assertTrue(all(t['correct_fraction_of_valid']==1 for t in report['trials']))

    def test_training_is_deterministic(self):
        self.assertEqual(self.model['weights'],train(self.manifest,self.inventory)['weights'])

    def test_features_do_not_contain_truth_or_fan_label(self):
        c=load_capture(self.manifest.parent/'test-S1.npz')
        before=feature_windows(c)
        c.info['label']='present';c.info['fan']='on'
        self.assertEqual(before,feature_windows(c))

    def test_synthetic_model_never_predicts_real_presence(self):
        row=json.loads((ROOT/'data/trials.jsonl').read_text().splitlines()[1])
        c=load_capture(ROOT/'data'/row['file'])
        outputs=infer(c,self.model,admitted=True,room='SYNTHETIC_ROOM')
        self.assertTrue(all(r['presence']=='UNKNOWN' and r['reason']=='synthetic_real_domain_mismatch' for r in outputs))

    def test_file_failure_overrides_valid_project_windows(self):
        c=load_capture(self.manifest.parent/'test-S1.npz')
        rows=infer(c,self.model,admitted=False,room='SYNTHETIC_ROOM')
        self.assertTrue(all(r['presence']=='UNKNOWN' for r in rows))
        self.assertEqual(rows[-1]['reason'],'official_file_admission_failed_or_unverified')

    def test_missing_model_outputs_unknown_not_empty(self):
        c=load_capture(self.manifest.parent/'test-S1.npz')
        self.assertTrue(all(r['presence']=='UNKNOWN' for r in infer(c)))

    def test_gap_window_remains_unknown_with_model(self):
        c=load_capture(self.manifest.parent/'test-S1.npz')
        keep=(c.times<1)|(c.times>=4);c.times=c.times[keep];c.amplitude=c.amplitude[keep]
        rows=infer(c,self.model,admitted=True,room='SYNTHETIC_ROOM')
        self.assertTrue(any(r['reason']=='insufficient_window_quality' and r['presence']=='UNKNOWN' for r in rows))

    def test_invalid_model_parameters_are_rejected(self):
        m=copy.deepcopy(self.model);m['weights'][0]=float('nan')
        with self.assertRaises(DataError):validate_model(m)

    def test_room_scope_and_profile_mismatch_are_unknown(self):
        c=load_capture(self.manifest.parent/'test-S1.npz')
        self.assertEqual(infer(c,self.model,admitted=True,room='OTHER')[-1]['reason'],'room_scope_not_confirmed')
        c.info['device_id']='DIFFERENT'
        self.assertEqual(infer(c,self.model,admitted=True,room='SYNTHETIC_ROOM')[-1]['reason'],'device_firmware_or_rate_mismatch')

    def test_evaluation_cannot_reuse_development(self):
        with self.assertRaisesRegex(DataError,'overlaps'):
            evaluate(self.manifest,self.inventory,self.model,'development')

    def test_live_stale_or_stopped_stream_always_unknown(self):
        clock=[0.];s=LiveSession(clock=lambda:clock[0]);s.status='STREAMING'
        for i in range(121):
            s.accept_packet(SimpleNamespace(iq_raw=np.ones(128,np.int8),device_ticks_us=i*10000,
                phy_mode='ht',ltf_type='ht-ltf',channel_width='20',device_id=123,firmware_version='3.0.0'))
        self.assertEqual(s.snapshot()['reason'],'model_not_ready')
        clock[0]=4
        self.assertEqual(s.snapshot()['reason'],'stale_stream')
        s.status='ERROR';self.assertEqual(s.snapshot()['presence'],'UNKNOWN')

    def test_live_cleanup_restores_mode_on_transport_error(self):
        state={'mode':'internal','stopped':[]}
        class Client:
            def __init__(self,endpoint,**k):
                if not endpoint.endswith('/espectre/v1'):
                    raise ValueError('Direct control endpoint must include the API path.')
            def request(self,op,resource,data=None):
                if resource=='device':return {'chip':'esp32c6','firmware':'3.0.0'}
                if resource=='capabilities':return {'csi':{'protocol_version':1,'marker':'TEST'}}
                if resource=='diagnostics':return {'raw_csi':{'active':False}}
                if op=='patch':state['mode']=data['traffic_generator_mode'];return {}
                return {'traffic_generator_mode':state['mode']}
            def close(self):state['closed']=True
        class Receiver:
            def __init__(self,*a,**k):pass
            def add_callback(self,f):pass
            def start_session(self):pass
            def bind_stream(self):pass
            def run(self,**k):raise RuntimeError('simulated transport failure')
            def stop(self):state['stopped'].append('receiver')
        class Generator:
            TRAFFIC_MARKER='TEST'
            def __init__(self,*a,**k):pass
            def start(self):pass
            def stop(self):state['stopped'].append('generator')
        s=LiveSession();s._run('192.0.2.1',None,3,(Client,Receiver,Generator))
        self.assertEqual(state['mode'],'internal');self.assertTrue(s.restored)
        self.assertEqual(s.status,'ERROR');self.assertEqual(set(state['stopped']),{'receiver','generator'})
        self.assertEqual(s.snapshot()['presence'],'UNKNOWN')

    def test_local_http_actions_and_origin_boundary(self):
        app=PresenceApp(ROOT);server=make_server(app,0)
        worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
        url=f'http://127.0.0.1:{server.server_port}'
        try:
            with urlopen(url+'/api/example/S2',timeout=5) as r:d=json.load(r)
            self.assertEqual(d['presence'],'UNKNOWN')
            with urlopen(Request(url+'/api/train',data=b'',method='POST'),timeout=5) as r:d=json.load(r)
            self.assertFalse(d['trained'])
            with self.assertRaises(HTTPError) as ctx:
                urlopen(Request(url+'/api/train',data=b'',headers={'Origin':'https://unrelated.example'},method='POST'),timeout=5)
            self.assertEqual(ctx.exception.code,403)
            with self.assertRaises(HTTPError) as ctx:
                urlopen(Request(url+'/api/upload',data=b'bad npz',method='POST'),timeout=5)
            self.assertEqual(ctx.exception.code,400)
        finally:server.shutdown();server.server_close();worker.join(2)

    def test_custom_study_paths_do_not_require_overwriting_original_pilots(self):
        app=PresenceApp(ROOT,manifest=self.manifest,inventory=self.inventory)
        self.assertTrue(app.dataset_state['ready'])
        self.assertEqual(len(app.scenes),6)
        self.assertTrue(Path(app.scenes['S1']['file']).is_file())


if __name__=='__main__':unittest.main()
