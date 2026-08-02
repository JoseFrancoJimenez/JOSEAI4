import { describe, expect, it } from "vitest";
import { TocModel } from "@mini/lib/widgets";
import { people } from "./people.ts";

describe("people", () => {
  it("has unique ids", () => {
    const defs = people();
    const ids = new Set(defs.map((def) => def.id));
    expect(ids.size).toBe(defs.length);
  });

  it("reaches 5 levels deep (depth 0 through 4)", () => {
    const model = new TocModel(people());
    const depths = [...model].map((node) => node.depth);
    expect(Math.max(...depths)).toBe(4);
  });
});
