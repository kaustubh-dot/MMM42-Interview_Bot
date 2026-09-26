# Pillar 4 camera signals

`NEXT_PUBLIC_FACE_SIGNALS=on` enables capture after the monitoring disclosure and interview start. It is set in `.env.example` and the local ignored `.env`; set it on the deployed app and restart/rebuild Next.js to apply this public flag. `off` skips camera permission and model loading. Offline fixture replay always skips capture.

The candidate sees a mirrored live preview. MediaPipe Face Landmarker 1.0.1 runs in a classic browser worker at up to four frames per second, using two-face detection. Frames and landmarks never leave the browser and are not stored. The worker downloads pinned WASM from jsDelivr and the version-1 model from Google storage; a blocked asset request produces unavailable signals, not an interview failure.

Capture waits for the preview element to mount. If permission was changed after a failed attempt, use **Enable camera / Retry camera** without ending the interview. Chrome reuses existing permission, so a popup is not expected when the site is already allowed. Once inference succeeds, the preview shows live face count/direction status; detailed permission/device/model errors are shown when unavailable. The `hydrated` root-attribute mismatch from browser-injected markup is suppressed only on the root element.

Looking away is an approximate head/eye direction signal: head yaw beyond 30 degrees, pitch beyond 25 degrees, or matching eye-direction blendshapes above 0.65. It is not calibrated screen-boundary tracking. Poor lighting, camera position and looking at an allowed second screen can affect it. These observations support a concern band for human review and never affect scores.

Completed occurrences contain their measured duration; fusion applies the existing strict duration thresholds. A turn submission snapshots an ongoing sustained occurrence once, so it reaches the report even if the candidate remains out of frame at the end. The snapshot duration is measured through submission, not a prediction of the eventual duration. An occurrence spanning multiple turns is not counted again. Hidden tabs and gaps in observations reset continuity.

Permission denial, startup timeout, model/worker errors, camera disconnection and stalled inference emit `faceSignalsUnavailable` and release camera tracks/worker resources. Availability is true only after a successful inference. The hook uses the same acknowledged event queue as tab/paste capture, without a shared contract change.

The watchdog requires fresh accepted observations, not merely frames sent to the worker. Optional face capture also stops with an unavailable marker if raw events fill 90 slots of the pending queue, preserving room under the API's 100-event limit. Browser queue deliveries are capped at 100 per accepted turn; remaining queued browser events stay pending for the next turn. An exceptionally large final batch may leave excess browser events undelivered, but cannot block interview completion.

Focused checks (no full build or broad suite required):

```sh
node --test tests/face-signals.test.cjs tests/face-capture.test.cjs
node --conditions=react-server --test --test-name-pattern='face|unavailable|integrity' src/lib/prompts/pipeline/evaluation-integrity.test.cjs
npx tsc --noEmit --incremental false
```

Real-camera rehearsal remains required: sit normally, leave/cover the camera for five seconds then return, bring a second person into frame for two seconds, look away for thirteen seconds, and deny permission/block model loading. Submit an answer and inspect the report after each scenario. Face events appear in submissions; preview and detection are not video playback for the recruiter. Denied or failed face capture must leave the report's face signals unavailable with zero points.
