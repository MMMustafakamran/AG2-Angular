# Frontend

The Angular 22 harness, plus the Copilot Runtime it talks to. Generated with
[Angular CLI](https://github.com/angular/angular-cli) 22.1.3; see the [root
readme](../readme.md) for how the three processes fit together.

## Development server

The app needs the runtime beside it, so start both:

```bash
npm run dev        # runtime (8401) + ng serve (4204), via concurrently
```

Or separately:

```bash
npm run runtime    # Copilot Runtime — http://localhost:8401/api/copilotkit
npm start          # Angular dev server — http://localhost:4204
```

The AG2 backend is a third process, started from `../backend`. Either one being
down means nothing streams; the Introduction route probes both.

## Generated files

`prestart` and `prebuild` run `gen:sources`, which reads the real
implementation files off disk into `src/app/lib/generated-sources.ts` so a doc
route renders byte-identical code rather than a re-typed copy. `gen:versions`
writes `VERSIONS.md` — what the declared ranges actually resolved to — which is
the first frame of the Quickstart recording. `doc:check` / `doc:sync` compare
`../doc-snapshot` against the live docs.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
