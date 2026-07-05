# TypeScript / React / Next.js Standards

Check first: package manager via lockfile, `package.json` scripts,
`tsconfig.json`, framework version, and lint/test setup. Use the repo's package
manager; never mix npm/pnpm/yarn.

Reference baseline: TypeScript TSConfig reference, especially the `strict`
family.

## TypeScript

- `strict: true` for new projects. Prefer `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes` when the repo can tolerate the extra precision.
- No unbounded `any`. Use `unknown` at boundaries and narrow explicitly.
- If bad third-party types force `any`, isolate it in one typed wrapper.
- Avoid `as` casts to silence errors. Prefer better types, narrowing, or
  `satisfies` for checked object literals.
- Use discriminated unions for state instead of optional-field soup.
- Validate I/O boundaries with the repo's validator (`zod`, `valibot`, framework
  schema, etc.): API responses, forms, env vars, file input.
- `interface` for extendable object shapes; `type` for unions/utilities. Follow
  repo convention when it differs.
- Named exports by default; default exports only where framework conventions
  require them.

## React

- Derive state during render when possible. Do not mirror props/state with
  `useEffect` + `setState`.
- `useEffect` is for synchronizing with external systems. Every effect needs a
  correct dependency array and cleanup when it subscribes/allocates.
- Stable keys only; never array index for dynamic lists.
- Handle loading, error, empty, and success states distinctly.
- Extract shared components on second real use, not first suspicion.

## Next.js

- Server Components by default in App Router. Use `'use client'` only at leaves
  that need state/effects/browser APIs.
- Secrets stay server-side. Anything `NEXT_PUBLIC_` is public.
- Server actions must validate inputs and auth; revalidate path/tag after
  mutations.
- Add `error.tsx`, `not-found.tsx`, and `loading.tsx` / Suspense where route UX
  requires them.

## Commands

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Use repo scripts/package manager equivalents when present.
