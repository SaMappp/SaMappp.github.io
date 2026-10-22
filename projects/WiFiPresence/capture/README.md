# Windows raw capture

The original tested installation used ESPectre 3.0.0 at commit `12fce9354d3506290e70a853a4f22866f0e987ef`, Python 3.14.7, and NumPy 2.5.3. The public folder contains the same local adapters with portable relative paths; firmware and official quality/calibration thresholds are not modified. The dependency checkout is installed separately and ignored by Git.

From this directory, review then run `powershell -ExecutionPolicy Bypass -File setup_capture.ps1 -Python python`. This installs into this folder only; it does not change the machine's execution policy. Its fresh dependency-install step is provided for reproduction and is not claimed re-executed during publication. Select a suitable Python executable; base dependency requirements are owned by ESPectre.

After setup, `WiFiPresence-Capture/.venv/Scripts/python.exe WiFiPresence-Capture-Start.py --check` only checks the environment. Double-click `WiFiPresence-Start.cmd` for real collection. Enter the device's actual IP, scenario, duration, and room; example addresses are not measurements.

Before acquisition stop other CSI streams, record the original traffic source, keep the setup fixed, and maintain independent truth. A 15-second delay precedes calibration/readiness. Stay still until `STATUS: RECORDING`; the requested 60 seconds begin there. Preparation is bounded separately. Empty-room operators must be outside, but adjacent activity may still influence CSI. A fixed-duration Ctrl+C interruption can discard the unfinished capture.

Saved files are in the ignored dependency checkout's `data/`; session records are in ignored `WiFiPresence-Capture-Logs/`. Inspect official post-capture quality as well as file readability. FAIL files stay excluded from formal analysis. Short diagnostics can fail the official minimum of 5000 records. Restore the previously working traffic source afterward and check ordinary motion sensing; external mode persists. Original pilot restoration and another member's reproduction are operator-confirmed, with detailed member/output records pending.

S1/S2/S3: empty/walking/stationary with fans off. S4/S5/S6: the corresponding states with all four ceiling fans at maximum. The software does not observe these facts. In the existing pilot fans were already on during S4-S6 calibration. Do not mix this adaptive-background condition with a fixed-model interference claim.

The local runner requests a 1 ms Windows timer only during collection and balances cleanup. Tests exercise simulated preparation hangs, recording hangs, failure exits, output throttling, and cleanup. These tests do not establish wireless stability; S1/S4 timing remains unresolved. New tests use the active test interpreter, without requiring an installed dependency checkout.
