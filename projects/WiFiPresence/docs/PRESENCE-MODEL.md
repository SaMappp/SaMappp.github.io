# Presence classifier and local operation page

2026-10-29 research extension requested by the user. This adds supervised EMPTY/PRESENT/UNKNOWN infrastructure; it does not establish reliable stationary presence or change any existing raw-file quality threshold. No language-model training or cloud API is involved.

## Current data decision

There are no new recordings beyond the six October 22 pilots, confirmed by the requester. The four admitted recordings all contain a person; both empty-room controls fail official admission. All six remain pilot_only/exclude, without independent splits. The real training command must reject this dataset and must not create a pretend model. Current real-file/live output without a qualified real model is UNKNOWN.

## Why start with a small model

This is a numerical CSI classification task. The first implementation uses 20 amplitude/variation features, training-only median/IQR scaling, and deterministic weighted L2 logistic regression in NumPy (21 fitted classifier coefficients, plus scaler statistics). Per-original-trial weights prevent a longer file from silently dominating; class weights are balanced. There is no advantage claimed for training a large language model on six dependent recordings.

The features contain neither scene labels nor fan state. S1/S4 map to EMPTY; S2/S3/S5/S6 map to PRESENT. Stationary conditions are included as a research question, not assumed detectable. An initial model-score abstention band uses 0.8/0.2; these are provisional operating points, not calibrated probabilities, validated targets, or an accuracy statement.

## Data contract and leakage checks

Each study manifest record needs the existing fields (`trial_id`, `file`, `scenario`, `split`, `room`, `device`) plus independent `truth_confirmed: true`, `origin_id` for the original recording, and `collection_batch`. Use new study recordings, not relabeled pilot fragments. Canonical official quality receipts are keyed by SHA-256; readability or valid project windows cannot override FAIL. A receipt with failing checks cannot be made valid by changing its pass Boolean.

The engineering preflight currently requires one admitted independent record for every S1-S6 condition in each of development, validation, and test. This is a minimum pipeline-coverage check, not statistical adequacy or a teacher mandate. The original five-per-scene team design remains recommended. Keep original recordings and acquisition batches separate across splits. Mixed room/device/rate/firmware profiles and synthetic/real mixing are rejected by this first implementation. Development alone fits the scaler and coefficients. Validation/test outcomes are explicitly separate, with UNKNOWN reported.

## Commands

From this folder with Python and the existing NumPy requirements:

```text
python presence.py status --out reports/local-presence/readiness.json
python presence.py train --out config/presence-candidate.json
python presence.py predict --input data/raw/motion/ACTUAL_FILE.npz --out reports/local-presence/replay.json
python presence.py serve --port 8765 --official-repo PATH_TO_PINNED_ESPECTRE
```

Open `http://127.0.0.1:8765`. Select a provided file or upload an NPZ. Uploads are temporary, size bounded, loaded without pickle, and never overwrite originals. Without a real model, the displayed presence decision is UNKNOWN even when the raw curve is visible. Raw labels are displayed separately from model output.

With NEW independently recorded study data, audit and use a new inventory/manifest:

```text
python presence.py audit --manifest data/study.jsonl --official-repo PATH_TO_PINNED_ESPECTRE --out data/study-quality.json
python presence.py status --manifest data/study.jsonl --inventory data/study-quality.json
python presence.py train --manifest data/study.jsonl --inventory data/study-quality.json --out config/presence-candidate.json
python presence.py evaluate --manifest data/study.jsonl --inventory data/study-quality.json --model config/presence-candidate.json --split validation --out reports/local-presence/validation.json
python presence.py evaluate --manifest data/study.jsonl --inventory data/study-quality.json --model config/presence-candidate.json --split test --out reports/local-presence/test.json
```

For the page to use a NEW study without editing the old pilot manifest, pass `presence.py serve --manifest data/study.jsonl --inventory data/study-quality.json` (and the existing live/model options as needed). The page selects one example per condition; all study files remain covered by preflight. Official auditing/live input require the separately installed upstream environment.

These future study commands are not claims that real training/evaluation was completed. Current pilot training is expected to fail. File inference with a real candidate requires `--model` plus matching declared `--room`; unknown file hashes remain unverified until canonically audited. The candidate is experimental and is not automatically certified for deployment by completing training.

`python presence.py demo --out .test-work/NEW_SYNTHETIC_PRESENCE_DEMO` actually trains/evaluates synthetic fixtures for software verification only. Synthetic receipts are explicitly marked fixtures; a synthetic model is blocked from interpreting real recordings. Demo accuracy does not measure a classroom or prove stationary sensing.

## Live operation and limitations

The separate live adapter imports pinned upstream DirectRawCSIReceiver/DirectClient/ExternalTrafficGenerator; it is not part of the original offline wp.py interface. The local server binds only loopback, rejects unrelated origins, and exposes no arbitrary filesystem browsing endpoint. Live targets are individual private-LAN IPv4 addresses. Streams are bounded to 3-600 seconds. The adapter preserves the original traffic mode, closes receiver/generator, waits for firmware raw-session closure, then restores mode only if needed and reads it back. Waiting avoids a mutation/CSI-close race. No firmware is changed.

Disconnected, stale (>3 seconds), unsupported, dropped/backpressured, insufficient-window, missing-model, domain-mismatched, or out-of-profile input is UNKNOWN. No cached EMPTY decision is retained after an error. Live quality is an online window check, not a full-file official-admission claim. No independent room truth is inferred or saved automatically. The old HTTP backpressure issue may still occur and must remain visible; restoring the previous mode is distinct from proving ordinary motion works in every environment.

The dashboard and small model are an experimental research extension beyond the original motion-only implementation. The old validated-stationary-presence exclusion remains until real independent evidence supports changing it. A large model, multiple links, and deployment robustness are not silently claimed implemented.

Reference: [grouped independent evaluation and training-only preprocessing](https://scikit-learn.org/stable/modules/cross_validation.html), reviewed 2026-10-29. The implementation uses NumPy, not scikit-learn.
