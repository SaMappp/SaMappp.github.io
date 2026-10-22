# Pilot data

`raw/empty`, `raw/motion`, and `raw/static_presence` contain six unmodified real NPZ files, one per S1-S6. `raw/diagnostic` contains two real diagnostics with unknown activity truth, excluded from the study. `inventory.json` includes SHA-256, arrays, timing, and canonical official quality results. Filenames alone do not distinguish fan state; use the trial record.

`trials.jsonl` is a real, portable manifest. Every pilot has `split=exclude` because no independent split/model was frozen before this pilot. Additional `analysis_role=pilot_only` records why data are retained. S1/S4 also fail official admission. This does not delete data: descriptive quality inspection remains useful. Formal calibration/evaluation must fail until new eligible records are added. Do not move failed or diagnostic data into development merely to obtain a model.

`planned_schedule.csv` is the original team proposal of 30 trials, not a completed dataset or course-mandated count. Six saved pilots are not 30 independent trials. Overlapping windows are correlated and cannot be independently shuffled into train/test.

Raw files retain their original timestamps, device IDs, and local endpoint metadata; hashes are unchanged. Public session JSON/log copies omit absolute workstation paths and label this editing. Do not publish credentials. Subsequent imports require an independent scene label, field record, canonical quality result, and purpose/split.
