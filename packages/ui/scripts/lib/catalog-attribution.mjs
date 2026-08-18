// THE CATALOG IMPROVEMENT ANALYSIS.
//
// The spec asserts the mechanism and never supplies it: "whatever the agent
// cannot build names exactly what the catalog is missing". That sentence is only
// true if something actually performs the attribution, and nothing did. This is
// that thing.
//
// The rule it enforces: EVERY FINDING NAMES THE CATALOG RECORD THAT SHOULD HAVE
// PREVENTED IT. A finding with no attribution is a complaint about a model; a
// finding with an attribution is a proposed change to the catalog. Only the
// second kind is worth the cost of a run, so the first kind is refused.
//
// Attributions are RESOLVED against the catalog, not accepted as prose. Naming
// an invariant that does not exist, or proposing a "missing" invariant whose id
// is already taken, or claiming an element has no description when it has one —
// each is a hard error. Without resolution the analysis degrades into free text
// within two runs, which is the state it is replacing.

/**
 * The kinds, and what each one must name to be resolvable.
 *
 * `not-a-catalog-gap` is the escape hatch and it is deliberately the most
 * expensive one to use: it must quote the page and the line that already said
 * the thing. Without that cost every finding lands there and the analysis
 * produces nothing.
 */
export const ATTRIBUTION_KINDS = {
  'missing-invariant': {
    requires: ['proposedId', 'statement'],
    means: 'no invariant covers this. The proposed id must not already exist.',
  },
  'invariant-ineffective': {
    requires: ['invariant', 'why'],
    means: 'the invariant exists and did not land: buried in a long statement, no example to pattern-match, or the wrong half emphasised.',
  },
  'missing-recipe': {
    requires: ['proposedId', 'intent'],
    means: 'no surface recipe covers the shape asked for. The proposed id must not already exist.',
  },
  'recipe-ineffective': {
    requires: ['recipe', 'why'],
    means: 'a recipe covers this and was not followed or not found.',
  },
  'underived-contract': {
    requires: ['tag', 'fact'],
    means: 'the derived layer does not express a contract the agent needed (which event carries which detail, that a prop is function-valued, which parts an element consumes).',
  },
  'missing-element-description': {
    requires: ['tag'],
    means: 'the element has no description anywhere in the tree, so the agent could not tell it apart from its neighbours.',
  },
  'fabricated-element': {
    requires: ['invented'],
    means: 'the agent invented a kai-* tag. Feeds the FABRICATED.md write-back.',
  },
  'pack-defect': {
    requires: ['page', 'why'],
    means: 'the pack itself misled: a page missing, wrong, or contradicting another page. Not a catalog gap — a packer bug.',
  },
  'not-a-catalog-gap': {
    requires: ['page', 'quote'],
    means: 'the catalog said it plainly and the model got it wrong anyway. Must quote the page and the line, because this is the escape hatch and an uncosted escape hatch swallows the analysis.',
  },
};

/**
 * @typedef {Record<string, any>} Attribution
 * @typedef {{ id: string, dimension?: string, severity?: string, summary?: string, tierRevealed?: boolean, changeId?: string, attribution?: Attribution }} AttributableFinding
 * @typedef {{ invariantIds: string[], recipeIds: string[], knownTags: string[], describedTags: string[], pages: string[] }} CatalogFacts
 */

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/**
 * @param {Attribution} a
 * @returns {string}
 *
 * A stable id for the CHANGE an attribution proposes, so two findings that want
 * the same change collapse onto one row. This is what makes "ranked by how many
 * findings each would close" a real count rather than a list of one-offs.
 */
export function catalogChangeId(a) {
  switch (a.kind) {
    case 'missing-invariant':
      return `invariant:add:${slug(a.proposedId)}`;
    case 'invariant-ineffective':
      return `invariant:strengthen:${slug(a.invariant)}`;
    case 'missing-recipe':
      return `recipe:add:${slug(a.proposedId)}`;
    case 'recipe-ineffective':
      return `recipe:strengthen:${slug(a.recipe)}`;
    case 'underived-contract':
      return `derived:express:${slug(a.tag)}:${slug(a.fact)}`;
    case 'missing-element-description':
      return `describe:${slug(a.tag)}`;
    case 'fabricated-element':
      return `fabricated:${slug(a.invented)}`;
    case 'pack-defect':
      return `pack:${slug(a.page)}:${slug(a.why).slice(0, 40)}`;
    case 'not-a-catalog-gap':
      return `no-change:${slug(a.page)}`;
    default:
      return `unknown:${slug(a.kind)}`;
  }
}

/**
 * Resolve one attribution against the catalog.
 *
 * @param {Attribution} a
 * @param {CatalogFacts} catalog
 * @returns {string[]} problems; empty means resolved
 */
