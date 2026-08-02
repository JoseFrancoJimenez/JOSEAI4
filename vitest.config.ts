import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
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
      {
        test: {
          name: "toc-demo",
          root: "./src/apps/toc-demo",
          environment: "jsdom",
        },
      },
    ],
  },
});
