# Checks

From project root run `python -m unittest discover -s tests -v` (26 offline checks plus 9 capture supervision/timer checks; Windows-specific timer tests skip elsewhere). Run `python scripts/verify_dataset.py` for bytes/structure and pilot policy. Optional canonical recheck requires the separately installed pinned dependency. Generate demo into a fresh .test-work path. Tests and fixture metrics are not real sensing performance.
