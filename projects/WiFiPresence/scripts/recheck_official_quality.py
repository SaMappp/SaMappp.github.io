"""Recompute official admission with a separately installed pinned ESPectre checkout."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
def main():
    p=argparse.ArgumentParser()
    p.add_argument('--repo',required=True,type=Path)
    args=p.parse_args()
    commit=subprocess.check_output(['git','-C',str(args.repo),'rev-parse','HEAD'],text=True).strip()
    if commit!='12fce9354d3506290e70a853a4f22866f0e987ef':
        raise ValueError('Official source revision does not match the recorded audit.')
    sys.path.insert(0,str(args.repo.resolve()))
    from tools.lib.dataset_quality.capture import validate_capture_file
    records=json.loads((ROOT/'data/inventory.json').read_text(encoding='utf-8'))['files']
    mismatches=[]
    for r in records:
        results=validate_capture_file(ROOT/r['file'])
        actual=[x.name for x in results if x.status=='FAIL']
        if actual!=r['official_failures']: mismatches.append(r['file'])
        print(r['scenario'], 'FAIL='+','.join(actual), 'WARN='+','.join(x.name for x in results if x.status=='WARN'))
    if mismatches:
        raise ValueError('Admission results differ: '+str(mismatches))
    print('Recorded failure/pass classifications reproduced; failure records remain failures.')
    return 0

if __name__=='__main__':
    raise SystemExit(main())
