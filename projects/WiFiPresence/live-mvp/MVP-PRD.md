# WiFiPresence: MVP product requirements

**Public package:** new recordings, trained model files, trial inventories and device metadata are private and not included. Counts below describe the original local demonstration. Configure local inputs as described in README.md.

**2026-11-05 extension:** The current user requested a live research demonstration in addition to the recorded-data MVP described below. The page now supports a bounded ESPectre CSI stream, experimental presence output, explicit UNKNOWN on stale or inadequate input, and cleanup/restoration reporting. Hardware streaming and restoration have not been verified in the current session because the previously recorded IP was unreachable. The model has known substantial false positives; this extension is not validated occupancy detection or automatic control. Recorded-file replay remains available. See `实时接入验证记录.md`.

Version 0.6, 2026-11-04. Status: working local research demonstration; narrowed scope proposed by the team and not yet confirmed by the instructor. This supplements, rather than silently replaces, the original 0.5 project PRD.

## Problem and users

Students need to relate measured Wi-Fi CSI to a recorded room condition, inspect a repeatable motion comparison and show limitations to an instructor. ESPectre provides acquisition; this project supplies a small replay and reporting workflow. The 26 bundled recordings and their quality receipts are direct project evidence, while the room conditions are operator-selected labels and batch assignment is based on capture order. No user interview or instructor approval of this narrowed scope is claimed.

## Demonstration scope

The recorded-data demonstration task is: choose a recorded trial, replay its CSI through a research classifier and two motion methods, inspect the measured curve and uncertainty, and download its window-level results. The live extension also lets the operator explicitly start and stop a bounded stream and inspect cleanup. The separate existing collector remains available for acquiring new labeled recordings.

The scope is narrower than the complete research MVP: this interface uses a bundled selection of recordings and does not accept arbitrary files or save labeled live studies. Robust stationary detection, reliable live presence decisions, room-general models, interference effectiveness, multi-device fusion and control of other equipment remain future work. This scope change is proposed for an immediate local demonstration; it is not evidence of instructor acceptance or of fulfilling all original performance goals.

## Functional requirements and acceptance

| ID | Expected behavior | Check and present status |
|---|---|---|
| FR-01 | Identify the selected condition and trial. | Screen shows scene, batch, split and operator-entered condition; JSON includes SHA-256 and quality. Implemented; precise geometry and some field details are missing. |
| FR-02 | Read a recorded CSI input and reject invalid evidence. | Each included real NPZ must match its recorded SHA-256 and a passing official receipt; missing, altered, unsupported or failed inputs produce errors. Existing separate capture entry remains outside this interface. |
| FR-03 | Replay a deterministic reference motion method. | The same file and frozen model produce the same per-window MOTION/IDLE/UNKNOWN rows. IDLE does not establish absence. |
| FR-04 | Compare the baseline with the candidate fairly. | Both use the same recording, time windows and quality mask; motion thresholds derive from development S1. Post-hoc observed S4 results did not meet the proposed reduction goal. |
| FR-05 | Display and export reviewable results. | Screen includes curve and per-method counts; CSV and JSON provide window results. UNKNOWN is retained. Event latency is unavailable without onset labels. |

The experimental presence classifier is a research extension. It must display its output separately from the recorded condition and retain UNKNOWN when the score is inconclusive or window quality is insufficient. It must not be presented as a dependable people counter. The two explicitly incident-affected S6 recordings and failed files are not selectable.

## Rules and failure cases

Only the bundled, inventoried trial IDs are accepted. A missing file, changed hash or failed/unverified official receipt stops processing with a clear error. For low-quality windows both motion outputs and the presence model use UNKNOWN, rather than substituting an earlier result. Download actions require a successful replay. Synthetic demonstrations are not used as evidence of room performance.

## Non-functional requirements and success

The interface binds to `127.0.0.1` and uses local files, with no cloud service or account. Its controls should work by mouse and keyboard and render on a small window. The included dependencies and test command are recorded in the technical design. The included data contain device metadata and require review before public release.

For demonstration readiness, the operator must be able to select an included trial, observe a truthful result and download it; an invalid selection must fail. These functions were software-tested and the page was visually checked in a browser on the existing local machine. This does not establish user-value, live hardware reliability or instructor acceptance. A measured research success would require separate evidence; current empty-room false positives are substantial and the motion interference goal is not met.

## Constraints and open questions

The original acquisition conditions come from operator records. Exact deployment geometry and some equipment details remain missing; chronological batch mapping remains to be checked. The team must review and explain the system. The instructor has not confirmed acceptance of this proposed scope. Previously seen test data cannot be reused as pristine final test evidence for a subsequently tuned model.

## Handoff Context

- Platform: local Windows-first Python/NumPy research demo.
- Input: 26 included, hash-checked real recordings or an explicitly started bounded live stream.
- Output: waveform, research presence and motion outputs, per-trial CSV/JSON.
- Failures: reject unverified files; UNKNOWN for insufficient windows.
- Measured limitation: severe empty-room false positives; motion S4 reduction not achieved.
- Next: confirm scope with instructor, review team understanding, investigate drift, and reserve new unseen data for any tuned model's final evaluation.

```json
{"schemaVersion":1,"documentType":"prd","appName":"WiFiPresence","status":"local-research-demo","scopeApproval":"unconfirmed","input":"recorded-csi-and-bounded-live","liveDetection":"experimental-hardware-unverified-this-session","localRecordingsUsed":26,"newRecordingsPublished":0,"measuredLimitations":"substantial-empty-room-false-positives"}
```
