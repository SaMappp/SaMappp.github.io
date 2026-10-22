# AI decisions and bug record

These are documented development decisions and requester confirmations, not proof that every named team member has independently reviewed them.

| Suggestion/claim | Response | Reason/check |
|---|---|---|
| Treat motion IDLE as room absence | Rejected | Motion and occupancy differ; static presence remains exploratory |
| Publish synthetic demo as measured results | Rejected | Domain separation tests and explicit synthetic labels |
| Add accounts/cloud/LLM | Deferred | Not needed for the experiment-to-report task |
| Randomly split overlapping windows | Rejected | Whole-trial manifest/hash and calibration-overlap checks |
| Saved file means qualified trial | Rejected | Canonical admission retained S1/S4 as failures |
| Fan-on IDLE proves interference rejection | Rejected | Separate automatic calibration and threshold changes confound this inference |

## Important capture bugs

Initial symptom: calibration never completed; 60-second duration did not start. Investigation measured Windows 10 ms waits around 15.61 ms, about 63 pps and roughly 49% timing occupancy. Local per-process 1 ms timer request plus balanced cleanup improved rate; a separate 60-second diagnostic saved/reopened 6001 records. It still had coverage/amplitude warnings. Added bounded preparation/recording supervision and throttled console display with complete logs. Nine mock-process/timer regressions pass. Official firmware/calibration/quality code was not changed. Wireless stability is not fully solved: current S1/S4 fail.

Another failure: S2 stayed in STABILIZING with motion above the ready threshold, then device HTTP send failed (one backpressure event, 128 dropped records). No recording was saved. Stay still until RECORDING; network/receiver-side root cause of the send failure is not established.

Offline corrections already checked: exclusive model/CSV creation prevents overwrite; out-of-range/unobservable events are distinguished from ordinary misses; right-open onset boundaries prevent artificial zero latency; explicit packet rate cannot overwrite conflicting stored metadata. Twenty-six original software tests pass. No corresponding real sensing benefit is implied.

## Public-copy portability check

Relocating the capture tests initially exposed an assumption that the official dependency working directory already existed. Five mock-process tests failed with an invalid working directory. The test fixtures now supply their own temporary working directory and active interpreter; production calibration/quality behavior was unchanged. All 35 tests then passed from the public project folder.
