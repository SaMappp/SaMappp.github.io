"""WiFiPresence: local CSI live and recorded research demonstration."""
import argparse
import os
import csv
import hashlib
import io
import json
import threading
import webbrowser
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from wifipresence.core import DataError, load_capture, predict
from wifipresence.presence_model import admission, infer, validate_model
from wifipresence.presence_live import LiveSession

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('WIFIPRESENCE_DATA_DIR', ROOT / 'data')).resolve()
TRIALS = json.loads((DATA / 'trials.json').read_text(encoding='utf8')) if (DATA / 'trials.json').is_file() else []
MODEL_ERROR = None
try:
    PRESENCE = json.loads((DATA / 'presence-model.json').read_text(encoding='utf8'))
    validate_model(PRESENCE)
except (OSError, ValueError, KeyError, TypeError, DataError) as exc:
    PRESENCE = None
    MODEL_ERROR = str(exc)
MOTION = json.loads((DATA / 'motion-model.json').read_text(encoding='utf8')) if (DATA / 'motion-model.json').is_file() else None
OFFICIAL_REPO = Path(os.environ.get('WIFIPRESENCE_ESPECTRE_REPO', Path.home() / 'Documents' / 'Codex' / 'WiFiPresence-Capture'))
LIVE = LiveSession(model=PRESENCE, room='418')
LIVE_REQUEST_LOCK = threading.Lock()
BY_ID = {r['trial_id']: r for r in TRIALS}
if len(BY_ID) != len(TRIALS):
    raise RuntimeError('Duplicate trial IDs')
SCENES = {
    'S1': 'Empty / Fan off', 'S2': 'Walking / Fan off', 'S3': 'Seated / Fan off',
    'S4': 'Empty / Fan on', 'S5': 'Walking / Fan on', 'S6': 'Seated / Fan on',
}

def list_trials():
    return [{'trial_id': r['trial_id'], 'scenario': r['scenario'], 'description': SCENES[r['scenario']],
             'split': r['split'], 'batch': r['batch']} for r in TRIALS]

def replay(trial_id):
    if trial_id not in BY_ID:
        raise DataError('Unknown trial. Select a listed recording.')
    r = BY_ID[trial_id]
    path = (DATA / r['file']).resolve()
    if DATA.resolve() not in path.parents or not path.is_file():
        raise DataError('Recording is missing or outside the dataset directory.')
    if hashlib.sha256(path.read_bytes()).hexdigest() != r['sha256']:
        raise DataError('Recording hash mismatch; processing stopped.')
    approved = admission(r['receipt']) and r['receipt']['sha256'] == r['sha256']
    if not approved:
        raise DataError('Official file-quality evidence is missing or failed; processing stopped.')
    capture = load_capture(path)
    prs = infer(capture, PRESENCE, admitted=approved, room=r['room'])
    if MOTION is None: raise DataError('Local motion model missing. Configure WIFIPRESENCE_DATA_DIR.')
    mov = predict(capture, MOTION)
    if len(prs) != len(mov):
        raise DataError('Presence and motion window counts differ.')
    combined = []
    for p, m in zip(prs, mov):
        if p['start_s'] != m['start_s'] or p['end_s'] != m['end_s']:
            raise DataError('Motion and presence windows do not align.')
        combined.append({'start_s':p['start_s'], 'end_s':p['end_s'], 'amplitude':p['amplitude'],
            'coverage':p['occupancy'], 'quality':p['quality'], 'presence':p['presence'],
            'model_score':p['model_score'], 'presence_reason':p['reason'], 'motion_score':m['score'],
            'baseline':m['baseline'], 'candidate':m['candidate']})
    counts = {}
    for key in ('presence','baseline','candidate'):
        counts[key] = dict(Counter(w[key] for w in combined))
    warnings = [c['name'] for c in r['receipt']['quality_checks'] if c['status'] == 'WARN']
    return {'trial_id':trial_id, 'scenario':r['scenario'], 'description':SCENES[r['scenario']],
        'batch':r['batch'], 'split':r['split'], 'sha256':r['sha256'], 'source':'REAL_RECORDED_CSI',
        'recorded_condition':'EMPTY' if r['scenario'] in ('S1','S4') else 'PRESENT',
        'condition_source':r['truth_source'], 'official_quality':'PASS_WITH_WARNINGS' if warnings else 'PASS',
        'quality_warnings':warnings, 'window_count':len(combined), 'counts':counts,
        'motion_thresholds':{'enter':MOTION['enter_threshold'],'exit':MOTION['exit_threshold']},
        'warning':'Research demonstration. Model misclassifies some empty-room recordings; do not use for occupancy control. IDLE does not mean empty.',
        'windows':combined}

