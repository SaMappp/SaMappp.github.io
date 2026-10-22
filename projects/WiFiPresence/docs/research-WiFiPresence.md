# WiFiPresence research notes

Updated 2026-10-22. Technical research and six-scene raw pilot exist; end-user research and real algorithm efficacy remain incomplete. See SOURCES.md for original course material and upstream references.

The practical user task is student experiment configuration, labeled capture, deterministic comparison, and traceable reporting. Building energy control is a motivating future application; there is no verified customer interview or deployment-demand evidence. No personas or web summaries are presented as direct user research.

One C6 Native 3.0.0 link now produced six approximately 60-second files. Four pass admission; empty/fan-off and empty/fan-on fail timing coverage. Both empty and stationary room conditions may yield motion IDLE; occupancy is a separate question. The upstream raw protocol is numerical Q/I with device timing, while webpage traces are only visualizations.

Unverified hypotheses: fans create false detections; persistence improves false positives without excessive walking loss/latency; stationary measurements can be distinguished from empty rooms; the narrowed first-version scope is acceptable to the instructor. No hypothesis is promoted to a measured success. A fan-adapted startup threshold differs from a fixed-model interference test.

## Handoff Context

- Stage: research; app name: WiFiPresence; beginner team of three.
- Platform: local Python/NumPy, one actual C6 link, independent labels and quality.
- Evidence: six raw pilots, two diagnostic exclusions, eight separate old browser screenshots.
- Constraints: S1/S4 admission failed; no frozen real model/split; second board untested.
- AI in product: none; AI is development assistance.
- Next: stabilize timing, collect accepted controls/repeats, define splits, compare methods, and complete human review.
