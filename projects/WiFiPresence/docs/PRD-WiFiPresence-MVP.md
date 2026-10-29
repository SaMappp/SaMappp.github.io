# Product Requirements Document: WiFiPresence MVP

**Version:** 0.5 | **Date:** 2026-10-29 | **Status:** Public pilot progress; proposed research scope

**Team:** Pan Yiran; Wang Junyang; Xie Hengyuan

## Product Overview

**App Name:** WiFiPresence  
**Tagline:** Reproducible CSI experiments with honest comparisons  
**Launch Goal:** An experimenter can inspect a labeled recording, replay two motion methods and produce a traceable per-condition report.  
**Target Launch:** TBD. October 18 was the original proposal/PRD deadline; it is not a working-MVP or current GitHub deadline.

A reproducible CSI prototype for evaluating motion sensing under controlled interference and investigating stationary human presence.

## Who It's For

### Primary User: Student Experimenter

Three first-year students with basic Python and AI-assisted development experience operate the prototype. They need understandable procedures, explicit labels and repeatable analysis. Current evidence includes six real raw pilot recordings and earlier independent browser observations. Four recordings pass official admission; S1/S4 fail temporal occupancy. Instructors and teaching assistants are secondary reviewers. Customer interviews and field requirements remain unverified.

### Example User Story

As a student experimenter, I want to link a recording to its actual room condition and replay the same measurements through two methods so that I can assess their differences without relying on a live screenshot.

## The Problem We're Solving

CSI visualization is an acquisition observation, not a validated presence decision. Upstream motion IDLE also covers stationary human presence. The team needs a workflow that keeps sensor input, independent truth, algorithm output and scientific conclusions separate. Existing official tools provide the acquisition foundation. The project adds a limited, reviewable experimental workflow. [E2, E4, E5, E6, R2, R3]

## User Journey

1. **Preparation:** identify the board, firmware, router, layout and available room. Missing information remains explicit.
2. **Capture:** use the pinned official collector and record one stable condition. Save raw NPZ and a trial entry. A failed capture produces an error record rather than fabricated data.
3. **Inspect:** check layout, timestamps, packet rate and quality. Correct the procedure if input is invalid.
4. **Calibrate:** use development empty-room, fan-off trials only. Preserve file hashes and parameter choices.
5. **Replay:** run baseline and candidate on identical input with the same quality rules.
6. **Evaluate:** freeze choices, use independent trial files, review per-condition values, UNKNOWN and any marked-event latency.
7. **Review:** export CSV/JSON/HTML, explain limitations, and obtain another member's reproduction.

## MVP Features

### Must Have for Launch

| ID and feature | User story | Observable acceptance, including failures |
|---|---|---|
| FR-01 Configuration record | As an operator, I need to identify the experiment setup. | A record includes device/link, firmware/tools, room/layout and capture settings. Unknown values remain marked. An untested second board is not listed as validated. |
| FR-02 Labeled raw capture and inspection | As an operator, I need numerical measurements tied to room truth. | A real upstream capture opens, has supported CSI and monotonic device timing, and maps to a trial entry. Empty, malformed, unsupported or mistimed input produces an explicit failure. Capture/restoration requires hardware validation. |
| FR-03 Deterministic baseline replay | As a student, I need an understandable reference method. | Same file and model yield identical rows. Valid rows yield MOTION/IDLE. Missing or inadequate input yields UNKNOWN, never an occupancy assertion. |
| FR-04 Fair candidate comparison | As an evaluator, I need a controlled comparison. | Both methods use the same trial input and quality mask. Calibration uses development S1 only. Duplicate file content and calibration/holdout overlap are rejected. Synthetic and real domains cannot be mixed. |
| FR-05 Results and limits | As a reviewer, I need traceable evidence. | Report includes scene/trial counts, detection or false-positive fractions, UNKNOWN, configuration and hashes. No event marker means no onset latency. Out-of-range events fail; unobservable events are distinct from measured misses. Stationary results and synthetic output remain explicitly labeled. |

Each requirement is P0 for the complete research MVP. An offline implementation or a documentation check alone does not close hardware acceptance. See [requirements traceability](TRACEABILITY.md).

### Nice to Have (If Time Allows)

Two independently working receivers, additional interference conditions, a live PC display and a second-room evaluation can follow the single-link workflow. Each needs its own acceptance evidence.

## Out of Scope (Not in MVP)

