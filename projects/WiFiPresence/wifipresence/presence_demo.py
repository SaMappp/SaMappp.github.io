"""Synthetic presence training walkthrough; never a classroom accuracy claim."""
import json
from pathlib import Path
import numpy as np
from .core import DataError, save_json
from .presence_model import SCENES, evaluate, file_digest, train

def make_fixture_dataset(out,seconds=6):
    out=Path(out)
    if out.exists() and any(out.iterdir()): raise DataError('Synthetic directory must be new/empty.')
    out.mkdir(parents=True,exist_ok=True)
    rng=np.random.default_rng(20261029); records=[]; receipts=[]
    for split in ('development','validation','test'):
        for scene in SCENES:
            n=int(seconds*100)+1; empty=scene in ('S1','S4'); fan=scene in ('S4','S5','S6')
            a=np.clip(np.rint((5 if empty else 23)+2*fan+rng.normal(0,.9 if empty else 1.6,(n,64))),1,100).astype(np.int8)
            raw=np.zeros((n,128),np.int8); raw[:,1::2]=a
            path=out/(split+'-'+scene+'.npz')
            np.savez_compressed(path,csi_data=raw,device_ticks_us=np.arange(n,dtype=np.uint64)*10000,
                                requested_pps=100.,num_subcarriers=64,synthetic=True,
                                label='empty' if empty else 'present',device_id=123,firmware_version='SYNTHETIC',duration_ms=seconds*1000)
            records.append({'trial_id':split+'-'+scene,'file':path.name,'scenario':scene,'split':split,
                            'room':'SYNTHETIC_ROOM','device':'SYNTHETIC','truth_confirmed':True,
                            'collection_batch':'SYNTHETIC_BATCH_'+split,'origin_id':split+'-'+scene})
            receipts.append({'file':path.name,'sha256':file_digest(path),'official_admission_passed':True,
                             'official_failures':[],'synthetic_fixture_only':True,
                             'quality_checks':[{'name':'file_load','status':'PASS'},{'name':'temporal_occupancy','status':'PASS'}]})
    (out/'trials.jsonl').write_text('\n'.join(json.dumps(r) for r in records)+'\n',encoding='utf-8')
    save_json(out/'inventory.json',{'source':'SYNTHETIC_FIXTURE_RECEIPTS_NOT_REAL_OFFICIAL_ADMISSION','files':receipts})
    return out/'trials.jsonl',out/'inventory.json'

def run_presence_demo(out):
    out=Path(out); manifest,inventory=make_fixture_dataset(out)
    model=train(manifest,inventory);save_json(out/'synthetic-model.json',model)
    report=evaluate(manifest,inventory,model);save_json(out/'synthetic-test-report.json',report)
    return {'status':'SYNTHETIC SOFTWARE TRAINING ONLY - NO CLASSROOM PERFORMANCE CLAIM',
            'model':str(out/'synthetic-model.json'),'report':str(out/'synthetic-test-report.json'),
            'real_training_performed':False,'trial_count':len(report['trials'])}
