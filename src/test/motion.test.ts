import { describe, expect, it } from "vitest";
import { classifyMotion, summarizeScores, isFlaggedMotion } from "@/lib/motion";

const repeat = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => f(i));

describe("motion rating", () => {
  it("slow steady pan is smooth with good confidence", () => {
    const r = classifyMotion(summarizeScores(repeat(80, () => 0.01)));
    expect(r.label).toBe("smooth");
    expect(r.confidence).toBeGreaterThan(0.7);
  });
  it("sport-mode 180° spin is too fast", () => {
    const r = classifyMotion(summarizeScores(repeat(80, (i) => (i > 20 && i < 50 ? 0.4 : 0.02))));
    expect(r.label).toBe("too_fast");
    expect(isFlaggedMotion(r.label)).toBe(true);
  });
  it("jittery alternating frames are shaky", () => {
    const r = classifyMotion(summarizeScores(repeat(80, (i) => (i % 2 ? 0.06 : 0.005))));
    expect(r.label).toBe("shaky");
  });
  it("too few frames is unknown, never flagged", () => {
    const r = classifyMotion(summarizeScores([0.5, 0.5]));
    expect(r.label).toBe("unknown");
    expect(isFlaggedMotion(r.label)).toBe(false);
  });
});
