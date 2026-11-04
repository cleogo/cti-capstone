import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSheet } from '../scripts/build-sheets';

const GOOD = `---
slug: bluetti-premium-150
kind: model            # model | type
codes: [PWR-001-06]
sources:
  - https://www.bluettipower.eu/products/ac180p
---
## Specs
- Capacity: 1,440 Wh
- Rated AC output: 1,800 W
## Usage
Home backup.
## Advantages
Fast charging.
## Cautions
Not for aircon.
`;

test('accepts the plan example', () => {
  const s = buildSheet(GOOD, 'good.md');
  assert.equal(s.slug, 'bluetti-premium-150');
  assert.equal(s.kind, 'model');
  assert.deepEqual(s.codes, ['PWR-001-06']);
  assert.deepEqual(s.sources, ['https://www.bluettipower.eu/products/ac180p']);
  assert.deepEqual(s.specs[1], { label: 'Rated AC output', value: '1,800 W' });
  assert.equal(s.usage, 'Home backup.');
  assert.equal(s.cautions, 'Not for aircon.');
});

test('rejects a missing section', () => {
  assert.throws(() => buildSheet(GOOD.replace('## Usage\nHome backup.\n', ''), 'x.md'), /x\.md.*Usage/);
});

test('rejects sections out of order', () => {
  const swapped = GOOD.replace('## Advantages\nFast charging.\n## Cautions\nNot for aircon.\n', '## Cautions\nNot for aircon.\n## Advantages\nFast charging.\n');
  assert.throws(() => buildSheet(swapped, 'x.md'), /order/);
});

test('rejects a code not in the catalogue', () => {
  assert.throws(() => buildSheet(GOOD.replace('PWR-001-06', 'XXX-999-99'), 'x.md'), /XXX-999-99/);
});

test('rejects an empty sources list', () => {
  const none = GOOD.replace('  - https://www.bluettipower.eu/products/ac180p\n', '');
  assert.throws(() => buildSheet(none, 'x.md'), /sources/);
});

test('rejects a peso sign in the body', () => {
  assert.throws(() => buildSheet(GOOD.replace('Home backup.', 'Costs ₱58,719.'), 'x.md'), /₱/);
});
