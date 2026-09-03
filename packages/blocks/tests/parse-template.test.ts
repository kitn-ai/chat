/**
 * The binding grammar (spec 3.1 as amended by 8b). Every rule has a case, and
 * every REFUSAL has a case: a parser that accepts everything and a parser that
 * is correct look identical from the outside until you plant the bad input.
 */
import { describe, expect, it } from 'vitest';
import { parseTemplate } from '../src/contract/parse-template';

// Every fixture page carries the host stand-in the real blocks carry, plus a
// `data-block-root` wrapper, because that is the shape the contract requires
// and a fixture without it would test a page no renderer accepts.
const page = (body: string) =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<link rel="stylesheet" href="./b.css" />\n</head>\n<body>\n<p class="host-stand-in">stand-in</p>\n<div data-block-root>\n${body}\n</div>\n</body>\n</html>\n`;

// The same page with the body content placed BESIDE the block root rather than
// inside it. Only one refusal needs this: `*for` needs a parent ELEMENT, and
// inside the root wrapper it always has one, so a fixture that wrapped the
// repeated element could never fire the rule it claims to test.
const beside = (body: string) =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n</head>\n<body>\n<div data-block-root></div>\n${body}\n</body>\n</html>\n`;

/** The block root's element children -- what the per-kind cases below assert
 *  against, now that the fixture wraps them. */
const rootChildren = (t: ReturnType<typeof ok>) => t.blockRoot.children.filter((n) => n.type === 'element');

const ok = (body: string) => {
  const out = parseTemplate(page(body), 'fixture/b.html');
  if (out.errors.length) throw new Error(`unexpected errors: ${out.errors.join(' | ')}`);
  return out.template!;
};
const errsFor = (body: string) => parseTemplate(page(body), 'fixture/b.html').errors.join(' | ');

describe('the five binding kinds', () => {
  it('.prop binds a property, with the AUTHORED case preserved', () => {
    const t = ok('<kai-thread .messages="messages" .activeId="activeId"></kai-thread>');
    const el = rootChildren(t)[0];
    expect(el.type === 'element' && el.bindings.map((b) => [b.kind, b.name, b.value])).toEqual([
      ['prop', 'messages', 'messages'],
      ['prop', 'activeId', 'activeId'],
    ]);
  });

  it('.prop accepts the kebab spelling of the same property', () => {
    const t = ok('<kai-conversation-item .conversation-id="id"></kai-conversation-item>');
    const el = rootChildren(t)[0];
    expect(el.type === 'element' && el.bindings[0].name).toBe('conversationId');
  });

  it('.textContent is a property binding and keeps its case', () => {
    const t = ok('<span .textContent="recentTitle"></span>');
    const el = rootChildren(t)[0];
    expect(el.type === 'element' && el.bindings[0]).toMatchObject({ kind: 'prop', name: 'textContent' });
  });

  it(':attr binds a scalar attribute and keeps the authored attribute name', () => {
    const t = ok('<kai-button :hidden="backHidden"></kai-button>');
    const el = rootChildren(t)[0];
    expect(el.type === 'element' && el.bindings[0]).toMatchObject({ kind: 'attr', name: 'hidden', value: 'backHidden' });
  });

  it('@event binds an action, kai- or native', () => {
    const t = ok('<kai-button @kai-click="back"></kai-button><button @click="close"></button>');
    const kinds = rootChildren(t).map((n) => (n.type === 'element' ? n.bindings[0] : null));
    expect(kinds).toMatchObject([{ kind: 'event', name: 'kai-click', value: 'back' }, { kind: 'event', name: 'click', value: 'close' }]);
  });

  it('#ref names a handle, and every ref name is collected', () => {
    const t = ok('<kai-dock #ref="dock"><kai-view-stack #ref="stack"></kai-view-stack></kai-dock>');
    expect(t.refs).toEqual(['dock', 'stack']);
  });

  it('seed: carries a literal, not a field', () => {
    const t = ok('<kai-view-stack seed:view="home"></kai-view-stack>');
    const el = rootChildren(t)[0];
    expect(el.type === 'element' && el.bindings[0]).toMatchObject({ kind: 'seed', name: 'view', value: 'home' });
  });

  it('*for opens a scope in which row.<field> is legal, and records the key', () => {
    const t = ok(
      '<kai-conversations><kai-conversation-item *for="row of rows" :key="row.id" :unread="row.unread">' +
        '<span .textContent="row.title"></span></kai-conversation-item></kai-conversations>',
    );
    const list = rootChildren(t)[0];
    const item = list.type === 'element' ? list.children.find((c) => c.type === 'element') : undefined;
    expect(item && item.type === 'element' && item.repeat).toMatchObject({ item: 'row', list: 'rows', key: 'row.id' });
  });

  it('reads *for wherever the author wrote it in the attribute order', () => {
    // The scope a `*for` opens belongs to the ELEMENT, not to the attributes
    // after it. An attribute loop that discovered the repeat midway refused
    // `row.unread` here for lacking the `*for` sitting two attributes along.
    const t = ok('<ul><li :unread="row.unread" *for="row of rows" :key="row.id"></li></ul>');
    const list = rootChildren(t)[0];
    const item = list.type === 'element' ? list.children.find((c) => c.type === 'element') : undefined;
    expect(item && item.type === 'element' && item.repeat).toMatchObject({ item: 'row', list: 'rows', key: 'row.id' });
    expect(item && item.type === 'element' && item.bindings[0]).toMatchObject({ kind: 'attr', name: 'unread', value: 'row.unread' });
  });

  it('a plain attribute stays a literal', () => {
    const t = ok('<kai-button variant="ghost" full></kai-button>');
    const el = rootChildren(t)[0];
    expect(el.type === 'element' && el.attrs).toEqual([{ name: 'variant', value: 'ghost' }, { name: 'full', value: '' }]);
    expect(el.type === 'element' && el.bindings).toEqual([]);
  });
});

