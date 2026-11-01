# ADR 0001 - Version baseline

Date: 2026-11-01. Status: accepted.

## Decision

- Angular 22.2 (CLI 22.2.5), standalone + signals.
- TypeScript 6.0.x (`~6.0.3`), NOT the newest major (7.x).
- Storybook 10.6 (`@storybook/angular`), Tailwind CSS 4.3, ESLint 10 + angular-eslint 22.
- Node 22 LTS (>= 22.22.3), Python 3.12, Postgres 16 + pgvector, Caddy 2.

## Reasons

- `@storybook/angular` 10.6.5 supports Angular `>=18 <23`, so the newest Angular major works.
- `@angular/compiler-cli` and `@angular/build` 22 require TypeScript `>=6.0 <6.1`; Storybook also lists TS up to 6.x. TypeScript 7 is therefore not usable yet.
- Angular 22 requires Node `^22.22.3 || ^24.15.0 || >=26`; local Node 22.23.2 satisfies this.
- eslint-plugin-jsdoc 65 needs Node `^22.22.2 || >=24.15`; angular-eslint 22 accepts ESLint 9 or 10.

## Revisit

Move TypeScript to 7.x when Angular and Storybook widen their peer ranges.
