"""Deterministic transport-fault and HTTP safety checks; no device is contacted."""
import json
import threading
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request,urlopen
import numpy as np

import app
from wifipresence.core import DataError, Config
from dataclasses import asdict
from wifipresence.presence_model import FEATURE_NAMES, FEATURE_VERSION
from wifipresence.presence_live import LiveSession

# Artificial model fixture for transport behavior only, never written to a product model file.
TEST_MODEL = {'kind':'experimental_presence_logistic','feature_version':FEATURE_VERSION,'feature_names':FEATURE_NAMES,
 'synthetic':False,'confidence':.8,'center':[0.0]*20,'scale':[1.0]*20,'weights':[0.0]*20,'bias':4.0,
 'profile':{'device_id':'TEST_DEVICE','firmware_version':'3.0.0','requested_pps':100.0,'room':'418'},
 'config':asdict(Config()),'fit_sha256':['0'*64],'fit_trial_ids':['SOFTWARE_FIXTURE_ONLY']}

class LiveChecks(unittest.TestCase):
    def packet(self,i):
        return SimpleNamespace(iq_raw=np.full(128,10,np.int8),device_ticks_us=i*10000,
            phy_mode='ht',ltf_type='ht-ltf',channel_width='20',
            device_id=TEST_MODEL['profile']['device_id'],firmware_version='3.0.0')

    def populated(self,model=TEST_MODEL,clock=None):
        session=LiveSession(model=model,clock=clock or time.monotonic)
        session.status='STREAMING'
        for i in range(180):session.accept_packet(self.packet(i))
        return session

    def test_stale_stopped_no_model_and_bad_window_are_unknown(self):
        clock=[0.0];s=self.populated(clock=lambda:clock[0])
        self.assertEqual(s.snapshot()['status'],'STREAMING')
        clock[0]=4.0
        self.assertEqual((s.snapshot()['presence'],s.snapshot()['reason']),('UNKNOWN','stale_stream'))
        s.status='STOPPED';self.assertEqual(s.snapshot()['presence'],'UNKNOWN')
        missing=self.populated(model=None)
        self.assertEqual((missing.snapshot()['presence'],missing.snapshot()['reason']),('UNKNOWN','model_not_ready'))
        poor=LiveSession(model=TEST_MODEL);poor.status='STREAMING'
        for i in (0,40,80,120,160):poor.accept_packet(self.packet(i))
        self.assertEqual(poor.snapshot()['presence'],'UNKNOWN')
        self.assertEqual(poor.snapshot()['reason'],'insufficient_window_quality')

    def test_backpressure_and_room_mismatch_are_unknown(self):
        s=self.populated();s.transport_problem=True
        self.assertEqual(s.snapshot()['reason'],'raw_transport_drops_or_backpressure')
        s=self.populated();s.room='other-room'
        self.assertEqual(s.snapshot()['reason'],'room_scope_not_confirmed')
        self.assertEqual(s.snapshot()['presence'],'UNKNOWN')

    def test_result_computed_during_stop_cannot_be_reused(self):
        s=self.populated();entered=threading.Event();release=threading.Event();out=[]
        def slow_infer(*args,**kwargs):
            entered.set();release.wait(2)
            return [{'presence':'EMPTY','reason':'experimental_model_output'}]
        with patch('wifipresence.presence_live.infer',slow_infer):
            t=threading.Thread(target=lambda:out.append(s.snapshot()));t.start()
            self.assertTrue(entered.wait(2))
            with s.lock:s.status='STOPPING';s.stop_event.set()
            release.set();t.join(3)
        self.assertEqual(out[0]['presence'],'UNKNOWN')
        self.assertEqual(out[0]['reason'],'stream_changed_during_processing')

    def test_simulated_start_stop_closes_and_restores_original_mode(self):
        state={'mode':'internal','closed':False,'patches':[]};ready=threading.Event();owner=self
        class Client:
            def __init__(self,url,**kwargs):self.url=url
            def request(self,op,path,data=None):
                if path=='device':return {'chip':'esp32c6','firmware':'3.0.0'}
                if path=='capabilities':return {'csi':{'protocol_version':1,'marker':'TEST'}}
                if path=='diagnostics':return {'raw_csi':{'active':False}}
                if path=='sensing' and op=='patch':state['mode']=data['traffic_generator_mode'];state['patches'].append(state['mode']);return {}
                return {'traffic_generator_mode':state['mode']}
            def close(self):state['closed']=True
        class Receiver:
            def __init__(self,*args,**kwargs):self.running=True
            def add_callback(self,callback):self.callback=callback
            def start_session(self):pass
            def bind_stream(self):pass
            def run(self,**kwargs):
                for i in range(180):self.callback(owner.packet(i))
                ready.set()
                while self.running:time.sleep(.01)
            def stop(self):self.running=False
        class Generator:
            TRAFFIC_MARKER='TEST'
            def __init__(self,*args,**kwargs):pass
            def start(self):pass
            def stop(self):pass
        s=LiveSession(model=TEST_MODEL);s.start('192.168.1.50',None,12,(Client,Receiver,Generator))
        self.assertTrue(ready.wait(5));live=s.snapshot();self.assertEqual(live['status'],'STREAMING')
        self.assertEqual(live['presence'],'PRESENT');self.assertEqual(live['reason'],'experimental_model_output')
        with self.assertRaises(DataError):s.start('192.168.1.50',None,12,(Client,Receiver,Generator))
        s.stop();end=s.snapshot()
        self.assertEqual(end['status'],'STOPPED');self.assertEqual(end['presence'],'UNKNOWN')
        self.assertTrue(end['session_closed']);self.assertTrue(end['restored'])
        self.assertEqual(state['mode'],'internal');self.assertEqual(state['patches'],['external','internal']);self.assertTrue(state['closed'])

    def test_existing_raw_session_is_never_taken_over(self):
        state={'patches':0,'closed':False}
        class Client:
            def __init__(self,*args,**kwargs):pass
            def request(self,op,path,data=None):
                if op=='patch':state['patches']+=1
                if path=='device':return {'chip':'esp32c6','firmware':'3.0.0'}
                if path=='sensing':return {'traffic_generator_mode':'external'}
                if path=='diagnostics':return {'raw_csi':{'active':True}}
                return {}
            def close(self):state['closed']=True
        class Unused:
            TRAFFIC_MARKER='TEST'
            def __init__(self,*args,**kwargs):raise AssertionError('Must not create receiver or generator')
        s=LiveSession(model=TEST_MODEL);s._run('192.168.1.50',None,12,(Client,Unused,Unused))
        self.assertEqual(s.snapshot()['status'],'ERROR');self.assertEqual(s.snapshot()['presence'],'UNKNOWN')
        self.assertIn('Another raw CSI session',s.error);self.assertEqual(state['patches'],0)
        self.assertIsNone(s.restored);self.assertFalse(s.session_closed);self.assertTrue(state['closed'])

    def test_existing_external_mode_is_not_reapplied(self):
        state={'patches':[]}
        class Client:
            def __init__(self,*args,**kwargs):pass
            def request(self,op,path,data=None):
                if op=='patch':state['patches'].append(data);return {}
                if path=='device':return {'chip':'esp32c6','firmware':'3.0.0'}
                if path=='sensing':return {'traffic_generator_mode':'external'}
                if path=='diagnostics':return {'raw_csi':{'active':False}}
                if path=='capabilities':return {'csi':{'protocol_version':1,'marker':'TEST'}}
            def close(self):pass
        class Receiver:
            def __init__(self,*args,**kwargs):pass
            def add_callback(self,callback):pass
            def start_session(self):pass
            def bind_stream(self):pass
            def run(self,**kwargs):pass
            def stop(self):pass
        class Generator:
            TRAFFIC_MARKER='TEST'
            def __init__(self,*args,**kwargs):pass
            def start(self):pass
            def stop(self):pass
        s=LiveSession(model=TEST_MODEL);s._run('192.168.1.50',None,12,(Client,Receiver,Generator))
        self.assertEqual(state['patches'],[]);self.assertEqual(s.status,'STOPPED')
        self.assertTrue(s.restored);self.assertTrue(s.session_closed)

    def test_http_simulated_stream_with_software_model_fixture(self):
        state={'mode':'internal'};ready=threading.Event();owner=self
        class Client:
            def __init__(self,*args,**kwargs):pass
            def request(self,op,path,data=None):
                if path=='device':return {'chip':'esp32c6','firmware':'3.0.0'}
                if path=='capabilities':return {'csi':{'protocol_version':1,'marker':'TEST'}}
                if path=='diagnostics':return {'raw_csi':{'active':False}}
                if op=='patch':state['mode']=data['traffic_generator_mode'];return {}
                return {'traffic_generator_mode':state['mode']}
            def close(self):pass
        class Receiver:
            def __init__(self,*args,**kwargs):self.running=True
            def add_callback(self,callback):self.callback=callback
            def start_session(self):pass
            def bind_stream(self):pass
            def run(self,**kwargs):
                for i in range(180):self.callback(owner.packet(i))
                ready.set()
                while self.running:time.sleep(.01)
            def stop(self):self.running=False
        class Generator:
            TRAFFIC_MARKER='TEST'
            def __init__(self,*args,**kwargs):pass
            def start(self):pass
            def stop(self):pass
        s=LiveSession(model=TEST_MODEL);original_start=s.start
        def simulated_start(target,repo,duration):original_start(target,repo,duration,(Client,Receiver,Generator))
        with patch.object(s,'start',simulated_start),patch.object(app,'LIVE',s):
            server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();url=f'http://127.0.0.1:{server.server_port}'
            def post(path,data):
                body=json.dumps(data).encode();req=Request(url+path,data=body,method='POST',headers={'Origin':url,'Content-Type':'application/json','X-WiFiPresence-Request':'1'})
                with urlopen(req,timeout=10) as response:return json.load(response)
            try:
                post('/api/live/start',{'target':'192.168.1.50','room':'418','duration':12})
                self.assertTrue(ready.wait(5))
                with urlopen(url+'/api/live/status',timeout=5) as response:current=json.load(response)['live']
                self.assertEqual((current['status'],current['presence'],current['packets']),('STREAMING','PRESENT',180))
                stopped=post('/api/live/stop',{})
                self.assertEqual((stopped['status'],stopped['presence']),('STOPPED','UNKNOWN'))
                self.assertTrue(stopped['session_closed']);self.assertTrue(stopped['restored']);self.assertEqual(state['mode'],'internal')
            finally:s.stop();server.shutdown();server.server_close();thread.join(3)

    def test_local_api_rejects_cross_origin_and_invalid_input(self):
        server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        t=threading.Thread(target=server.serve_forever,daemon=True);t.start();url=f'http://127.0.0.1:{server.server_port}'
        try:
            with urlopen(url+'/api/live/status',timeout=5) as response:
                state=json.load(response);self.assertEqual(state['app'],'WiFiPresence-live-MVP');self.assertEqual(state['live']['presence'],'UNKNOWN')
            body=json.dumps({'target':'127.0.0.1','room':'418','duration':12}).encode()
            def send(origin):return urlopen(Request(url+'/api/live/start',data=body,method='POST',headers={'Origin':origin,'Content-Type':'application/json','X-WiFiPresence-Request':'1'}),timeout=5)
            with self.assertRaises(HTTPError) as denied:send('https://unrelated.example')
            self.assertEqual(denied.exception.code,403);denied.exception.close()
            with self.assertRaises(HTTPError) as invalid:send(url)
            self.assertEqual(invalid.exception.code,400);invalid.exception.close()
        finally:server.shutdown();server.server_close();t.join(3)

if __name__=='__main__':unittest.main()
