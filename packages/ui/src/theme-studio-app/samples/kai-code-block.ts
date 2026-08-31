// Sample data for <kai-code-block>.
//
// `code` is scalar:true but multiline — set it here so the Playground and
// Examples display a meaningful snippet instead of an empty block.
// lib/sample-data.ts auto-aggregates every src/data/samples/*.ts via glob.
//
// `sample`  = default code shown by the playground + bare examples
// `named`   = per-language / per-feature sets referenced by <Example data="…">

const TS_CODE = `export function add(a: number, b: number): number {
  return a + b;
}

const result = add(2, 3);
console.log(result); // 5`;

const JS_CODE = `async function fetchUser(id) {
  const res = await fetch(\`/api/users/\${id}\`);
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  return res.json();
}

fetchUser(42).then((user) => console.log(user.name));`;

const PYTHON_CODE = `def fib(n):
    """Return the nth Fibonacci number."""
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

print([fib(i) for i in range(10)])`;

const BASH_CODE = `#!/usr/bin/env bash
set -euo pipefail

for file in src/**/*.ts; do
  echo "Checking \${file}…"
  npx tsc --noEmit --strict "\${file}"
done
echo "All files pass type-check."`;

const PLAIN_CODE = `This is plain text — no syntax highlighting.
Useful for log output, terminal traces, or
any content where colour would be distracting.`;

export default {
  sample: {
    code: TS_CODE,
    language: 'ts',
  },
  named: {
    typescript: {
      code: TS_CODE,
      language: 'ts',
    },
    javascript: {
      code: JS_CODE,
      language: 'js',
    },
    python: {
      code: PYTHON_CODE,
      language: 'python',
    },
    bash: {
      code: BASH_CODE,
      language: 'bash',
    },
    plaintext: {
      code: PLAIN_CODE,
    },
  },
};
