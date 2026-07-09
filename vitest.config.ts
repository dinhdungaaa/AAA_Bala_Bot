import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["zaloGroupBot/**/*.test.ts", "rag/**/*.test.ts", "widget/**/*.test.ts", "__tests__/**/*.test.ts"],
    environment: "node",
  },
});