- Guaranteed stationary human presence or breathing detection: the existing motion output does not establish this capability; independent feasibility evidence is required.
- Arbitrary-room/device generalization, multi-AP fusion and all interference categories: these require independently working links, time alignment and a larger cross-condition corpus beyond this pilot.
- Execution on a commercial router or autonomous lighting/air-conditioning control: firmware compatibility, resource limits and safe downstream control have not been evaluated; PC-side method validation comes first.
- User accounts, cloud database, public hosting, payments and product LLM integration: none is needed for the local experiment-to-report task; each would add unrelated dependencies and maintenance.
- Reproduction of upstream Lightweight or High Accuracy internals: the PC baseline is a separate transparent reference; faithful reproduction needs its own implementation and equivalence validation.

These exclusions limit the first implementation. The broader project brief still governs the long-term research direction. Instructor approval of this narrower first version is pending.

## How We'll Know It's Working

### Engineering Acceptance

One member must reproduce the complete real-data task using another member's instructions. All P0 requirements need evidence, with error handling verified for missing files, bad layout, reversed/missing timing and input gaps. A successful synthetic run establishes software behavior only.

### Research Protocol and Proposed Metrics

Use S1 empty/fan-off, S2 walking/fan-off, S3 stationary/fan-off, S4 empty/fan-on, S5 walking/fan-on and S6 stationary/fan-on. Proposed pilot corpus: five independent 60-second effective trials per condition. These quantities are team defaults, not course mandates. Assign two development, one validation and two test trials per condition before viewing method results. Test preferably occurs in an independent collection batch after parameter freeze.

| Measure | Definition or proposed target |
|---|---|
| Walking detection | MOTION / valid walking windows, report S2 and S5 separately |
| Empty-room false positives | MOTION / valid empty-room windows, report S1 and S4 separately |
| UNKNOWN | Invalid windows / all evaluation windows, for each condition |
| Candidate rate gate | Lower S4 false-positive fraction and no more than 5 percentage-point walking loss in each of S2 and S5; review latency and coverage |
| Latency | With independently recorded onset, first valid detection time minus actual onset; also report misses and timing uncertainty |
| Stationary observations | Separate exploratory motion fractions and signal summaries, not occupancy accuracy |

If the baseline already has zero S4 false positives, report no observed room for reduction. If the candidate fails, retain the result. Overlapping windows are correlated; do not treat them as independent trials. A rate-gate pass alone is not proof of general interference rejection. Growth and revenue metrics are Not applicable to this research MVP.

## Look & Feel

Plain, readable local outputs: terminal inspection, prediction CSV and an HTML report. The HTML report shows a clear synthetic/real-evaluation status, per-scene tables and links to detailed outputs. A local file workflow is sufficient. No custom website is required.

## Technical Considerations

- **Platform:** local Windows-first workflow. Offline Python tools have been checked with Python 3.12 and NumPy 2.3.5. Upstream collection uses its own documented environment.
- **Data:** preserve raw NPZ. Store independent room/activity/interference truth and split in a JSONL manifest. Supported offline profile is canonical int8 64-subcarrier HT20 with real monotonic timestamps. Other profiles fail clearly.
- **Initial timing:** 1-second windows, 0.25-second step. Initial quality gate uses occupied nominal packet slots and a maximum gap. Freeze rules before testing.
- **Compatibility:** one C6 Native 3.0.0 link, with six real NPZ files actually imported. A second board, other hardware profiles, and cross-room transfer remain unverified.
- **Performance:** record processing time and machine environment on actual captures. No real-time throughput, latency or embedded-memory guarantee is claimed yet.
- **Privacy:** share only reviewed experimental material. The public raw files retain original device/private-LAN metadata for provenance; full student IDs, private email, and course PDFs stay outside this public folder. Do not publish credentials; follow classroom access and participant arrangements.
- **Failure behavior:** return a clear error for invalid files/configuration and existing model/CSV output paths, preserving original files. Use UNKNOWN for inadequate windows. Reports never invent a 100 pps time axis.

## AI / Automation Scope

**Product AI:** The original motion MVP uses explicit statistical rules. The October 29 research extension adds an experimental supervised numerical classifier, with real fitting currently blocked by data readiness. No LLM feature or cloud model is included. AI also assists document preparation and development; team members review facts, choices, code and checks. Cloud model accounts and model-serving cost are Not applicable.

## Quality Standards

