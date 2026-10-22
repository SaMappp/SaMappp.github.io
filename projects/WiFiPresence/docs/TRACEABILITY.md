# Requirement status, 2026-10-22

| ID | Component | Current evidence | Status/limitation |
|---|---|---|---|
| FR-01 | Field record, device context, manifest | Real file identity/timing and operator-confirmed room/fan/person conditions | Partial: exact equipment/layout, neighbor/door state, and detailed reproduction record missing |
| FR-02 | Official collector, local capture adapter, raw reader | Six real files saved/reopened; S2/S3/S5/S6 admitted; S1/S4 failed | Partial: no eligible S1/S4 controls; restoration/reproduction requester-confirmed |
| FR-03 | core.py baseline/predict | Real-file import plus synthetic determinism/quality tests | Implemented offline; real calibrated performance not evaluated |
| FR-04 | experiments.py manifest/calibrate/evaluate | Whole-file hashes, overlap/domain rejection tests; all pilots excluded | Implemented offline; independent repeats/split/freeze and fair real comparison missing |
| FR-05 | CSV/JSON/HTML output, event handling | Synthetic report pipeline; real acquisition-quality results | Partial: real detection/false-positive/latency/cost outcomes missing |

M1 capture/readback now has actual evidence. M2 has a pilot only. M3/M4 actual calibrated comparison and M5 complete research MVP remain incomplete. No requirement was silently removed. Stationary presence, multi-link, and router deployment remain outside the first version and unproven in the long-term project.
