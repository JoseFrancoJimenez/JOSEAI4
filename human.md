# Operator Guide (for you, not the agent)

How to run this repo with a coding agent (Claude Code) without burning tokens on pure context. The agent does **not** load this file.

## The three docs and who they're for

| File | Audience | When it's loaded |
|---|---|---|
| `CLAUDE.md` | the agent | **Auto-loaded every session.** Small — the hard rules + pointers. |
| `plan.md` + `docs/*-brief.md` | the agent | **On demand** — the agent reads them only when a task needs them. |
| `human.md` | **you** | Never loaded by the agent. Your operating guide. |

Why the split matters for tokens: `CLAUDE.md` is paid **every turn** (it's in context the whole session), so it stays lean and links out. The detailed architecture and specs live in files the agent reads **only when relevant** — that keeps the per-turn context small.

## Where things go

- `CLAUDE.md` at the **repo root** — Claude Code reads it automatically at the start of every session. (User-level rules can also live at `~/.claude/CLAUDE.md`; per-subtree rules can be nested in subfolders.)
- `plan.md` and the briefs under `docs/` — referenced from `CLAUDE.md`, read on demand.
- Set the **commands** in `CLAUDE.md` (`test` / `typecheck` / `lint`) to your real ones before you start, or the agent will run the wrong thing and waste a turn. This is a **pnpm monorepo**, so commands are often workspace-scoped (e.g. `pnpm --filter <pkg> test`).

## Token best practices (ordered by leverage)

1. **One task per session; start fresh often.** This is the biggest lever. A long thread carries **all** prior file reads and tool outputs into **every** later turn — you pay for them repeatedly. Build one element + its tests in a focused session, then close it. Don't run one endless mega-thread across ten unrelated experiments.
2. **Let the agent READ files; don't paste them.** Reading is targeted (it pulls only what it needs); pasting dumps whole files that then sit in context forever. Point it at a path instead of pasting.
3. **Keep `CLAUDE.md` small; push detail to on-demand files.** Anything that's a multi-step procedure, or only matters for one part of the code, belongs in `plan.md`/a brief (or later a skill) — not in `CLAUDE.md`.
4. **Be specific.** Vague asks make the agent explore and read broadly (expensive). "Add a `ui-toggle` element per `plan.md` §1, light DOM, props-down/events-up, with a vitest test" is cheap and targeted.
5. **Run and iterate on tests in the terminal, not in chat.** Let the agent run the test command and read failures itself. Don't shuttle test output back and forth through chat.
6. **Use git; keep experiment apps disposable.** Prototype apps under `src/apps/` (e.g. `src/apps/sandbox`) are throwaway — commit or discard so context doesn't accumulate cruft.
7. **Check what's loaded.** Use `/memory` to see which instruction files are active; if an ancestor `CLAUDE.md` is polluting context, exclude it.

## The important caveat: `CLAUDE.md` guides, it does not enforce

Claude Code treats `CLAUDE.md` (and its auto memory) as **context, not enforced configuration** — more specific and concise instructions are followed more reliably, but nothing here is guaranteed. So for the **hard invariants** — no Shadow DOM, `Object.is` equality (never `JSON.stringify`), serializable-only state, props-down/events-up — the real safety net is **tests and lint**, not this file. Invest in the test suite and a few lint rules that encode those invariants; that's what actually holds the line when the agent drifts.

## Next step (not done yet)

The two briefs still need to be realigned to library-first framing (drop the GIS-app-centric framing, clarify the base store is a library tool while concrete domain stores are app-level, MVVM-only) and renamed into `docs/store-brief.md` and `docs/toc-brief.md`. Until then, the pointers in `CLAUDE.md`/`plan.md` refer to files you still need to place.