Preserve raw files, record calibration provenance, keep software fixtures separate from real captures and expose failures. Each major bug needs an error record and a check of the original failure. No fabricated interviews, research numbers or measured performance. Member identities are filled from the requester. Individual review and understanding remain pending; see [team review](../evidence/TEAM-REVIEW.md).

## Budget & Constraints

Three beginners, two ESP32 boards, one router, two adjacent classrooms, and four ceiling-mounted fans. One board has real raw-file evidence; the second is untested. This version assumes no incremental hardware or hosting purchase. Existing equipment and AI subscriptions have unquantified costs. The pilot dataset exists; independent repeats, usable S1/S4 controls, user validation, and instructor scope feedback remain outstanding.

## Open Questions & Assumptions

| Item | Owner and next action |
|---|---|
| Course details and exact cutoff | A (Pan Yiran): check the latest instructor notice; exact cutoff remains unconfirmed |
| Exact board/router models and layout dimensions | B: record markings and geometry; raw pilot files and collector environment are now verified |
| Stationary separability and fan effects | C: collect independent truth and report actual outcomes |
| First-version scope and real user evidence | A: seek instructor feedback after this submission, record any change |
| Working MVP date | Team: schedule M1–M5 after coordination |

## Launch Strategy (Brief)

Internal trial by the three members, followed by instructor review and one cross-member reproduction. Commercial release, signups and public deployment are Not applicable.

## Definition of Done for MVP

- All FR-01–05 have actual evidence, including real capture and cross-member reproduction.
- One complete experiment-to-report task works on the agreed hardware/profile.
- Input errors and UNKNOWN behavior work.
- Independent results expose all scene conditions, limitations and failures.
- Technical design and requirement statuses match the implementation.
- Team members can explain the core workflow and their contributions.

**Current status:** real pilot capture/readback verified, four official admission passes and two failures; offline software behavior checked. Real calibrated algorithm evaluation, independent repeats, and full member understanding review remain incomplete. This is a progress submission, not full MVP acceptance.

## Next Steps

Confirm responsibilities and understanding; stabilize timing and recollect S1/S4; define an independent split and calibration rule; perform real comparisons and update the design. The requester authorized this public progress package. Record any scope change rather than silently rewriting the original plan.


## References and evidence

