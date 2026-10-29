# Checks

From project root run `python -m unittest discover -s tests -v` (26 offline checks plus 9 capture supervision/timer checks; Windows-specific timer tests skip elsewhere). Run `python scripts/verify_dataset.py` for bytes/structure and pilot policy. Optional canonical recheck requires the separately installed pinned dependency. Generate demo into a fresh .test-work path. Tests and fixture metrics are not real sensing performance.

2026-10-29: presence tests cover training refusal, quality override protection, original-recording/batch separation, synthetic-real isolation, model/profile errors, UNKNOWN on stale/gapped inputs, live cleanup, and HTTP origin/upload behavior. Full suite now contains 55 tests (35 existing plus 20 presence checks); the HTTP integration test requires loopback network permission in restricted sandboxes. Use a fresh presence.py demo directory for synthetic model checks.
