# Requirement status, 2026-10-22

## Current code publication: 2026-11-05

The [live MVP](../live-mvp/README.md) adds explicitly started, bounded live CSI input, experimental presence output, cleanup/readback and recorded-file replay. The code, web UI and documentation are public; the owner chose not to publish new raw recordings, models, trial inventories or device metadata. Original public pilot files and their exclusions remain historical evidence. The local real-data candidate has substantial empty-room false positives. Current-session real hardware streaming and restoration were not verified because the previous address was unreachable. Public tests use artificial transport fixtures; recorded-data checks require the private local inputs. Instructor acceptance and team understanding remain unconfirmed.

The older dated content below is retained as a historical snapshot.


| ID | Component | Current evidence | Status/limitation |
|---|---|---|---|
| FR-01 | Field record, device context, manifest | Real file identity/timing and operator-confirmed room/fan/person conditions | Partial: exact equipment/layout, neighbor/door state, and detailed reproduction record missing |
| FR-02 | Official collector, local capture adapter, raw reader | Six real files saved/reopened; S2/S3/S5/S6 admitted; S1/S4 failed | Partial: no eligible S1/S4 controls; restoration/reproduction requester-confirmed |
| FR-03 | core.py baseline/predict | Real-file import plus synthetic determinism/quality tests | Implemented offline; real calibrated performance not evaluated |
| FR-04 | experiments.py manifest/calibrate/evaluate | Whole-file hashes, overlap/domain rejection tests; all pilots excluded | Implemented offline; independent repeats/split/freeze and fair real comparison missing |
| FR-05 | CSV/JSON/HTML output, event handling | Synthetic report pipeline; real acquisition-quality results | Partial: real detection/false-positive/latency/cost outcomes missing |

M1 capture/readback now has actual evidence. M2 has a pilot only. M3/M4 actual calibrated comparison and M5 complete research MVP remain incomplete. No requirement was silently removed. Stationary presence, multi-link, and router deployment remain outside the first version and unproven in the long-term project.

## 2026-10-29 presence research extension

A separate supervised-model/file/live workbench is implemented and software-checked. This is not completion of the original real evaluation requirements. Presence training additionally rejects failed/unverified official receipts and requires confirmed truth, original recording IDs, collection batches, and separate development/validation/test coverage. All current pilots remain excluded, so real fitting is blocked. Live transport has a bounded diagnostic success; its room truth was unknown and it adds no formal trial. See ../reports/PRESENCE-2026-10-29.md.
