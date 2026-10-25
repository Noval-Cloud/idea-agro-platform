import { mapMarks } from "./theme";

/**
 * A map pin like Google Maps' marker: a round head with a hole, narrowing to a tip at the point itself.
 * Drawn at twice its size, so it stays sharp on dense screens.
 */
export function pinImage(fill: string, hole: string, ratio = 2): ImageData {
  const width = mapMarks["pin-width"];
  const height = mapMarks["pin-height"];
  const canvas = document.createElement("canvas");
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const g = canvas.getContext("2d")!;
  g.scale(ratio, ratio);
  const r = width / 2 - 1.5;
  const cx = width / 2;
  const cy = r + 1.5;
  const tip = height - 1;
  g.beginPath();
  g.moveTo(cx, tip);
  g.bezierCurveTo(cx - r * 0.3, tip - r * 0.8, cx - r, cy + r * 0.75, cx - r, cy);
  g.arc(cx, cy, r, Math.PI, 0);
  g.bezierCurveTo(cx + r, cy + r * 0.75, cx + r * 0.3, tip - r * 0.8, cx, tip);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = hole;
  g.stroke();
  g.beginPath();
  g.arc(cx, cy, r * 0.38, 0, Math.PI * 2);
  g.fillStyle = hole;
  g.fill();
  return g.getImageData(0, 0, canvas.width, canvas.height);
}
