# Verification record

Original offline environment: Python 3.12.14 / NumPy 2.3.5. Original acquisition: Python 3.14.7 / NumPy 2.5.3 with pinned ESPectre source. The public folder combines 26 original offline software tests and nine relocated capture-supervision/timer tests. Actual publication-check command results are recorded in public-package-check.json after execution.

Real files were reopened and checked for shape, monotonic timing, sequences, PHY contract, SHA-256, and canonical official admission. Six scene files: four admitted and two failed. Two diagnostics have unknown activity truth and remain excluded. A real S2 wp.py inspect CLI check passed. No real calibration/model/effectiveness evaluation has been executed or claimed.

Run `python -m unittest discover -s tests -v`, `python scripts/verify_dataset.py`, and a fresh synthetic demo directory. With the official environment installed, run `python scripts/recheck_official_quality.py --repo [PINNED_CHECKOUT]`; exit zero means the recorded admission classifications are reproduced, not that every file passed admission. S1/S4 must still be printed as FAIL.

No new device contact or firmware operation occurs during packaging. Original source measurements and personal-site tracked files are checked for byte preservation. Fresh dependency setup in a new user's environment is documented but not claimed tested here. Human explanation and detailed reproduction records remain pending.