describe('every refusal', () => {
  it('refuses an expression, and names the fix', () => {
    const out = errsFor('<kai-button :hidden="!drilled"></kai-button>');
    expect(out).toContain('!drilled');
    expect(out).toContain('identifier, never an expression');
    expect(out).toContain('controller');
  });

  it('refuses a call and a comparison too', () => {
    expect(errsFor('<span .textContent="fmt(time)"></span>')).toContain('never an expression');
    expect(errsFor('<span :hidden="count === 0"></span>')).toContain('never an expression');
  });

  it('refuses a dotted value outside a *for scope', () => {
    expect(errsFor('<span .textContent="row.title"></span>')).toContain('only legal inside the `*for`');
  });

  it('refuses a dotted value from the wrong loop variable', () => {
    expect(errsFor('<ul><li *for="row of rows" :key="row.id" .textContent="other.title"></li></ul>'))
      .toContain('only legal inside the `*for`');
  });

  it('refuses *for without :key', () => {
    expect(errsFor('<ul><li *for="row of rows"></li></ul>')).toContain(':key is mandatory');
  });

  it('refuses a :key that is not dotted from the loop item', () => {
    expect(errsFor('<ul><li *for="row of rows" :key="id"></li></ul>'))
      .toContain(':key="id" must be dotted from the loop item, e.g. :key="row.id".');
  });

  it('refuses a :key dotted from the wrong loop item', () => {
    expect(errsFor('<ul><li *for="row of rows" :key="other.id"></li></ul>'))
      .toContain(':key="other.id" must be dotted from the loop item, e.g. :key="row.id".');
  });

  it('refuses :key without *for', () => {
    expect(errsFor('<li :key="a.id"></li>')).toContain(':key="a.id" is only legal on an element carrying `*for`');
  });

  it('refuses a *for value that is not `item of list`', () => {
    expect(errsFor('<ul><li *for="rows" :key="row.id"></li></ul>')).toContain('*for="item of list"');
  });

  it('refuses a *for on a top-level body element (nothing to rebuild into)', () => {
    const errs = parseTemplate(beside('<li *for="row of rows" :key="row.id"></li>'), 'fixture/b.html').errors.join(' | ');
    expect(errs).toContain('needs a parent element');
  });

  it('refuses *for and #ref on the same element', () => {
    expect(errsFor('<ul><li *for="row of rows" :key="row.id" #ref="x"></li></ul>')).toContain('cannot also carry `#ref`');
  });

  it('refuses a *for nested inside another *for subtree', () => {
    const errs = errsFor('<ul><li *for="row of rows" :key="row.id"><span *for="tag of tags" :key="tag.id"></span></li></ul>');
    expect(errs).toContain('nested `*for`');
    expect(errs).toContain('lift');
  });

  it('refuses a duplicate #ref name', () => {
    expect(errsFor('<kai-dock #ref="a"></kai-dock><kai-dock #ref="a"></kai-dock>')).toContain('#ref="a" is declared twice');
  });

  it('refuses an unknown prefix rather than treating it as a literal', () => {
    const errs = errsFor('<kai-button ?hidden="x"></kai-button>');
    expect(errs).toContain('?hidden');
    // The grammar has no `?attr` (spec 8a.2): the refusal names the spelling
    // that does the job, or the author has to guess.
    expect(errs).toContain(':hidden');
  });

  it('refuses an authored module script: the entry script is GENERATED now', () => {
    expect(errsFor('<script type="module" src="./b.js"></script>')).toContain('GENERATED');
  });

  it('refuses a hand-authored <template>: parse5 hides its children on .content', () => {
    const errs = errsFor('<template id="t"><span .textContent="a"></span></template>');
    expect(errs).toContain('<template>');
    expect(errs).toContain('GENERATED from `*for`');
  });

  it('refuses a script in <head> too, not only in <body>', () => {
    const headScript = (tag: string) =>
      `<!doctype html>\n<html lang="en">\n<head>\n${tag}\n</head>\n<body>\n<div data-block-root></div>\n</body>\n</html>\n`;
    expect(parseTemplate(headScript('<script type="module" src="./b.js"></script>'), 'fixture/b.html').errors.join(' | '))
      .toContain('GENERATED');
    // An inline script has no src, and the refusal must not invent one: the
    // message it prints is the only thing the author has to go on.
    const inline = parseTemplate(headScript('<script>window.x = 1;</script>'), 'fixture/b.html').errors.join(' | ');
    expect(inline).toContain('GENERATED');
    expect(inline).not.toContain('src=""');
  });

  it('refuses #ref inside a *for subtree', () => {
    expect(errsFor('<ul><li *for="row of rows" :key="row.id"><span #ref="x"></span></li></ul>'))
      .toContain('inside a `*for` subtree');
  });

  it('refuses seed: inside a *for subtree', () => {
    expect(errsFor('<ul><li *for="row of rows" :key="row.id"><kai-view seed:name="a"></kai-view></li></ul>'))
      .toContain('inside a `*for` subtree');
  });
});

