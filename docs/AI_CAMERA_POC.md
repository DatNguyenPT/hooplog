# AI Camera Feasibility POC

Status: plan, pending review. Nothing here is built. All targets are provisional, experimental go/no-go gates, not production promises.

## 1. Question to answer
Can a mid-range Android phone on a tripod, processing frames on-device, detect shot attempts and label them Made/Missed reliably enough that users benefit, with an Uncertain state for the rest?

## 2. Why this is hard (plain language)
- Finding a ball in a frame is a different problem from deciding whether it went in. "Made" means the ball passes down through the rim, which the rim, net, backboard and the player often hide.
- The ball is small, fast and blurry. It disappears behind the player and the rim. A tracker must bridge those gaps.
- Courts, lights, hoops and backgrounds vary; a model that works on one court can fail on another.
- Running a model on every frame heats the phone and drains the battery.
We therefore assume results will never be 100% and design for Uncertain plus manual correction.

## 3. Approach: stages, cheapest first
1. **Offline lab (no app):** run candidate detectors on recorded video on the PC (Python notebook). Fast to iterate, free.
2. **Shot logic offline:** from detections build the ball track, detect shot attempts, classify the outcome by rules, and compare with the ground-truth labels.
3. **Phone feasibility:** only if stage 2 looks promising, run the chosen model on the real phone (speed, heat, battery, memory).
4. **App integration** is M3, not part of the POC.

Do not skip stage 1. Choosing a model, runtime and plugin before we know the approach works is the expensive mistake.

## 4. Technology candidates (to evaluate, not decisions)
| Area | Options | Concern |
|---|---|---|
| Detector | Small object detectors fine-tuned for ball, hoop, person; rim-region heuristics | Pretrained COCO knows "sports ball" and "person" but not a hoop; fine-tuning needed |
| Tracking | Simple Kalman/nearest-neighbor tracking first; ByteTrack-style if needed | Ball is one object: simple tracking may beat a general multi-object tracker |
| On-device runtime | LiteRT (TensorFlow Lite) on Android, Core ML on iOS, or ONNX Runtime | Needs a native bridge in React Native; check maintenance and Expo compatibility |
| Camera frames | `react-native-vision-camera` with frame processors | Needs dev build; verify compatibility with the Expo version at that time |
| Shot rule | Ball track vs hoop box: crossing the rim plane downward, then below the hoop inside rim width | Rim bounces and backboard cases need explicit rules |

**License warning:** the widely used Ultralytics YOLO models and code are AGPL-3.0; shipping them in a closed-source store app needs a paid commercial license or open-sourcing the app. The owner has said no commercial licenses for now. Evaluate permissively licensed models (for example Apache-2.0 or MIT detectors) and check both code AND pretrained weights AND dataset licenses. Using YOLO purely for offline research may be acceptable, but no AGPL model goes into the app without an explicit owner decision. This is the first thing to verify.

## 5. Recording protocol

### Equipment
Phone on a tripod, lens clean, battery above 50% or on a power bank, storage free. Ground-truth helper: the shooter or a friend says "make" or "miss" out loud after every shot so the audio becomes the label source.

### Camera setup (record the variant in the file name)
- **Position A (primary, product-like):** behind the shooter's side, facing the hoop, 4-6 m from the hoop, lens height 1.2-1.6 m, slight upward tilt. Hoop in the upper third of the frame, the whole ball arc visible.
- **Position B (side view):** 90 degrees to the shot line, 5-6 m away, lens at about 1.5 m. Best view of the ball dropping through the rim; used to learn what is achievable.
- **Position C (45 degrees):** between A and B.
- Keep the tripod still during a session. Do not zoom; keep digital zoom off.
- Orientation: portrait as the primary for a tall arc; record one landscape session to compare.

### Video settings
1080p, 60 fps if the phone allows (30 fps as a comparison), fixed exposure and focus lock on the hoop, stabilization off, 8-bit SDR. Disable HDR and beauty filters.

### Conditions matrix (aim to cover each cell at least once)
- Indoor gym with bright overhead light
- Indoor dim light
- Outdoor daylight, sun behind the hoop (glare) and sun behind the camera
- Outdoor overcast, outdoor dusk/artificial light
- At least 3 different hoops/courts, 2 different shooters, varied clothing colors, ball colors and backgrounds

### Shot variety (per session, mix on purpose)
- Clean made shots (swish)
- Made via rim, made via backboard
- Missed: front rim, back rim, side rim, airball, backboard-only miss
- Rim bounce-ins and rim-outs
- Occlusion: shooter's body or a second person passing in front, teammate rebounding
- Distances: close, mid-range, three-point; free throws; layups
- Edge cases: second ball in view, ball rolling away, shots with no one in the frame

