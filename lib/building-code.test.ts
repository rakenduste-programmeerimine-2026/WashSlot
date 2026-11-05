import { normalizeBuildingCode } from "@/lib/building-code";
import { expect, test } from "vitest";

test("trims and uppercases a valid code", () => {
  expect(normalizeBuildingCode("  demo2026 ")).toBe("DEMO2026");
});

test.each(["", "ABC12", "ABCDEFGHIJKLM", "DEMO-2026", "DEMO 2026", null, 123])(
  "rejects %j",
  (input) => {
    expect(normalizeBuildingCode(input)).toBeNull();
  },
);
