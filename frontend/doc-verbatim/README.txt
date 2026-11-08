Doc code, verbatim, kept outside src/ so `ng serve` of the other pages still builds.
HARNESS: each folder is type-checked on its own (npx tsc -p doc-verbatim/<page>/tsconfig.json);
the recorder runs that during the page's take and appends the output to logs/doc-typecheck.log,
which is the error `ng serve` would show if the snippet were placed in src/ (FINDINGS.md #2, #6, #9).