### Quantity
- Target at least 600 labeled attempts across at least 12 sessions, 3 or more courts, 2 or more shooters, and all lighting cells.
- Each session 40-60 attempts, 5-10 minutes of clean footage, avoid one long take.
- Why: with about 250 attempts in the final test set, a measured 85% has roughly a plus or minus 4.5 point uncertainty. Fewer attempts make the go/no-go result noisy.

### Labeling
For every shot: video file, time of the release, outcome (`made|missed`), type (swish, rim-in, backboard-in, front-rim-out, etc.), occlusion flag (none/partial/heavy), position, lighting. Keep them in one CSV per session. Label shot attempts with exact timestamps; a human reviews every label before it counts.
Also annotate a few hundred frames with boxes for ball, hoop and person for fine-tuning.

### Privacy and housekeeping
Get consent from anyone filmed, avoid recording bystanders where possible, keep footage off GitHub (gitignore a `data/` folder), and store the raw footage somewhere backed up. Note the license/consent for each clip in case we share data.

## 6. Dataset split (prevents fooling ourselves)
- Split by **session and court**, not by frame or random clip. Frames from one session are nearly identical, so frame-level splits leak and inflate results.
- Train/tune: about 60% of sessions. Validation (for tuning thresholds): 20%. **Final test: 20% of sessions, including at least one court/lighting setup never seen, touched exactly once** when the approach is frozen.
- Public datasets or synthetic data may supplement training but never count toward the final test.
- Never tune thresholds on the final test set. If we do, we declare it burned and collect new footage.

## 7. Metrics (reported separately, with confidence intervals)
Define ground truth as the human label per real shot attempt.

1. **Attempt detection:** precision, recall, false positives (shots reported that did not occur), false negatives (real shots missed). Target: **recall >= 90%**.
2. **Outcome labeling** among attempts the system labeled Made/Missed (not Uncertain): precision for Made, precision for Missed, overall accuracy. Target: **precision >= 85%** for the auto-labeled results.
3. **Uncertain rate:** share of detected attempts labeled Uncertain. Report beside the precision, because precision can be inflated by calling nearly everything Uncertain. Proposed coverage guard: Uncertain should stay below about 25%; the owner confirms.
4. **User effort:** corrections needed per 100 shots (false positives to delete, false negatives to add, wrong labels to fix, Uncertain to resolve).
5. **Confusion matrix** (made/missed/uncertain/no-shot) and breakdown by position, lighting and occlusion type. A good average that fails outdoors at dusk must be visible.
6. **On-device performance:** end-to-end latency per frame, achieved fps, sustained fps after 10 minutes, phone temperature/thermal state, battery percent per 10 minutes, memory, and app size added by the model.

## 8. Go / no-go decision
- **Go:** targets met on held-out real footage in position A (the product-like setup), with acceptable on-device performance (for example at least 15 fps sustained for 10 minutes without thermal throttling on the test phone; owner confirms) and license-clean components.
- **Conditional go:** targets met only under constraints (for example, specific position, good light). Ship as "beta, works best when..." with onboarding guidance.
- **No-go/pivot:** fall back to manual entry plus assistive features (for example, camera-based shot-attempt counting only, or video review with manual tagging). The MVP is unaffected.
Report the result honestly, including failures, in `docs/` as a POC report.

## 9. Work plan (about 4-6 weeks part-time)
1. Week 1: license review of candidate models/datasets; write recording checklist; first test recording (one session) to validate the protocol.
2. Weeks 1-4: record the sessions; label as you go.
3. Weeks 3-4: offline detector baseline (pretrained, then fine-tune) and hoop localization on a validation set.
4. Weeks 4-5: ball track + attempt detection + rule-based outcome with confidence; threshold tuning on validation.
5. Week 5: single run on the frozen test set; report metrics.
6. Week 6 (only if promising): run the model on the real phone; measure performance.

## 10. Open risks
- Footage volume and variety is the biggest risk and fully in the owner's hands.
- Rule-based made/missed may plateau well below target; a learned classifier on short clips around the hoop might be needed (more data, more complexity).
- React Native native-module integration (frame processor plus ML runtime) may be the hardest engineering part; the POC measures it only at stage 3.
- A 1080p/60 fps pipeline may be too heavy; the fallback is cropping around the hoop region and lowering the resolution or frame rate, which affects accuracy.