describe('the block root', () => {
  it('is the one element renderers that emit a subtree cut at', () => {
    const t = ok('<kai-dock #ref="d"></kai-dock>');
    expect(t.blockRoot.type).toBe('element');
    expect(t.blockRoot.tag).toBe('div');
    expect(t.body.some((n) => n.type === 'element' && n.attrs.some((a) => a.name === 'class' && a.value === 'host-stand-in'))).toBe(true);
  });

  it('refuses a page with none, naming what the marker is for', () => {
    const bare = `<!doctype html>\n<html lang="en"><head></head><body><kai-dock></kai-dock></body></html>\n`;
    const errs = parseTemplate(bare, 'fixture/b.html').errors.join(' | ');
    expect(errs).toContain('data-block-root');
    expect(errs).toContain('Mark the ONE element that IS the block');
  });

  it('refuses a page with two, naming both lines', () => {
    const two = `<!doctype html>\n<html lang="en"><head></head><body>\n<div data-block-root></div>\n<div data-block-root></div>\n</body></html>\n`;
    const errs = parseTemplate(two, 'fixture/b.html').errors.join(' | ');
    expect(errs).toContain('2 elements carry');
  });
});

describe('what the renderers need out of it', () => {
  it('collects the kai tags, sorted and deduped', () => {
    const t = ok('<kai-dock><kai-panel></kai-panel><kai-dock></kai-dock></kai-dock>');
    expect(t.kaiTags).toEqual(['kai-dock', 'kai-panel']);
  });

  it('records the stylesheets and leaves the head slice verbatim', () => {
    const t = ok('<p>x</p>');
    expect(t.stylesheets).toEqual(['b.css']);
    expect(t.headInner).toContain('<meta charset="utf-8" />');
  });

  it('numbers a marker for every element carrying a binding, in document order (the unbound wrapper takes none)', () => {
    const t = ok('<kai-dock #ref="d"><span>plain</span><kai-button :hidden="h"></kai-button></kai-dock>');
    const dock = rootChildren(t)[0];
    const button = dock.type === 'element' ? dock.children.find((c) => c.type === 'element' && c.tag === 'kai-button') : undefined;
    expect(dock.type === 'element' && dock.marker).toBe(0);
    expect(button && button.type === 'element' && button.marker).toBe(1);
    expect(t.markerCount).toBe(2);
  });

  it('keeps text and comments as nodes', () => {
    const t = ok('<kai-panel-header>Support<!-- note --></kai-panel-header>');
    const header = rootChildren(t)[0];
    const kinds = header.type === 'element' ? header.children.map((c) => c.type) : [];
    expect(kinds).toEqual(['text', 'comment']);
  });
});
