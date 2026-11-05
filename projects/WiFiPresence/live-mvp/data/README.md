# Private local inputs

New recordings and trained models are intentionally not distributed in this publication.
Set `WIFIPRESENCE_DATA_DIR` to the existing private data folder, containing `trials.json`, `raw/`, `presence-model.json`, and `motion-model.json`. The local model file identifies its original training files; keep those private.

Without a local model the live page still accepts CSI, but returns UNKNOWN. File replay needs a local trial inventory. No new recording or model is downloaded automatically.
