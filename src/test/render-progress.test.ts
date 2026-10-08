import { describe, expect, it } from "vitest";
import { observeRenderProgress, renderJobLabel, renderJobPercent, summarizeRenderProgress } from "../lib/render-progress";

const job = (id: string, status: string, progress = 0, at = 10_000) => ({ id, status, progress, updated_at: new Date(at).toISOString() });
describe("render progress display", () => {
  it("shows real aggregate progress, not queued or elapsed-time progress", () => {
    const result = summarizeRenderProgress([job("a", "completed", 100), job("b", "processing", 50), job("c", "queued")], new Map(), 10_000);
    expect(result.percent).toBe(50);
    expect(result.estimatedMs).toBeNull();
  });
  it("estimates remaining work only after measured progress", () => {
    const first = observeRenderProgress([job("a", "processing", 10)], new Map(), 1000);
    const second = observeRenderProgress([job("a", "processing", 30)], first, 11_000);
    const result = summarizeRenderProgress([job("a", "processing", 30, 11_000), job("b", "queued")], second, 11_000);
    expect(result.estimatedMs).toBeCloseTo(85_000);
  });
  it("does not pretend failed or cancelled jobs were successful", () => {
    const result = summarizeRenderProgress([job("a", "completed"), job("b", "failed"), job("c", "cancelled")], new Map(), 10_000);
    expect(result.percent).toBe(100);
    expect(result.done).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.cancelled).toBe(1);
  });
  it("never shows completion before worker confirmation", () => {
    expect(summarizeRenderProgress([job("a", "processing", 100)], new Map(), 10_000).percent).toBe(99);
  });
  it("withholds estimates if the worker stops reporting", () => {
    const first = observeRenderProgress([job("a", "processing", 10)], new Map(), 1000);
    const second = observeRenderProgress([job("a", "processing", 30)], first, 11_000);
    expect(summarizeRenderProgress([job("a", "processing", 30, 11_000)], second, 50_000).estimatedMs).toBeNull();
  });
  it("shows honest progress for every render state", () => {
    expect(renderJobPercent(job("queued", "queued", 42))).toBe(0);
    expect(renderJobLabel(job("queued", "queued", 42))).toBe("Queued · 0%");
    expect(renderJobPercent(job("active", "processing", 100))).toBe(99);
    expect(renderJobLabel(job("active", "processing", 64))).toBe("Rendering · 64%");
    expect(renderJobLabel(job("camera", "processing", 64), "Analyzing")).toBe("Analyzing · 64%");
    expect(renderJobPercent(job("done", "completed", 95))).toBe(100);
    expect(renderJobLabel(job("done", "completed", 95))).toBe("Completed");
    expect(renderJobPercent(job("failed", "failed", 37))).toBe(37);
  });
});