import { describe, it, expect } from "vitest";
import { previewHoldings } from "./holdingsPreview";

const make = (cols: number, per: number) =>
  Array.from({ length: cols * per }, (_, i) => ({ c: `c${Math.floor(i / per)}` }));

describe("previewHoldings", () => {
  it("shows at most 10 collections", () => {
    const r = previewHoldings(make(14, 2), (n) => n.c);
    expect(r.groups).toHaveLength(10);
    expect(r.totalCollections).toBe(14);
  });
  it("shows at most 10 NFTs per collection and keeps the real total", () => {
    const r = previewHoldings(make(1, 25), (n) => n.c);
    expect(r.groups[0].items).toHaveLength(10);
    expect(r.groups[0].total).toBe(25);
  });
});
