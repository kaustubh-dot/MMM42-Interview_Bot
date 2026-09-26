import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { lookingAway } from "./face-signals";

// Only downloaded model/WASM assets cross the network. Frames stay in this worker
// and are immediately released; no recording, persistence or upload exists.
let detector: FaceLandmarker | null = null;
self.onmessage = async ({ data }) => {
  try {
    if (data.kind === "init") {
      const files = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
      );
      detector = await FaceLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numFaces: 2,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
      self.postMessage({ kind: "ready" });
    } else if (data.kind === "frame") {
      try {
        if (!detector) {
          throw new Error("Detector not ready");
        }
        const result = detector.detectForVideo(data.frame, data.atPerf);
        self.postMessage({
          kind: "sample",
          count: result.faceLandmarks.length,
          away: lookingAway(result),
          atPerf: data.atPerf,
        });
      } finally {
        data.frame.close();
      }
    }
  } catch (error) {
    self.postMessage({
      kind: "error",
      detail: error instanceof Error ? error.message.slice(0, 160) : "Unknown face detector error.",
    });
  }
};
