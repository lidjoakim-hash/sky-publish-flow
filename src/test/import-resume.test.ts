import { describe, expect, it } from "vitest";
import { countDoneInPlan } from "@/lib/importer";
import { takeInputFiles } from "@/routes/_authenticated/import";

describe("resume progress counting", () => {
  it("counts already-finished batch entries toward the plan total", () => {
    const plan = Array.from({ length: 84 }, (_, i) => `First_Campaign/img_${String(i).padStart(2, "0")}.jpg`);
    const done = new Set(plan.slice(0, 46));
    // 46 done + 38 remaining = 84/84 once the rest finish; before the fix this started at 0 → 38/84.
    expect(countDoneInPlan(done, plan)).toBe(46);
    expect(countDoneInPlan(done, plan) + 38).toBe(84);
  });
  it("ignores finished paths that are not in the current plan", () => {
    expect(countDoneInPlan(["other.jpg", "a.jpg"], ["a.jpg", "b.jpg"])).toBe(1);
    expect(countDoneInPlan([], ["a.jpg"])).toBe(0);
  });
});

describe("same-file reselection", () => {
  it("returns the chosen files and clears the input so the same ZIP can be picked again", () => {
    const input = document.createElement("input");
    input.type = "file";
    const dt = new DataTransfer();
    dt.items.add(new File(["x"], "batch.zip", { type: "application/zip" }));
    input.files = dt.files;
    const files = takeInputFiles(input);
    expect(files.map((f) => f.name)).toEqual(["batch.zip"]);
    expect(input.value).toBe("");
    expect(input.files?.length ?? 0).toBe(0);
  });
  it("returns an empty list when nothing was chosen", () => {
    const input = document.createElement("input");
    input.type = "file";
    expect(takeInputFiles(input)).toEqual([]);
  });
});
