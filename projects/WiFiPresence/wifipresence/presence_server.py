"""Loopback operation page. Raw uploads are temporary and never relabeled."""
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import json,tempfile,zipfile,io
from .core import DataError,save_json
from .presence_model import admission,file_digest,load_inventory,predict_file,readiness,train,validate_model
from .experiments import read_manifest
from .presence_live import LiveSession

class PresenceApp:
    def __init__(self,root,official_repo=None,model_path=None,manifest=None,inventory=None):
        self.root=Path(root)
        self.inventory=Path(inventory) if inventory else self.root/'data/inventory.json'
        self.manifest=Path(manifest) if manifest else self.root/'data/trials.jsonl'
        self.official_repo=official_repo
        self.model=json.loads(Path(model_path).read_text(encoding='utf-8-sig')) if model_path else None
        if self.model:validate_model(self.model)
        self.dataset_state=readiness(self.manifest,self.inventory)
        self.live=LiveSession(model=self.model)
        receipts=load_inventory(self.inventory);self.scenes={};self.rooms={}
        for record in read_manifest(self.manifest):
            if record['scenario'] not in ('S1','S2','S3','S4','S5','S6'):continue
            receipt=receipts.get(record['_sha256'])
            coverage=next((r.get('value') for r in (receipt or {}).get('quality_checks',[]) if r.get('name')=='temporal_occupancy'),None)
            self.rooms[record['_sha256']]=record['room']
            self.scenes[record['scenario']]={'file':record['_path'],'room':record['room'],'official_admission_passed':admission(receipt),
                                            'temporal_occupancy':(receipt or {}).get('temporal_occupancy',coverage)}
    def status(self):
        return {'app':'WiFiPresence','readiness':self.dataset_state,'model_loaded':self.model is not None,
                'model_status':self.model.get('status') if self.model else 'NOT_TRAINED',
                'scenes':[{'id':k,'admitted':r['official_admission_passed'],'occupancy':r['temporal_occupancy']} for k,r in sorted(self.scenes.items())],
                'live_available':self.official_repo is not None,'live':self.live.snapshot()}
    def analyze_scene(self,scene):
        if scene not in self.scenes:raise DataError('Unknown example scene.')
        return predict_file(self.root/self.scenes[scene]['file'],self.inventory,self.model,self.scenes[scene]['room'])
    def analyze_upload(self,body):
        if len(body)>10*1024*1024:raise DataError('NPZ upload exceeds 10 MiB.')
        try:
            with zipfile.ZipFile(io.BytesIO(body)) as z:
                if sum(i.file_size for i in z.infolist())>64*1024*1024:raise DataError('Uncompressed NPZ exceeds 64 MiB.')
        except zipfile.BadZipFile as exc:raise DataError('Upload is not an NPZ archive.') from exc
        temp=self.root/'.test-work';temp.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=temp) as folder:
            path=Path(folder)/'upload.npz';path.write_bytes(body)
            return predict_file(path,self.inventory,self.model,self.rooms.get(file_digest(path)))
    def train(self):
        self.dataset_state=readiness(self.manifest,self.inventory)
        if not self.dataset_state['ready']:
            return {'trained':False,'readiness':self.dataset_state,'reason':'Eligible EMPTY controls and independent splits missing; no model created.'}
        model=train(self.manifest,self.inventory)
        folder=self.root/'.test-work/models';folder.mkdir(parents=True,exist_ok=True)
        save_json(folder/'presence-candidate.json',model)
        self.model=model;self.live.model=model
        return {'trained':True,'model_status':model['status'],'experimental':True}

def make_server(app,port):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*_):pass
        def safe_origin(self):
            allowed={f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
            return self.headers.get('Host') in allowed and self.headers.get('Origin') in {None,*('http://'+x for x in allowed)}
        def reply(self,obj,code=200):
            body=json.dumps(obj,ensure_ascii=False,allow_nan=False).encode('utf-8')
            self.send_response(code);self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        def do_GET(self):
            if not self.safe_origin():return self.reply({'error':'Local origin required.'},403)
            try:
                if self.path=='/api/status':return self.reply(app.status())
                if self.path.startswith('/api/example/'):return self.reply(app.analyze_scene(self.path.removeprefix('/api/example/')))
                if self.path=='/':
                    body=(app.root/'ui/presence.html').read_bytes();self.send_response(200)
                    self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(body)))
                    self.end_headers();self.wfile.write(body);return
                self.reply({'error':'Not found'},404)
            except (DataError,OSError,ValueError,TypeError,KeyError) as exc:self.reply({'error':str(exc)},400)
        def do_POST(self):
            if not self.safe_origin():return self.reply({'error':'Local origin required.'},403)
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<=length<=10*1024*1024:return self.reply({'error':'Request too large'},413)
                body=self.rfile.read(length)
                if self.path=='/api/upload':return self.reply(app.analyze_upload(body))
                if self.path=='/api/train':return self.reply(app.train())
                if self.path=='/api/live/start':
                    if app.official_repo is None:raise DataError('Start server with --official-repo to enable live input.')
                    d=json.loads(body);app.live.start(str(d['target']),app.official_repo,int(d.get('duration',60)))
                    return self.reply(app.live.snapshot())
                if self.path=='/api/live/stop':app.live.stop();return self.reply(app.live.snapshot())
                self.reply({'error':'Not found'},404)
            except (DataError,OSError,ValueError,TypeError,KeyError) as exc:self.reply({'error':str(exc)},400)
    return ThreadingHTTPServer(('127.0.0.1',port),Handler)

def serve(root,port=8765,official_repo=None,model_path=None,manifest=None,inventory=None):
    if not 1024<=port<=65535:raise DataError('Use a local port from 1024 to 65535.')
    app=PresenceApp(root,official_repo,model_path,manifest,inventory);server=make_server(app,port)
    print(f'WiFiPresence local page: http://127.0.0.1:{server.server_port}',flush=True)
    print('No real model unless explicitly loaded; UNKNOWN is not EMPTY.',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:app.live.stop();server.server_close()
