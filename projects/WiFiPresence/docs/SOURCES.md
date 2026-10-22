# Sources and evidence

## Course materials

Private team copies: Project_Documentation_Guidelines.pdf (course adaptation draft, 14 October 2026), and ESP32_C6_ESPectre_CSI_Student_Guide.pdf (stage-one setup/acceptance guide). They were read during the October 22 requirement audit. They are not redistributed here; instructor materials and private notices remain available in the team's local archive.

## Project brief

The supplied brief describes long-term human presence under mechanical, out-of-region, and wireless interference, multi-link/cross-environment evaluation, and lightweight deployment. The first-version experimental scope is narrower and has not been confirmed as fully satisfying that broader goal.

## Instructor notices

Requester supplied an earlier email naming October 18 as the proposal/PRD deadline, asking for clear scope/acceptance and preserved handoff structure, and stating course guidelines override the template. Latest requester report: put code, experimental data, and initial results in the team's own public GitHub repository and privately send the URL to the instructor. No latest cutoff was supplied. These are supplied/reported instructions, not an independently retrieved inbox record.

## Public technical references

- [Vibe Coding reference workflow](https://github.com/KhazP/vibe-coding-prompt-template/), with Part 2/Part 3 handoff and JSON structures. Reviewed October 15 and October 22, 2026; main evolves.
- [ESPectre 3.0.0 collection guide](https://github.com/francescopace/espectre/blob/3.0.0/docs/ML_DATA_COLLECTION.md), [CLI](https://github.com/francescopace/espectre/blob/3.0.0/docs/CLI.md), [API](https://github.com/francescopace/espectre/blob/3.0.0/docs/API.md), and [roadmap](https://github.com/francescopace/espectre/blob/3.0.0/docs/ROADMAP.md). Source checkout pinned in capture/upstream.json.
- [Microsoft timeBeginPeriod](https://learn.microsoft.com/en-us/windows/win32/api/timeapi/nf-timeapi-timebeginperiod), reviewed October 22, 2026; request/cleanup pairing supports the Windows timing diagnosis.

## Local measured evidence

Raw NPZ and hashes: data/inventory.json. Curated scene/session records and redacted complete console logs: evidence/capture-sessions/. Operator facts: evidence/field-observations.json. Earlier browser observations are separate and lack saved numerical data. Code tests establish software behavior, not real interference efficacy.
