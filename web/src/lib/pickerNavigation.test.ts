import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextHighlightedIndex } from './pickerNavigation.ts';

test('down moves to the next index', () => {
  assert.equal(nextHighlightedIndex(0, 3, 'down'), 1);
});

test('down wraps from the last index back to 0', () => {
  assert.equal(nextHighlightedIndex(2, 3, 'down'), 0);
});

test('up moves to the previous index', () => {
  assert.equal(nextHighlightedIndex(1, 3, 'up'), 0);
});

test('up wraps from 0 back to the last index', () => {
  assert.equal(nextHighlightedIndex(0, 3, 'up'), 2);
});

test('a single-item list always stays at index 0', () => {
  assert.equal(nextHighlightedIndex(0, 1, 'down'), 0);
  assert.equal(nextHighlightedIndex(0, 1, 'up'), 0);
});

test('an empty list stays at index 0 (no suggestions to highlight)', () => {
  assert.equal(nextHighlightedIndex(0, 0, 'down'), 0);
  assert.equal(nextHighlightedIndex(0, 0, 'up'), 0);
});