export function resolveAttribution(a, catalog) {
  const problems = [];
  if (!a || typeof a !== 'object') return ['attribution is not an object'];
  const spec = ATTRIBUTION_KINDS[a.kind];
  if (!spec) return [`unknown attribution kind "${a.kind}"; the kinds are ${Object.keys(ATTRIBUTION_KINDS).join(', ')}`];
  for (const field of spec.requires) {
    if (a[field] === undefined || a[field] === null || a[field] === '') {
      problems.push(`${a.kind} requires \`${field}\` (${spec.means})`);
    }
  }
  if (problems.length) return problems;

  const known = new Set(catalog.knownTags);
  const described = new Set(catalog.describedTags);

  switch (a.kind) {
    case 'missing-invariant':
      if (catalog.invariantIds.includes(a.proposedId)) {
        problems.push(
          `proposed invariant "${a.proposedId}" already exists. If the record is there and did not land, the finding is invariant-ineffective — a different change with a different fix.`,
        );
      }
      break;
    case 'invariant-ineffective':
      if (!catalog.invariantIds.includes(a.invariant)) {
        problems.push(`invariant "${a.invariant}" does not exist. The ids are: ${catalog.invariantIds.join(', ')}`);
      }
      break;
    case 'missing-recipe':
      if (catalog.recipeIds.includes(a.proposedId)) problems.push(`proposed recipe "${a.proposedId}" already exists; use recipe-ineffective.`);
      break;
    case 'recipe-ineffective':
      if (!catalog.recipeIds.includes(a.recipe)) problems.push(`recipe "${a.recipe}" does not exist. The ids are: ${catalog.recipeIds.join(', ')}`);
      break;
    case 'underived-contract':
      if (!known.has(a.tag)) problems.push(`"${a.tag}" is not an element the kit ships, so the derived layer is not what is missing — this is fabricated-element.`);
      break;
    case 'missing-element-description':
      if (!known.has(a.tag)) problems.push(`"${a.tag}" is not an element the kit ships.`);
      else if (described.has(a.tag)) {
        problems.push(
          `"${a.tag}" DOES have a description in the tree, so "no description" is not the gap. Say what the description failed to convey instead (underived-contract), or attribute elsewhere.`,
        );
      }
      break;
    case 'fabricated-element':
      if (known.has(a.invented)) {
        problems.push(`"${a.invented}" is a real element the kit ships; using it is not a fabrication. Check the tag before recording it — a false row in FABRICATED.md tells future agents a real element does not exist.`);
      }
      if (a.useInstead !== undefined && a.useInstead !== null && !known.has(a.useInstead)) {
        problems.push(`"use instead" names "${a.useInstead}", which the kit does not ship either. Leave it null with a reason rather than pointing at a second tag that does not exist.`);
      }
      if ((a.useInstead === undefined || a.useInstead === null) && !a.noReplacementReason) {
        problems.push(`fabricated-element with no \`useInstead\` must carry \`noReplacementReason\` — "there is no replacement" is a real and useful answer, but it has to be said rather than left blank.`);
      }
      break;
    case 'pack-defect':
    case 'not-a-catalog-gap':
      if (catalog.pages.length && !catalog.pages.includes(a.page)) {
        problems.push(`page "${a.page}" is not one of the pack's pages: ${catalog.pages.join(', ')}`);
      }
      break;
    default:
      break;
  }
  return problems;
}

/**
 * Attribute every finding, refusing the whole analysis if any is unattributable.
 * Partial attribution would produce a prioritised list that silently omits the
 * findings nobody could place, which is the worst of both.
 *
 * @param {{ findings: AttributableFinding[], catalog: CatalogFacts }} input
 * @returns {(AttributableFinding & { changeId: string, attribution: Attribution })[]}
 */
export function attributeFindings({ findings, catalog }) {
  const problems = [];
  for (const f of findings) {
    if (!f.attribution) {
      problems.push(`finding "${f.id}" carries no attribution.`);
      continue;
    }
    for (const p of resolveAttribution(f.attribution, catalog)) problems.push(`finding "${f.id}": ${p}`);
  }
  if (problems.length) {
    throw new Error(
      `findings could not be attributed to the catalog, so no improvement analysis was produced:\n  - ${problems.join('\n  - ')}`,
    );
  }
  return findings.map((f) => ({ ...f, changeId: catalogChangeId(f.attribution) }));
}

/**
 * The prioritised list of catalog changes — the real output of a run.
 *
 * Ranked by HOW MANY FINDINGS EACH WOULD CLOSE, first and foremost, because that
 * is the question the spec poses. Ties break on severity weight (a change that
 * closes one does-not-render beats one that closes one cosmetic), then on
 * whether the change was TIER-REVEALED: a gap only the weaker model fell into is
 * a contract the catalog is currently relying on the model to supply, which is
 * the class this whole exercise exists to find.
 *
 * `not-a-catalog-gap` findings are counted and reported separately: they are the
 * denominator that keeps the list honest about how much of a run's failure the
 * catalog can actually fix.
 *
 * @param {{ findings: AttributableFinding[], weightOf?: (f: AttributableFinding) => number, severityRank?: (id: string) => number }} input
 */
