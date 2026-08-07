# setup.md — one-time project setup (runbook)

**Run this ONCE, at repo creation.** It is not re-read every session — `CLAUDE.md` holds the standing rules. After the agent completes and `pnpm check` passes clean, this file becomes historical documentation of the setup; only re-read it if reconfiguring the tooling.

**For the agent:** scaffold the monorepo, add the map dependency, and wire the three quality gates + git. **Be pragmatic — scaffold only.** Do **not** implement the library components (the base `Store`, `Evented`, `deepFreeze`, or any element/widget — those are separate tasks in `docs/store-brief.md` and `docs/toc-brief.md`). Do **not** add pre-commit hooks or CI YAML unless asked. Honor the invariants in `CLAUDE.md` and `plan.md`. Use current stable versions; verify them, don't hardcode from memory.

Stack: **pnpm monorepo, Vite, TypeScript, vanilla Web Components — no frameworks.** Library in `src/lib`, apps in `src/apps/<app>`, dependency direction **app → lib only**.

---

## 0. Preconditions

- Node LTS + pnpm installed. Set `packageManager` and `engines` in the root `package.json` for reproducibility. Optionally add `.nvmrc`.

## 1. Git first (so nothing untracked leaks in)

- `git init`.
- Create `.gitignore` at the root:

```gitignore
node_modules/
dist/
dist-ssr/
build/
coverage/
.vite/
*.log
*.local
.env
.env.*
.DS_Store
```

Do **not** ignore `pnpm-lock.yaml` — it is committed. Commit at the very end (step 8), not now.

## 2. Workspace scaffolding

- `pnpm-workspace.yaml`:

```yaml
packages:
  - "src/lib"
  - "src/apps/*"
```

- Root `package.json`: `"private": true`, `"type": "module"`, `packageManager`, `engines`. Shared **devDependencies at the root** (typescript, eslint, typescript-eslint, eslint-plugin-import, vitest, jsdom). Scripts are added in step 8.
- Create the folder structure:

```
src/lib/            # the library package
  core/             # (tools go here later — leave an index.ts barrel)
  elements/         # (UI elements later — leave an index.ts barrel)
  widgets/          # (widgets later — leave an index.ts barrel)
src/apps/sandbox/   # first app (GIS-capable prototype)
docs/               # plan.md, store-brief.md, toc-brief.md live here
```

`CLAUDE.md` goes at the repo root; `plan.md` and the two briefs go in `docs/`. These files already exist — place them, don't regenerate them.

## 3. TypeScript — strict (single root config)

- One root `tsconfig.json` covering `src/**/*.ts` (pragmatic — no per-package tsconfig sprawl):
  - `"strict": true`, plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`.
  - Vite-suited: `"module": "ESNext"`, `"moduleResolution": "bundler"`, `"target": "ESNext"`, `"lib": ["ESNext", "DOM", "DOM.Iterable"]`, `"noEmit": true`, `"verbatimModuleSyntax": true`.
  - `"types": ["vite/client"]` (the store uses `import.meta.env.DEV`), and add a `src/vite-env.d.ts` containing `/// <reference types="vite/client" />`.
- The library is consumed as **TypeScript source** across the workspace — no build step for `src/lib` now (apps' Vite bundles it directly).

## 4. The library package (`src/lib`)

- `src/lib/package.json`:

```jsonc
{
  "name": "@<scope>/lib",       // <scope> = pick the real scope; apps import this name
  "private": true,
  "type": "module",
  "exports": {
    "./core": "./core/index.ts",
    "./elements": "./elements/index.ts",
    "./widgets": "./widgets/index.ts"
  }
}
```

- No runtime dependencies. No framework, no map library — **never** here.
- Put an empty barrel (`export {};`) in each of `core/`, `elements/`, `widgets/` `index.ts` so the exports resolve. Do not implement anything.
- Add ONE trivial passing smoke test (e.g. `src/lib/core/smoke.test.ts` asserting `true`) just to prove the test wiring.

## 5. First app with OpenLayers (`src/apps/sandbox`)

This is a GIS-capable prototype app. **OpenLayers is an app-level dependency and lives here, not in `src/lib`.**

- `src/apps/sandbox/package.json`:

```jsonc
{
  "name": "@<scope>/sandbox",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": {
    "@<scope>/lib": "workspace:*",   // imports the library by package name
    "ol": "^<latest>"                // OpenLayers; it ships its own TS types (no @types/ol) — verify
  }
}
```

- `src/apps/sandbox/vite.config.ts` (standard Vite; workspace resolution handles `@<scope>/lib`).
- `src/apps/sandbox/index.html` + `src/apps/sandbox/src/main.ts` — a minimal entry that boots and logs something (optionally render a bare OpenLayers map into a div to confirm `ol` resolves). Keep it a throwaway smoke test of the toolchain, not real app code.
- Add ONE trivial passing test to prove the app's test wiring.

## 6. ESLint — flat config, rules that BITE

- `eslint.config.js` at the root using `typescript-eslint` **type-checked** config (enable the type-aware parser, e.g. `parserOptions: { projectService: true }`), plus `eslint-plugin-import`.
- Rules as **errors** (tune the numbers later, but start strict — these force the "pragmatic ≠ sloppy" line):
  - `@typescript-eslint/no-explicit-any`
  - `@typescript-eslint/no-unused-vars`
  - `@typescript-eslint/no-floating-promises`, `@typescript-eslint/no-misused-promises`
  - `@typescript-eslint/explicit-module-boundary-types` (clear library API surface)
  - `complexity` — max **10**
  - `max-lines-per-function` — max **50** (skip blank lines + comments)
  - `max-depth` — max **3**
- **Architecture boundary — the highest-value rules. Enforce `app → lib` only:**
  - **`src/lib` must NOT import from `src/apps`.** Use `eslint-plugin-import`'s `no-restricted-paths` with a zone: `{ target: "./src/lib", from: "./src/apps" }`.
  - **Apps must import the library by its package name, never by a relative path into `src/lib`.** Use `import/no-relative-packages` (error) — it forbids `../../lib/...` reaching across the package boundary and points to `@<scope>/lib` instead.
- Do NOT write custom lint rules for the domain invariants (no `JSON.stringify` equality, no clone-on-read, serializable-only store state) — those are covered by **tests and review**, not lint.

## 7. Vitest

- `vitest.workspace.ts` at the root covering all packages.
- `environment: "jsdom"` (needed for web-component / DOM tests).
- The trivial tests from steps 4 and 5 are the smoke tests.

## 8. Wire scripts, install, verify, commit

- Root `package.json` scripts:

```jsonc
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "check": "pnpm typecheck && pnpm lint && pnpm test"
  }
}
```

- `pnpm install`.
- Run **`pnpm check`** and confirm all three gates pass clean. Fix any wiring issues until they do.
- Then make the initial commit.

---

## Notes / placeholders

- **`<scope>`** is the only intentional placeholder — replace it with the real package scope in every `package.json` and in the app's import of the library.
- Verify current versions of everything at install time; do not pin from memory.
- Confirm OpenLayers (`ol`) bundles its own types; if a `main.ts` map smoke test is added, it stays in the app, never in `src/lib`.
- Optional niceties (only if quick): `.editorconfig`, `.nvmrc`. Skip Prettier unless you want it — ESLint + strict TS already carry the load here.