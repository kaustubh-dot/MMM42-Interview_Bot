import type { IntegrityEvent } from "@/types/pipeline";

type FaceKind = "faceMissing" | "multipleFaces" | "lookAway";
const MINIMUM: Record<FaceKind, number> = {
  faceMissing: 3000,
  multipleFaces: 1500,
  lookAway: 12000,
};
type Occurrence = { atMs: number; turnId?: string; delivered: boolean };

/** Raw completed durations go to fusion; a submit snapshots sustained, still-open occurrences.
 * A snapshot is delivered only once, even if the occurrence spans several answers.
 * These events are a concern level for human review and never affect a score.
 */
export class FaceOccurrenceTracker {
  private occurrences: Partial<Record<FaceKind, Occurrence>> = {};

  observe(count: number, away: boolean, atMs: number, turnId?: string): IntegrityEvent[] {
    const conditions = {
      faceMissing: count === 0,
      multipleFaces: count > 1,
      lookAway: count === 1 && away,
    };
    const events: IntegrityEvent[] = [];
    for (const kind of Object.keys(conditions) as FaceKind[]) {
      const occurrence = this.occurrences[kind];
      if (conditions[kind]) {
        if (!occurrence) {
          this.occurrences[kind] = { atMs, turnId, delivered: false };
        }
      } else if (occurrence) {
        if (!occurrence.delivered) {
          events.push({
            kind,
            atMs: occurrence.atMs,
            durationMs: Math.max(0, atMs - occurrence.atMs),
            turnId: occurrence.turnId,
          });
        }
        delete this.occurrences[kind];
      }
    }
    return events;
  }

  checkpoint(atMs: number): IntegrityEvent[] {
    const events: IntegrityEvent[] = [];
    for (const kind of Object.keys(this.occurrences) as FaceKind[]) {
      const occurrence = this.occurrences[kind];
      if (occurrence && !occurrence.delivered && atMs - occurrence.atMs > MINIMUM[kind]) {
        events.push({
          kind,
          atMs: occurrence.atMs,
          durationMs: atMs - occurrence.atMs,
          turnId: occurrence.turnId,
        });
        occurrence.delivered = true;
      }
    }
    return events;
  }

  reset() {
    this.occurrences = {};
  }
}

interface FaceObservation {
  faceLandmarks: unknown[][];
  facialTransformationMatrixes: { data: number[] }[];
  faceBlendshapes: { categories: { categoryName: string; score: number }[] }[];
}

/** Conservative direction proxy, not calibrated eye tracking or proof of conduct.
 * MediaPipe's column-major rotation matrix estimates head direction. Paired eye
 * blendshapes catch sustained eye movement while the head stays forward.
 */
export function lookingAway(result: FaceObservation): boolean {
  if (result.faceLandmarks.length !== 1) {
    return false;
  }
  const m = result.facialTransformationMatrixes[0]?.data;
  if (m?.length === 16) {
    const yaw = Math.atan2(m[8], m[10]);
    const pitch = Math.atan2(-m[9], Math.hypot(m[8], m[10]));
    if (Math.abs(yaw) > Math.PI / 6 || Math.abs(pitch) > Math.PI / 7.2) {
      return true;
    }
  }
  const scores = new Map(
    result.faceBlendshapes[0]?.categories.map((c) => [c.categoryName, c.score]),
  );
  return [
    ["eyeLookOutLeft", "eyeLookInRight"],
    ["eyeLookInLeft", "eyeLookOutRight"],
    ["eyeLookUpLeft", "eyeLookUpRight"],
    ["eyeLookDownLeft", "eyeLookDownRight"],
  ].some(([left, right]) => (scores.get(left) ?? 0) > 0.65 && (scores.get(right) ?? 0) > 0.65);
}
