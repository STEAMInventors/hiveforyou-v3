import { describe, expect, it } from "vitest";

import { inferHfyDocKind } from "./hfy-doc-kind";

describe("inferHfyDocKind", () => {
  it("maps common IEP labels", () => {
    expect(inferHfyDocKind("2024 IEP · p.3")).toBe("iep");
    expect(inferHfyDocKind("Psychoeducational evaluation")).toBe("eval");
    expect(inferHfyDocKind("Prior written notice")).toBe("notice");
  });
});
