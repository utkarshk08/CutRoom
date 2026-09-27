/* eslint-disable typescript/no-floating-promises */

import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyStorageError, storageNeedsAttention } from '../lib/project-storage.ts';

test('storage errors are classified into actionable recovery states', () => {
  assert.equal(classifyStorageError(new DOMException('full', 'QuotaExceededError')).kind, 'quota');
  assert.equal(classifyStorageError(new DOMException('blocked', 'SecurityError')).kind, 'unavailable');
  assert.equal(classifyStorageError(new DOMException('stopped', 'AbortError')).kind, 'transient');
  assert.equal(classifyStorageError(new DOMException('clone', 'DataCloneError')).kind, 'serialization');
});

test('storage headroom warning accounts for an incoming write', () => {
  const mb = 1024 * 1024;
  assert.equal(storageNeedsAttention({ supported: true, usage: 50 * mb, quota: 100 * mb }, 29 * mb), false);
  assert.equal(storageNeedsAttention({ supported: true, usage: 50 * mb, quota: 100 * mb }, 30 * mb), true);
  assert.equal(storageNeedsAttention({ supported: true, usage: 0, quota: 0 }, 1), false);
});