export function prioritiseCatalogChanges({ findings, weightOf = () => 1, severityRank = () => 1 }) {
  const groups = new Map();
  const noChange = [];
  for (const f of findings) {
    const id = f.changeId ?? catalogChangeId(f.attribution);
    if (f.attribution.kind === 'not-a-catalog-gap') {
      noChange.push({ ...f, changeId: id });
      continue;
    }
    const g = groups.get(id) ?? {
      changeId: id,
      kind: f.attribution.kind,
      attribution: f.attribution,
      findings: [],
      closes: 0,
      severityWeight: 0,
      tierRevealed: false,
    };
    g.findings.push(f.id);
    g.closes += 1;
    g.severityWeight += severityRank(f.severity) * weightOf(f);
    if (f.tierRevealed) g.tierRevealed = true;
    groups.set(id, g);
  }
  const ranked = [...groups.values()].sort(
    (a, b) =>
      b.closes - a.closes ||
      b.severityWeight - a.severityWeight ||
      Number(b.tierRevealed) - Number(a.tierRevealed) ||
      a.changeId.localeCompare(b.changeId),
  );
  return {
    ranked,
    notCatalogGaps: noChange,
    totalFindings: findings.length,
    // The share of findings a catalog change could close. Reported rather than
    // spun: a low number is a real and useful result (the catalog was adequate
    // and the model was not), and hiding it would make every run look productive.
    addressableShare: findings.length ? Number(((findings.length - noChange.length) / findings.length).toFixed(2)) : 0,
  };
}

/**
 * TIER DELTA. The headline is not "did it pass" — it is HOW FAR DOWN THE MODEL
 * TIER THE CATALOG KEEPS WORKING.
 *
 * Anything the strong model gets right and the weak one gets wrong names a
 * contract the catalog leaves IMPLICIT and is currently relying on the model to
 * supply from its priors. Those are the findings worth acting on first, so they
 * come back tagged `tierRevealed` for the prioritiser.
 *
 * Which run is stronger is the CALLER's statement, never inferred from a model
 * name: this module has no business ranking vendors.
 *
 * @typedef {{ scenarioId: string, kitVersion?: string, model?: string, tier?: string, normalized: number, verdict: string, rows: { id: string, gate: string, weight: number, score: number }[] }} Evaluation
 * @param {{ strong: Evaluation, weak: Evaluation, strongFindings?: AttributableFinding[], weakFindings?: AttributableFinding[], allowVersionSkew?: boolean }} input
 */
export function tierDelta({ strong, weak, strongFindings = [], weakFindings = [], allowVersionSkew = false }) {
  if (strong.scenarioId !== weak.scenarioId) {
    throw new Error(
      `cannot compare tiers across scenarios (${strong.scenarioId} vs ${weak.scenarioId}). A tier delta is only meaningful over the same task.`,
    );
  }
  if (!allowVersionSkew && strong.kitVersion && weak.kitVersion && strong.kitVersion !== weak.kitVersion) {
    throw new Error(
      `the two runs were packed from different kit versions (${strong.kitVersion} vs ${weak.kitVersion}). The packs differ, so the delta would confound the model with the catalog. Re-run one, or pass --allow-version-skew and say so in the report.`,
    );
  }

  const byId = (r) => new Map(r.rows.map((row) => [row.id, row]));
  const s = byId(strong);
  const w = byId(weak);
  const ids = [...new Set([...s.keys(), ...w.keys()])].sort();

  const rows = ids.map((id) => {
    const sr = s.get(id);
    const wr = w.get(id);
    return {
      id,
      gate: (sr ?? wr).gate,
      weight: (sr ?? wr).weight,
      strong: sr ? sr.score : null,
      weak: wr ? wr.score : null,
      delta: sr && wr ? Number((sr.score - wr.score).toFixed(2)) : null,
    };
  });

  // The threshold is stated, not tuned: "the strong model clearly had it" and
  // "the weak model clearly did not". A dimension sitting between the two is
  // reported in `rows` and deliberately not claimed as an implicit contract.
  const STRONG_HAS_IT = 8;
  const WEAK_LACKS_IT = 5;
  const implicit = rows.filter((r) => r.strong !== null && r.weak !== null && r.strong >= STRONG_HAS_IT && r.weak <= WEAK_LACKS_IT);
  const implicitIds = new Set(implicit.map((r) => r.id));

  const revealed = weakFindings
    .filter((f) => implicitIds.has(f.dimension))
    .map((f) => ({ ...f, tierRevealed: true }));

  return {
    scenarioId: strong.scenarioId,
    thresholds: { strongHasIt: STRONG_HAS_IT, weakLacksIt: WEAK_LACKS_IT },
    strong: { model: strong.model, tier: strong.tier, normalized: strong.normalized, verdict: strong.verdict },
    weak: { model: weak.model, tier: weak.tier, normalized: weak.normalized, verdict: weak.verdict },
    rows,
    implicitContracts: implicit.map((r) => r.id),
    revealedFindings: revealed,
    // Held-at is the metric to quote: the weakest tier at which the catalog is
    // still carrying the task on its own.
    heldAtWeakTier: weak.verdict === 'scored' && weak.normalized >= STRONG_HAS_IT,
    strongFindingCount: strongFindings.length,
    weakFindingCount: weakFindings.length,
  };
}
