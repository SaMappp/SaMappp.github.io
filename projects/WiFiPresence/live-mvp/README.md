# WiFiPresence live MVP

Local software for streaming CSI from an ESP32-C6 running the pinned ESPectre 3.0.0 source, displaying experimental PRESENT / EMPTY / UNKNOWN, and replaying private local recordings. The model is known to produce serious empty-room false alarms. This is a research tool, not a reliable occupancy controller.

**GitHub Pages cannot run the Python backend.** The public project page is an introduction. Start this application on the computer connected to the ESP32 network.

## Reuse the existing local environment

On the project owner's existing computer the working demo, data and environment remain in their original local folders; they do not need to be installed again. For a checkout of this public folder, use `run.ps1` to identify those existing resources:

```powershell
.\run.ps1 -DataDir 'PATH_TO_PRIVATE_DEMO_DATA' -EspectreRepo 'PATH_TO_EXISTING_ESPECTRE' -Python 'PATH_TO_EXISTING_PYTHON'
```

You can also set `WIFIPRESENCE_DATA_DIR`, `WIFIPRESENCE_ESPECTRE_REPO`, and `WIFIPRESENCE_PYTHON` before double-clicking `run.cmd`. The launcher reuses an existing matching local service, and does not stop other services. If a service is already running, restart it yourself before changing its data/model configuration. The default port is 18768.

The data directory is private. Its expected files are described in [data/README.md](data/README.md). **No new raw recordings, model parameters, trial inventories, device metadata or private logs are included in this publication**, as requested by the owner. Without a local model, CSI transport can still run but the decision remains UNKNOWN. File replay requires local recordings.

For a genuinely new machine, Python with NumPy and the separate pinned ESPectre environment are prerequisites. The dependency constraint is in `requirements.txt`; a fresh installation on another machine has not been verified. There is no bundled environment or automatic download of private inputs.

## Demonstrate

1. Open the printed local URL. Connect the computer and ESP32 to the same reachable LAN and close other raw CSI sessions.
2. Enter the device's current IP, the actual room label, and a duration of 3–600 seconds. Click start. The page continuously displays connection state, packet count, CSI amplitude and experimental occupancy output.
3. Click stop, then inspect raw-session closure and restoration to the mode observed before the session. A restoration readback is distinct from verifying ordinary motion detection.
4. If the device is offline, use the file-replay link with the existing private dataset. Labels and predictions are separate. CSV and JSON export are available for local recordings.

Missing, stale, out-of-profile or low-quality input and uncertain scores yield UNKNOWN. Stopping clears a previous occupancy decision. The adapter refuses to take over another raw stream, avoids redundant external-mode writes, and attempts cleanup even after errors. Streaming keeps only a rolling buffer and does not save new labeled experiments. Online window quality is not official whole-file admission.

## Actual checks and limits

The original local version passed 13 checks with its private recorded dataset, plus browser checks of simulated start/stop, UI recovery on service loss, invalid input, and file replay. On 2026-11-05 the last known ESP32 address did not respond, so real hardware streaming, stopping and restoration were not reverified in that session. Simulations establish software behavior, not measured recognition performance.

This public code uses an explicit artificial model fixture for transport tests. Tests requiring the private dataset are skipped until it is configured; no private model is embedded as a test fixture.

```powershell
python -X utf8 -m unittest -v test_app test_live
```

Existing real-data evaluation found substantial false alarms, including one empty/fan-on recording with 237 of 237 overlapping windows labeled PRESENT. The windows are correlated; no general accuracy claim is made. Two incident-affected S6 records and failed-quality captures were excluded in the local study and remain in the private archive. Prior test data have been inspected; subsequent tuning requires fresh unseen data for a new final evaluation.

See [MVP-PRD.md](MVP-PRD.md), [TECHNICAL-DESIGN.md](TECHNICAL-DESIGN.md), [DECISION-RECORD.md](DECISION-RECORD.md), [使用说明.md](使用说明.md), and [给老师演示怎么讲.md](给老师演示怎么讲.md). These document the implementation and limitations; instructor acceptance and individual team understanding have not been verified.
