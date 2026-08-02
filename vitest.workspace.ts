import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "lib",
      root: "./src/lib",
      environment: "jsdom",
    },
  },
  {
    test: {
      name: "sandbox",
      root: "./src/apps/sandbox",
      environment: "jsdom",
    },
  },
]);
