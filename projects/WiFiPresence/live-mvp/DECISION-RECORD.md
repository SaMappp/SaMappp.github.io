# Decisions and checks

**Public package:** new recordings, trained model files, trial inventories and device metadata are private and not included. Counts below describe the original local demonstration. Configure local inputs as described in README.md.

| Decision | Reason | Evidence and remaining boundary |
|---|---|---|
| Demonstrate recorded CSI locally. | It supports a complete task now without relying on current device connectivity. | 26 preserved files were replayed; no new live test was performed. |
| Keep the classifier as an explicit experimental output. | Real testing exposed serious empty-room false positives. | Batch 5 S4: 237/237 overlapping windows reported PRESENT although the recorded condition is empty. This is not 237 independent experiments. |
| Exclude two incident-affected S6 recordings. | The user reported those recordings unusable. | They remain in the original archive and are absent from the demo selection. |
| Retain UNKNOWN and official file-quality gates. | An inadequate or unverified input cannot support a meaningful output. | Hash mismatch and unknown-ID rejection, plus selected real-file outputs, were software-tested. |
| Compare motion baseline and hysteresis. | The original research goal includes a fair interference comparison. | Same windows and calibration are used; the S4 candidate did not reduce false positives. The comparison was post-hoc. |
| Keep human labels separate from model predictions. | A room condition recorded by an operator is not a model output. | The interface shows both fields separately. The team should confirm the chronological batch mapping. |

AI assistance was used to implement and inspect this demo. Team members' individual review and understanding have not been verified.
