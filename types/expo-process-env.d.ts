// FIX: 2026-09 — CI-only `no-unsafe-*` lint errors on `process.env.EXPO_PUBLIC_*`
// → Expo's generated `expo-env.d.ts` is gitignored, so a fresh clone (CI) had nothing
// typing the global `process` in the `tsconfig.json` program and every env read
// degraded to `any`, tripping typed lint rules that pass locally.
//
// This tracked file pulls in the same reference so typed ESLint and `tsc` resolve
// `process.env` as `string | undefined` both locally and in CI. Do not delete, and
// do not name it `expo-env.d.ts` — `.gitignore` matches that name at any depth.
/// <reference types="expo/types" />
