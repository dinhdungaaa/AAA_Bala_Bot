import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["zaloGroupBot/**/*.test.ts", "rag/**/*.test.ts"],
    environment: "node",
  },
});
