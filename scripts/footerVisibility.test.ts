import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canViewFooterResources } from '../src/lib/footerVisibility';

test('visitors and regular users cannot view footer resources', () => {
  assert.equal(canViewFooterResources(false, false), false);
});
test('resources remain hidden until admin verification completes', () => {
  assert.equal(canViewFooterResources(true, true), false);
});
test('verified admins can view footer resources', () => {
  assert.equal(canViewFooterResources(true, false), true);
});