import type { Detection, DetectionResult, ImageSource, Scenario } from "@/types/detection";
export const demoDetections: Detection[] = [
  { id: "1", label: "lizard", confidence: 0.948, box: { x: 0.17, y: 0.41, width: 0.22, height: 0.25 } },
  { id: "2", label: "lizard", confidence: 0.861, box: { x: 0.64, y: 0.33, width: 0.20, height: 0.22 } },
];
export function demoResult(image: ImageSource, scenario: Scenario): DetectionResult {
  return { id: "local-demo", image, simulated: true, detections: scenario === "detected" ? demoDetections : [] };
}
export const percent = (score: number) => `${(score * 100).toFixed(1)}%`;
/** A short UI-only delay makes loading states inspectable; it performs no network request. */
export const demoDelay = () => new Promise<void>((resolve) => setTimeout(resolve, 450));
