// The shadow pass: docs that RE-DECLARE a kit type, narrower than the real one.
//
// WHY THIS EXISTS
// ---------------
// This is the check that catches the drift a compile pass structurally cannot.
// guides/frameworks/solid.mdx renders a message with:
//
//     <MessageContent markdown>{msg.parts.map((p) => p.text).join('')}</MessageContent>
//
// which flattens the message and silently drops every reasoning, tool, card,
// source and file part. Compiling that snippet as written produces ZERO
// diagnostics — because the same snippet declares its own
// `type ChatMessage = { …; parts: { type: 'text'; text: string }[] }`, and
// against that narrow local type `p.text` is perfectly valid. The bug is not in
// the expression; it is in the fact that the page invented a `ChatMessage` that
// the kit already exports and that does not have that shape.
//
// THE MECHANISM
// -------------
// Find top-level `type X` / `interface X` declarations where X is a name the kit
// exports as a TYPE. Blank out the local declaration (replaced with empty lines,
// so every other line number is preserved), import the real one instead, and
// recompile. Diagnostics that appear only in the rewritten copy are the shape
// mismatch, stated in the compiler's own words:
//
//     TS2339  Property 'text' does not exist on type 'MessagePart'.
//             Property 'text' does not exist on type '{ type: "tool"; … }'.
//
// A shadow on its own is worth reporting (the docs teach a type the kit already
// owns). A shadow whose substitution FAILS is a hard finding: the snippet is not
// compatible with the real API.
import { ts } from './compile.mjs';

/**
 * @returns null when the snippet shadows nothing, else a rewritten unit.
 */
export function makeShadowVariant(unit, surface) {
  const kind = unit.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  let sf;
  try {
    sf = ts.createSourceFile(unit.path, unit.code, ts.ScriptTarget.ES2022, true, kind);
  } catch {
    return null;
  }

  const shadowed = [];
  for (const stmt of sf.statements) {
    if (!ts.isTypeAliasDeclaration(stmt) && !ts.isInterfaceDeclaration(stmt)) continue;
    const name = stmt.name.getText(sf);
    const entry = [...surface.entries.entries()].find(([, names]) => names.get(name)?.type);
    if (!entry) continue;
    shadowed.push({ name, specifier: entry[0], start: stmt.getStart(sf), end: stmt.getEnd() });
  }
  if (!shadowed.length) return null;

  // Replace each local declaration with the same number of newlines, so every
  // line below it keeps its number and the reported line still points at the doc.
  let code = unit.code;
  for (const s of [...shadowed].sort((a, b) => b.start - a.start)) {
    const removed = code.slice(s.start, s.end);
    code = code.slice(0, s.start) + '\n'.repeat((removed.match(/\n/g) ?? []).length) + code.slice(s.end);
  }

  const bySpec = new Map();
  for (const s of shadowed) {
    if (!bySpec.has(s.specifier)) bySpec.set(s.specifier, []);
    bySpec.get(s.specifier).push(s.name);
  }

  return {
    ...unit,
    shadowedNames: shadowed.map((s) => s.name),
    code,
    // The imports go on the prelude line, which compileProject already accounts
    // for when it subtracts one from every reported line.
    extraPrelude: [...bySpec.entries()]
      .map(([spec, names]) => `import type { ${[...new Set(names)].join(', ')} } from '${spec}';`)
      .join(' '),
  };
}

/** Findings present in the rewritten copy but not in the original. */
export function diffFindings(original, variant) {
  const seen = new Set((original.findings ?? []).map((f) => `${f.code}:${f.line}:${f.message}`));
  return (variant.findings ?? []).filter((f) => !seen.has(`${f.code}:${f.line}:${f.message}`));
}