- **E1:** [Course documentation guidelines](SOURCES.md#course-materials), supplied course adaptation draft. Course requirements take precedence over the upstream template.
- **E2:** [Stage-one student guide](SOURCES.md#course-materials), supplied setup and first-stage acceptance guide.
- **E3:** [Project brief](SOURCES.md#project-brief), long-term research direction.
- **E4:** [CSI screenshot](../evidence/screenshots/stage1-csi.png), visible measurement stream, not a saved numerical recording.
- **E5:** [Motion screenshot](../evidence/screenshots/stage1-motion.png), observed device and detector settings, not accuracy.
- **E6:** [Settings screenshot](../evidence/screenshots/stage1-settings.png), network configuration snapshot.
- **E7:** [Instructor notice summary](SOURCES.md#instructor-notices), proposal/PRD deadline and document instructions.
- **E8:** [Team context](../evidence/TEAM-REVIEW.md), user-reported resources and supplied member identities.

These IDs match the [evidence register](../evidence/EVIDENCE-REGISTER.md).
- **R1:** [Vibe Coding Part 2](https://github.com/KhazP/vibe-coding-prompt-template/blob/main/part2-prd-mvp.md), reviewed 2026-10-15, file SHA 0b3a289aad206d47e567a92a20c0d87a965b87b0.
- **R2:** [ESPectre 3.0.0 collection guide](https://github.com/francescopace/espectre/blob/3.0.0/docs/ML_DATA_COLLECTION.md), reviewed 2026-10-15. The upstream v3 motion model maps empty and static_presence to IDLE.
- **R3:** [ESPectre 3.0.0 API](https://github.com/francescopace/espectre/blob/3.0.0/docs/API.md) and [CLI](https://github.com/francescopace/espectre/blob/3.0.0/docs/CLI.md), reviewed 2026-10-15. Raw collection pauses derived motion events and leaves the device in external traffic mode.
- **R4:** [ESPectre 3.0.0 roadmap](https://github.com/francescopace/espectre/blob/3.0.0/docs/ROADMAP.md), reviewed 2026-10-15. Stationary presence is a research direction, not an established capability of this prototype.


---
Document created: 2026-10-15; public progress revision: 2026-10-22. Full MVP and human review remain incomplete.

## Presence research extension, 2026-10-29

The user authorized a small local supervised classifier and file/live workbench. See [presence design and commands](PRESENCE-MODEL.md). This is an experimental extension: the validated-stationary-presence exclusion and missing real-effectiveness evidence remain. No LLM integration or cloud model is added. A separate presence.py live command can contact hardware when explicitly started; the original wp.py remains offline. Real training is currently blocked by failed empty controls and missing independent study splits; synthetic model checks cannot enable real predictions.

## Handoff Context

The current public manifest retains all six recordings as `exclude` / `pilot_only`. S1/S4 additionally failed official full-file admission. Project window-quality checks differ from official admission and cannot override it. No real model or held-out evaluation is provided. The measured acquisition results and actual four-fan protocol are in [initial results](../reports/INITIAL-RESULTS.md) and [field protocol](EXPERIMENT-PROTOCOL.md).

- Stage: prd
- App name: WiFiPresence
- User level: A (beginner team using AI development assistance)
- Target platform: local Python/NumPy analysis with ESPectre 3.0.0 raw acquisition
- Budget: no incremental purchase planned; existing costs unquantified
- Timeline: proposal and PRD due 2026-10-18; working MVP date TBD
- AI in product scope: experimental numerical CSI classifier in the research extension; no LLM or cloud model
- Research status: partial technical research; no validated end-user demand or real-capture evaluation
- Constraints: three students, one real C6 link, second board untested; room 418; four ceiling fans; only one pilot per condition
- Team: Pan Yiran; Wang Junyang; Xie Hengyuan
- Decisions: single-link first, preserve labels and provenance, stationary presence exploratory, synthetic evidence kept separate
- Open questions: individual review, S1/S4 quality, repeats/splits, exact equipment/layout, instructor scope feedback and MVP date
- Source files: research-WiFiPresence.md; supplied course materials; evidence/EVIDENCE-REGISTER.md
- Output file: docs/PRD-WiFiPresence-MVP.md


```json
{
  "schemaVersion": 1,
  "documentType": "prd",
  "appName": "WiFiPresence",
  "oneLiner": "A reproducible CSI prototype for evaluating motion sensing under controlled interference and investigating stationary human presence.",
  "targetUsers": "Student experimenters and instructor/TA reviewers",
  "phase": "Pilot progress",
  "mustHave": [
    "FR-01: Record device, link and experiment configuration",
    "FR-02: Save and inspect independently labeled raw CSI recordings",
    "FR-03: Replay a transparent motion baseline deterministically",
    "FR-04: Compare a persistence candidate on the same independent trials",
    "FR-05: Export per-scene, per-trial results with provenance and limitations"
  ],
  "niceToHave": [
    "Second receiver after independent validation",
    "Additional interference conditions",
    "Live PC display",
    "Second-room evaluation"
  ],
  "notInMvp": [
    "Validated stationary occupancy detection",
    "Generalization to arbitrary rooms or devices",
    "Multi-AP fusion and heterogeneous-device deployment",
    "All interference categories",
    "Commercial-router execution and building automation",
    "Product LLM features",
    "User accounts, cloud database, public hosting and payments",
    "Reproduction of upstream Lightweight or High Accuracy internals"
  ],
  "successMetrics": [
    "Per-condition walking detection and empty-room false-positive fractions",
    "UNKNOWN fraction and independent-trial counts",
    "Onset latency only with independently recorded event times",
    "Exploratory gate: lower S4 false positives, walking detection loss no greater than 5 percentage points in S2 and S5; review latency"
  ],
  "evidenceStatus": {
    "asOf": "2026-10-22",
    "stage": "pilot-progress",
    "sceneFiles": 6,
    "officialAdmissionPassed": 4,
    "officialAdmissionFailed": 2,
    "formalSplit": "all current pilots excluded",
    "realAlgorithmEvaluation": "not performed",
    "teamUnderstanding": "pending"
  },
  "presenceResearchExtension": {
    "asOf": "2026-10-29",
    "model": "20-feature NumPy logistic classifier",
    "realTraining": "blocked; no admitted EMPTY controls",
    "fileAndLiveUI": "implemented; presence remains UNKNOWN without a real model",
    "LLM": "none",
    "originalRawDataAndExclusions": "unchanged"
  }
}
```
