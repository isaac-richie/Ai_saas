import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { AUTO_EDIT_STYLES, autoEditInstruction, isAutoEditStyle, openingTitle } = await loadTs('core/services/auto-edit.ts');

describe('one-tap auto-edit', () => {
  it('every style asks for a complete cut with an ending, within the request limit', () => {
    for (const { id } of AUTO_EDIT_STYLES) {
      for (const music of [true, false]) {
        const text = autoEditInstruction(id, music);
        assert.ok(text.length > 100 && text.length < 2000, `${id} ${text.length}`);
        assert.match(text, /fade/i);
        assert.match(text, /complete first cut/);
      }
    }
  });
  it('only asks for beat sync when there is music', () => {
    assert.match(autoEditInstruction('music', true), /re-timing the cuts to its beat/);
    assert.match(autoEditInstruction('music', false), /no music, so do not try to sync/);
  });
  it('recognises only known styles', () => {
    assert.ok(isAutoEditStyle('trailer'));
    assert.ok(!isAutoEditStyle('horror') && !isAutoEditStyle(undefined));
  });
  it('titles the film with its project name, but not placeholder names', () => {
    assert.equal(openingTitle('  Golden   Hour  '), 'Golden Hour');
    assert.equal(openingTitle('Untitled project'), null);
    assert.equal(openingTitle('New project 3'), null);
    assert.equal(openingTitle(''), null);
    assert.equal(openingTitle(undefined), null);
    assert.equal(openingTitle('x'.repeat(200)).length, 60);
  });
});
