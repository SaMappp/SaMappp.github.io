# Project Proposal: WiFiPresence

**Version:** 0.4 | **Date:** 2026-10-22 | **Status:** Public pilot progress; scope feedback and individual review pending  
**Team:** Pan Yiran; Wang Junyang; Xie Hengyuan  
**Original document deadline:** 2026-10-18 (historical). The latest public-repository request has no supplied cutoff.

## 1. Project Title and One-line Summary

**WiFiPresence: Interference-aware Wi-Fi Sensing Research Prototype**

A reproducible CSI prototype for evaluating motion sensing under controlled interference and investigating stationary human presence.

## 2. Target Users and Context

Student experimenters need a repeatable way to collect CSI, distinguish room truth from detector output, and compare sensing methods. Instructors and teaching assistants need traceable evidence to review those comparisons. Two adjacent classrooms, one controllable router and two ESP32 boards are available according to the team. One ESP32-C6 now has six real raw pilot recordings; the second board remains untested.

Lighting and air-conditioning automation motivate the broader topic in the supplied brief. No building operator or other end user has validated a deployment need. This proposal concerns a laboratory research workflow rather than a ready building-control product.

## 3. Problem Investigation and Evidence

The supplied screenshots show an ESP32-C6 running ESPectre Native 3.0.0, official motion output and CSI amplitude visualization. The settings screenshot shows 2.4 GHz, channel 11 and HT20. The earlier screenshots do not establish interference rejection or stationary-person detection. Six later raw files are now saved and readable; four pass official admission, and two fail. A movement score of 1.000 is not an accuracy measurement. [E2, E4, E5, E6]

The upstream v3 collection guide maps both empty and mostly still human presence to IDLE. Raw-data collection and ordinary on-device motion output also cannot be treated as parallel independent outputs. [R2, R3] These facts motivate explicit labels and a separate PC-side evaluation workflow.

Fan-induced errors and empty-versus-stationary separability are hypotheses requiring controlled measurements. No interviews, measured sensing accuracy, or instructor approval of the narrowed scope are claimed. The initial corpus contains one approximately 60-second trial per condition; it is a pilot, without a frozen development/validation/test split.

## 4. Existing Approaches and Specific Gap

The official ESPectre pages already support setup, motion display and raw collection. Manual observation can supply laboratory truth. Screenshots alone cannot replay a measurement or provide a fair numerical comparison. We therefore add configuration records, trial labels, deterministic replay and per-condition reporting. Our simple amplitude baseline is our own reference method, not a reproduction of the upstream Lightweight detector. We make no unsupported claims about competing sensing products.

## 5. Proposed Minimum Useful Solution

One complete task is: configure a link, record a labeled trial, inspect the saved file, replay a baseline and candidate, and export a report tied to the original trial.

The first version uses one fixed classroom and one verified link. Four ceiling-mounted fans, one in each room corner, provide one mechanical-interference condition. All four are at maximum speed and do not oscillate in S4-S6. Empty, walking and stationary conditions are collected with the fan off and on. Stationary trials remain exploratory. The first candidate adds hysteresis and persistence to a transparent motion score. It may reduce transient errors and may also increase latency or miss activity; success is not assumed.

## 6. Feasibility, Evidence Gaps and Risks

| Constraint or risk | Response and owner |
|---|---|
| Three beginners with basic Python | Small NumPy-based local workflow, shared explanations and cross-review; all members |
| S1/S4 raw quality failed | Preserve failures, investigate timing, and recollect usable empty-room controls; B |
| Second board untested | Single-link first version, separate second-board check; B |
| Stationary presence and fan rejection uncertain | Independent trials and explicit negative results; C |
| Scope and real user needs unconfirmed | Disclose evidence gap, seek instructor feedback after submission; A |
| Version and sampling differences | Pin the upstream 3.0.0 tools, record actual timing and packet quality; B |

No new hardware purchase, paid hosting or product LLM is required by this proposed first version. Costs of existing equipment and AI subscriptions are not quantified. The instructor's email sets the proposal and PRD deadline, not a working-MVP deadline. [E1, E7]

## 7. Responsibilities and Milestones

| Owner | Responsibility | Reviewable output |
|---|---|---|
| A: Pan Yiran | Proposal, sources and integration | Proposal, evidence and submission package; reproduce B's procedure |
| B: Wang Junyang | Devices and capture | Device register, capture steps, raw data or failure log; technical review |
| C: Xie Hengyuan | PRD, labels and evaluation | Acceptance cases, protocol and per-scene report; data review |

The identities above were supplied by the requester. Responsibilities are proposed and still need individual confirmation; naming an owner does not establish completed work or team approval.

The original proposal/PRD deadline was October 18; drafts and PPTX summaries were prepared locally, but actual email submission is not verified. Current milestones: M1 reproducible capture; M2 labeled and independently partitioned trials; M3 baseline and candidate replay; M4 fair evaluation; M5 complete demonstration and revised technical design. The team has not committed to calendar dates for M1–M5.

**Current implementation evidence:** the offline workflow has passed 26 synthetic software tests. This checks program behavior, not measured human-sensing performance. See [verification record](../reports/VERIFICATION.md). Real capture and readback are verified. Labels and field layout are operator-reported. Restoration and another member's independent reproduction are confirmed by the requester; the member/file record is still missing. Sensing performance and full team review remain outstanding.


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