def csv_bytes(result):
    s=io.StringIO(newline='')
    names=['start_s','end_s','amplitude','coverage','quality','presence','model_score','presence_reason','motion_score','baseline','candidate']
    writer=csv.DictWriter(s,fieldnames=names);writer.writeheader();writer.writerows(result['windows'])
    return ('\ufeff'+s.getvalue()).encode('utf8')

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def send_data(self, status, body, content_type, filename=None):
        self.send_response(status)
        self.send_header('Content-Type',content_type)
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        if filename:self.send_header('Content-Disposition',f'attachment; filename="{filename}"')
        self.end_headers();self.wfile.write(body)
    def origin_allowed(self, *, require_origin=False):
        host = self.headers.get('Host','').lower()
        allowed = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        origin = self.headers.get('Origin')
        return host in allowed and (origin in {'http://'+h for h in allowed} if require_origin else origin is None or origin in {'http://'+h for h in allowed})
    def send_json(self, status, value):
        self.send_data(status,json.dumps(value,ensure_ascii=False,allow_nan=False).encode('utf8'),'application/json; charset=utf-8')
    def do_GET(self):
        if not self.origin_allowed():
            self.send_data(403,b'Forbidden','text/plain');return
        req=urlsplit(self.path)
        try:
            if req.path=='/':
                self.send_data(200,(ROOT/'live.html').read_bytes(),'text/html; charset=utf-8');return
            if req.path=='/file':
                self.send_data(200,(ROOT/'index.html').read_bytes(),'text/html; charset=utf-8');return
            if req.path=='/api/live/status':
                self.send_json(200,{'app':'WiFiPresence-live-MVP','model_loaded':PRESENCE is not None,
                    'model_status':PRESENCE['status'] if PRESENCE else 'NOT_READY','model_error':MODEL_ERROR,
                    'trained_room':PRESENCE['profile']['room'] if PRESENCE else None,
                    'live':LIVE.snapshot()});return
            if req.path=='/api/trials':
                self.send_data(200,json.dumps({'trials':list_trials()},ensure_ascii=False).encode(), 'application/json; charset=utf-8');return
            if req.path in ('/api/replay','/api/report.csv','/api/report.json'):
                args=parse_qs(req.query,keep_blank_values=True)
                if set(args)!={'id'} or len(args['id'])!=1:raise DataError('Exactly one trial ID is required.')
                result=replay(args['id'][0])
                if req.path.endswith('.csv'):
                    self.send_data(200,csv_bytes(result),'text/csv; charset=utf-8',result['trial_id']+'.csv');return
                payload=json.dumps(result,ensure_ascii=False,allow_nan=False).encode('utf8')
                filename=result['trial_id']+'.json' if req.path.endswith('.json') else None
                self.send_data(200,payload,'application/json; charset=utf-8',filename);return
            self.send_data(404,b'Not found','text/plain')
        except (DataError,OSError,ValueError,KeyError,TypeError) as exc:
            self.send_data(400,json.dumps({'error':str(exc)},ensure_ascii=False).encode('utf8'),'application/json; charset=utf-8')
    def do_POST(self):
        if not self.origin_allowed(require_origin=True) or self.headers.get('X-WiFiPresence-Request') != '1':
            self.send_json(403,{'error':'Local page origin required.'});return
        if self.headers.get('Content-Type','').split(';',1)[0].strip().lower()!='application/json':
            self.send_json(415,{'error':'JSON required.'});return
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0 < length <= 2048: raise DataError('Invalid request size.')
            data=json.loads(self.rfile.read(length))
            if not isinstance(data,dict): raise DataError('JSON object required.')
            if self.path=='/api/live/start':
                target=data.get('target'); room=data.get('room'); duration=data.get('duration')
                if not isinstance(target,str) or not isinstance(room,str) or not room.strip() or len(room)>80 or type(duration) is not int:
                    raise DataError('Enter device IPv4, room and whole-number duration.')
                with LIVE_REQUEST_LOCK:
                    if LIVE.thread and LIVE.thread.is_alive(): raise DataError('A live session is already active.')
                    LIVE.room=room.strip()
                    LIVE.start(target.strip(),OFFICIAL_REPO,duration)
                self.send_json(200, LIVE.snapshot());return
            if self.path=='/api/live/stop':
                with LIVE_REQUEST_LOCK: LIVE.stop()
                self.send_json(200, LIVE.snapshot());return
            self.send_json(404,{'error':'Not found'})
        except (DataError,OSError,ValueError,KeyError,TypeError,json.JSONDecodeError) as exc:
            self.send_json(400,{'error':str(exc)})

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=18768);parser.add_argument('--no-browser',action='store_true')
    args=parser.parse_args()
    try: server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    except OSError as exc: raise SystemExit(f'Cannot start local server on port {args.port}: {exc}')
    url=f'http://127.0.0.1:{server.server_port}/'
    print(f'WiFiPresence research demo: {url}\nPress Ctrl+C to stop.',flush=True)
    if not args.no_browser:threading.Timer(.5,lambda:webbrowser.open(url)).start()
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:
        LIVE.stop()
        server.server_close()

if __name__=='__main__':main()
