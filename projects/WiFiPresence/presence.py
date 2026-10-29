"""Presence research CLI. UNKNOWN is not EMPTY."""
import argparse
import json
from pathlib import Path
import sys
from wifipresence.core import DataError, save_json
from wifipresence.presence_model import evaluate, predict_file, readiness, train

ROOT = Path(__file__).resolve().parent

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    subs=parser.add_subparsers(dest='command',required=True)
    for name in ('status','train','evaluate','audit'):
        p=subs.add_parser(name)
        p.add_argument('--manifest',type=Path,default=ROOT/'data/trials.jsonl')
        p.add_argument('--inventory',type=Path,default=ROOT/'data/inventory.json')
        p.add_argument('--out',type=Path)
        if name=='audit': p.add_argument('--official-repo',required=True,type=Path)
        if name=='evaluate':
            p.add_argument('--model',required=True,type=Path)
            p.add_argument('--split',choices=['validation','test'],default='test')
    p=subs.add_parser('predict')
    p.add_argument('--input',required=True,type=Path)
    p.add_argument('--model',type=Path)
    p.add_argument('--inventory',type=Path,default=ROOT/'data/inventory.json')
    p.add_argument('--room',default='418'); p.add_argument('--out',type=Path)
    p=subs.add_parser('demo'); p.add_argument('--out',required=True,type=Path)
    p=subs.add_parser('serve'); p.add_argument('--port',type=int,default=8765)
    p.add_argument('--official-repo',type=Path); p.add_argument('--model',type=Path)
    p.add_argument('--manifest',type=Path); p.add_argument('--inventory',type=Path)
    args=parser.parse_args(argv)
    try:
        if args.command=='serve':
            from wifipresence.presence_server import serve
            serve(ROOT,args.port,args.official_repo,args.model,args.manifest,args.inventory); return 0
        if args.command=='demo':
            from wifipresence.presence_demo import run_presence_demo
            result=run_presence_demo(args.out)
        elif args.command=='audit':
            from wifipresence.experiments import read_manifest
            from wifipresence.presence_live import load_upstream
            load_upstream(args.official_repo)
            from tools.lib.dataset_quality.capture import validate_capture_file
            files=[]
            for r in read_manifest(args.manifest):
                checks=validate_capture_file(Path(r['_path']))
                files.append({'file':r['file'],'scenario':r['scenario'],'sha256':r['_sha256'],
                              'official_admission_passed':not any(x.status=='FAIL' for x in checks),
                              'official_failures':[x.name for x in checks if x.status=='FAIL'],
                              'quality_checks':[vars(x) for x in checks]})
            result={'files':files,'source':'canonical pinned validator; raw data unchanged'}
        elif args.command=='status': result=readiness(args.manifest,args.inventory)
        elif args.command=='train':
            if args.out is None: raise DataError('Training requires a new --out model path.')
            result=train(args.manifest,args.inventory)
        elif args.command=='evaluate':
            result=evaluate(args.manifest,args.inventory,json.loads(args.model.read_text(encoding='utf-8-sig')),args.split)
        else:
            model=json.loads(args.model.read_text(encoding='utf-8-sig')) if args.model else None
            result=predict_file(args.input,args.inventory,model,args.room)
        if getattr(args,'out',None) and args.command!='demo': save_json(args.out,result)
        visible={k:v for k,v in result.items() if k!='windows'} if args.command=='predict' else result
        print(json.dumps(visible,ensure_ascii=False,indent=2,allow_nan=False));return 0
    except (DataError,OSError,ValueError,KeyError,TypeError) as exc:
        print('ERROR: '+str(exc),file=sys.stderr);return 2

if __name__=='__main__': raise SystemExit(main())
