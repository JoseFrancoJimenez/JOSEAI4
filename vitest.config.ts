import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "lib",
          root: "./src/lib",
          environment: "jsdom",
          setupFiles: ["./test-setup/popover-api-stub.ts"],
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
      {
        test: {
          name: "app-demo-stores",
          root: "./src/apps/app-demo-stores",
          environment: "jsdom",
        },
      },
      {
        test: {
          name: "proto-all",
          root: "./src/apps/proto-all",
          environment: "jsdom",
        },
      },
    ],
  },
});
