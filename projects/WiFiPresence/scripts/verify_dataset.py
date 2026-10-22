"""Verify immutable pilot bytes and structure; never infer room truth or fit a model."""
from pathlib import Path
import hashlib
import json
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from wifipresence.core import load_capture
from wifipresence.experiments import read_manifest

def main():
    inventory=json.loads((ROOT/'data/inventory.json').read_text(encoding='utf-8'))['files']
    for record in inventory:
        path=ROOT/record['file']
        if hashlib.sha256(path.read_bytes()).hexdigest()!=record['sha256']:
            raise ValueError('Hash mismatch: '+record['file'])
        c=load_capture(path)
        if c.info['packets_raw']!=record['shape'][0] or c.synthetic:
            raise ValueError('Unexpected array/domain: '+record['file'])
    trials=read_manifest(ROOT/'data/trials.jsonl')
    if len(trials)!=6 or any(r['split']!='exclude' for r in trials):
        raise ValueError('Initial pilot exclusion policy has changed; review the study protocol.')
    admitted=sum(r['official_admission_passed'] for r in inventory if r['role']=='pilot_only')
    print(f'{len(inventory)} real files: hashes and structure verified; six pilot records excluded from formal fitting/testing.')
    print(f'Recorded official admission: {admitted}/6 pass, 2/6 fail. These are stored audit results, not recalculated accuracy.')
    return 0

if __name__=='__main__':
    raise SystemExit(main())
