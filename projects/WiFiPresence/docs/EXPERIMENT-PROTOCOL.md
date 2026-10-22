# Actual pilot protocol and next-study rules

## Recorded facts

2026-10-22: six saved scene files from one ESP32-C6, Native 3.0.0, HT20, channel 11, target 100 pps, requested 60 seconds. Room 418; router and one receiver in two corners. Four ceiling-mounted fans occupy the four corners; all four run at maximum without oscillation in S4-S6. Positions/settings did not change except fan on/off, according to the operator. Exact coordinates, mounting heights, equipment models, and door/window settings were not recorded.

Walking conditions have one person walking randomly without a defined route. Stationary conditions have one seated person at the midpoint between router and receiver. During empty conditions the operator was in the adjacent room; no-effect of adjacent activity is an unverified assumption. Scene truth is independently chosen by the operator, not inferred from MOTION/IDLE.

Fans were already running during S4-S6 startup calibration. Ordinary sensing restoration and another member's independent reproduction were confirmed by the requester; the precise original source, reproducing member, commands/date, and corresponding new file were not provided. This confirmation does not add a numbered independent trial to the inventoried dataset.

## Proposed next protocol

Preserve failed attempts, measure layout, record fan settings and neighboring activity, and define consistent walking/seated behavior. Keep stable periods separate from entry, exit, and fan switching. Do not activate motion before the collection readiness gate finishes. Current files are pilot-only/excluded from formal fitting/testing.

Use only accepted development S1 for offline model calibration; tune using development/validation, then freeze code/configuration/model hashes before independent testing. Apply the same quality rules to baseline/candidate. Do not independently tune thresholds on each test condition. If adaptive background calibration is studied, label it as a separate experimental factor.

The original design proposes five independent 60-second trials per condition: two development, one validation, two test. It is a team proposal, not a mandatory course number. Changes require a dated explanation. Whole original recordings, not overlapping windows, are the split unit. For latency acquire additional transition trials with actual event times and uncertainty; no timestamps should be invented from a planned schedule.
