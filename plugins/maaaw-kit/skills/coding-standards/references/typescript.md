# TypeScript / React / Next.js Standards

Check first: `package.json` (package manager via lockfile, scripts, Next version), `tsconfig.json`, existing lint config. Use the repo's package manager — never mix npm/pnpm/yarn.

## TypeScript
- `strict: true` always; also `noUncheckedIndexedAccess: true` for new projects.
- No `any`. Use `unknown` + narrowing at boundaries. If forced to `any` (bad 3rd-party types), isolate it in one typed wrapper function.
- No `as` casts to silence errors — fix the type. `satisfies` for checked object literals.
- Discriminated unions over optional-field soup for state (`{status:'loading'} | {status:'error', error: E} | {status:'ok', data: T}`).
- Zod (or the repo's validator) at every I/O boundary: API responses, form input, env vars (`z.object({...}).parse(process.env)` in a single `env.ts`).
- `interface` for object shapes that may extend; `type` for unions/utilities. Follow the repo.
- Named exports; default exports only where the framework requires them (Next pages/layouts).

## React
- Server Components by default (Next App Router); `'use client'` only when you need state/effects/browser APIs — and push it to the leaf, not the page.
- Derive state, don't sync it. If a value can be computed from props/state during render, compute it — no `useEffect` + `setState` mirroring.
- `useEffect` is for synchronizing with external systems only. Every effect needs: correct dep array, cleanup function, and a one-line comment saying what external thing it syncs.
- Keys are stable IDs, never array index for dynamic lists.
- Co-locate: component + its styles + its test in one folder. Extract to shared only on 2nd+ use.
- Handle all fetch states: loading, error, empty, success. Empty state is not the same as loading.

## Next.js (App Router)
- Data fetching in Server Components / Route Handlers; client fetching only for user-interactive data (then use the repo's choice: TanStack Query / SWR).
- `next/image`, `next/font`, `next/link` — not raw `<img>`, `@font-face`, `<a>` for internal routes.
- Route Handlers validate input with zod and return typed `NextResponse.json`.
- Server Actions: validate input (never trust the client), check auth inside the action, `revalidatePath`/`revalidateTag` after mutations.
- Secrets only in server code; anything `NEXT_PUBLIC_` is public — audit before adding.
- `error.tsx` + `not-found.tsx` per route group; `loading.tsx` or Suspense for slow segments.

## Commands (run these, don't guess)
```bash
npx tsc --noEmit          # type check
npm run lint              # or repo's lint script
npm test                  # vitest/jest per repo
npm run build             # catches Next-specific errors tsc misses
```
