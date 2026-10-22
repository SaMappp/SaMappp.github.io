# Initial real experiment results, 2026-10-22

These are **acquisition/quality findings**, not validated sensing performance. There is one saved approximately 60-second recording per condition, 36,003 packets in total. Four of six pass official admission; S1 and S4 fail. All raw files can be reopened, have increasing device time, and show no observable sequence gaps or all-zero rows.

| Scene | Condition | Packets | Official temporal occupancy | Admission |
|---|---|---:|---:|---|
| S1 | Empty / fans off | 6000 | 69.46% | **FAIL** |
| S2 | Walking / fans off | 5999 | 98.76% | PASS, warnings retained |
| S3 | Stationary / fans off | 6001 | 99.76% | PASS, warnings retained |
| S4 | Empty / four fans on | 6001 | 65.08% | **FAIL** |
| S5 | Walking / four fans on | 6001 | 73.43% | PASS, warnings retained |
| S6 | Stationary / four fans on | 6001 | 71.67% | PASS, warnings retained |

The official threshold is FAIL below 70%, WARN below 85%, otherwise PASS for temporal occupancy. Every trial also has a low-amplitude warning. Overall packet count near 100 pps does not guarantee even timing. The quality fraction is not accuracy or human occupancy. Preserve S1/S4 as failures and recollect controls after diagnosing timing. Do not lower gates to obtain success.

The original offline prototype has a separate per-window quality rule. It can accept windows from a file that fails upstream full-file admission: S1 has 236/236 valid project windows despite 69.46% official coverage. Therefore all pilots stay excluded from formal fitting/testing in the supplied manifest. S5/S6 respectively have about 30.5%/17.8% invalid project windows; future comparisons must report UNKNOWN and valid coverage.

## Claims not yet supported

No real-data model has been fitted/frozen, and no real baseline/candidate evaluation is supplied. Empty-room false-positive fractions, walking detection fractions, stationary-person accuracy, and interference improvement are not established. No independent onset labels exist, so real response latency is N/A. Processing/resource cost has not been measured for an accepted live deployment.

## Field interpretation

One person walks randomly or sits between the AP and one C6 receiver. Four ceiling fans are already on during fan-condition calibration, so live thresholds adapt separately. An IDLE fan-on screen is not proof of fixed-model interference rejection. Operator absence from the target room does not rule out adjacent-room influence. Exact layout dimensions, equipment models, door/window state, and reproduction details remain incomplete.

Eight earlier browser screenshots have no saved raw CSI and are unrelated to these six files. They provide qualitative observations only. Some adjacent-room historical peaks crossed the displayed threshold; causation and rates cannot be inferred from the screenshot. The firmware-side ESP_ERR_HTTP_CONNECT badge belongs to OTA update status and by itself does not establish a sensing-stream failure.

## Next experiment

Stabilize timing first, collect usable development S1 and empty/fan S4, document fixed calibration and whole-trial splits, then acquire independent validation and frozen-parameter test trials. The proposed five recordings per condition is a team design, not an instructor-mandated count. Current pilots cannot be retroactively called independent held-out tests. Negative or no-improvement results are acceptable outcomes when reported faithfully.
