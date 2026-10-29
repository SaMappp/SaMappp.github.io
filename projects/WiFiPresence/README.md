# WiFiPresence

Reproducible CSI pilot experiments for motion sensing under controlled interference, with exploratory stationary-presence observations.

**2026-10-22 progress submission. This is not a validated interference-resistant presence detector.** Six real approximately 60-second scene recordings are included. Four pass official post-capture admission, and S1/S4 fail. No real-data calibrated baseline/candidate performance is claimed. IDLE means no detected motion, not an empty room.

Team: Pan Yiran, Wang Junyang, and Xie Hengyuan. Individual contributions/understanding review remain to be confirmed; a separate member's independent capture reproduction and restored ordinary sensing were confirmed by the requester.


## 2026-10-29: local presence research workbench

The new [presence pipeline](docs/PRESENCE-MODEL.md) adds a small supervised classifier, whole-file quality/truth/batch gates, file input, and a loopback operation page with bounded live raw input. It does not train a language model. Current real training is blocked: admitted EMPTY controls are zero and the original pilots remain excluded. Without a qualified real model, every presence decision is UNKNOWN; no motion-to-absence shortcut is used.

```text
python presence.py status
python presence.py predict --input data/raw/motion/motion_c6_64sc_dev027121349b989e30_20261022_181402_750086_0001.npz
python presence.py serve --port 8765 --official-repo PATH_TO_PINNED_ESPECTRE
```

Open http://127.0.0.1:8765. Live networking is explicitly separate from the original offline wp.py. Current implementation/real connection limits and checks: [October 29 verification](reports/PRESENCE-2026-10-29.md). No new labeled study data, accepted real model, or measured presence accuracy is supplied.

## Start here

- [Initial real results](reports/INITIAL-RESULTS.md) and [data inventory](data/inventory.json).
- [Course-requirement check](docs/COURSE-CHECKLIST.md) and [requirement traceability](docs/TRACEABILITY.md).
- [Proposal](docs/Proposal-WiFiPresence.md), [MVP PRD](docs/PRD-WiFiPresence-MVP.md), and [technical design](docs/TechDesign-WiFiPresence-MVP.md).
- [Field protocol](docs/EXPERIMENT-PROTOCOL.md), [data rules](data/README.md), and [capture setup](capture/README.md).
- [AI decisions and bugs](evidence/AI-DECISIONS.md), [verification](reports/VERIFICATION.md), and [sources](docs/SOURCES.md).

## Run offline

From this directory, using Python 3.10+ (checked on Python 3.12.14):

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe scripts/verify_dataset.py
.\.venv\Scripts\python.exe wp.py inspect --input data/raw/motion/motion_c6_64sc_dev027121349b989e30_20261022_181402_750086_0001.npz
.\.venv\Scripts\python.exe wp.py demo --out .test-work/synthetic-demo
```

On other platforms use `.venv/bin/python`. Capture launchers are Windows-oriented. The synthetic demo generates software fixtures in a separate ignored directory; its numbers are not real sensing performance. Repeated output directories must be empty or new. The included pilot manifest has `split=exclude` throughout: do not train on failed S1 or use the diagnostic files as room-truth data.

## Real pilot quality

| Scene | Operator-selected condition | Packets | Official temporal occupancy | Admission |
|---|---|---:|---:|---|
| S1 | Empty / fans off | 6000 | 69.46% | **FAIL** |
| S2 | Walking / fans off | 5999 | 98.76% | PASS, warnings retained |
| S3 | Stationary / fans off | 6001 | 99.76% | PASS, warnings retained |
| S4 | Empty / four fans on | 6001 | 65.08% | **FAIL** |
| S5 | Walking / four fans on | 6001 | 73.43% | PASS, warnings retained |
| S6 | Stationary / four fans on | 6001 | 71.67% | PASS, warnings retained |

All six have the upstream low-amplitude warning. S5/S6 also have temporal-occupancy warnings. Measured sampling coverage is not detection accuracy. File hashes and timestamps have been checked; scene truth and layout are operator-reported.

## Scope and next steps

Current hardware: one router and one ESP32-C6 in two corners of room 418. Four ceiling-mounted fans are at the corners; all four run at maximum speed without oscillation in S4-S6. One person walks without a fixed path or sits at the midpoint between AP and receiver. Fan-on trials were calibrated with fans already on. This protocol is a pilot and cannot establish fixed-calibration interference rejection.

Next: stabilize sampling, recollect eligible S1/S4, record complete geometry/equipment, define independent development/validation/test trials, freeze a real S1-based model, compare methods fairly, and retain negative outcomes. Earlier browser screenshots are unrelated qualitative observations, without saved numerical data. Multi-link fusion, cross-room/device generalization, router execution, and reliable stationary presence remain future work.

## Provenance and public scope

ESPectre supplies firmware, network transport, official collection, and official quality checks. This project adds local capture supervision, a simple offline reference/candidate workflow, labels, audit records, and reports. See [third-party notices](THIRD_PARTY_NOTICES.md). Raw NPZ files are unchanged, including device IDs and private-LAN endpoint metadata. Session logs are identified redacted copies. Full student IDs, course PDFs, private email, caches, credentials, and dependency environments are not included. Local original course submissions remain separate.

This folder is added to an existing personal-site repository. Existing site files are outside this project's scope.
