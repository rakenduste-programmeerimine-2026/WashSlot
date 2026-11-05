import { cn } from "@/lib/utils";
import { expect, test } from "vitest";

test("cn resolves conflicting Tailwind classes", () => {
  expect(cn("p-2", "p-4")).toBe("p-4");
});
