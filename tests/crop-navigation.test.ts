/* eslint-disable typescript/no-floating-promises */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginMobileCrop,
  endMobileCrop,
  type MobileTool,
} from '../lib/crop-navigation.ts';

const mobileTools: MobileTool[] = ['pieces', 'wall', 'assistant', 'inspect'];

test('mobile crop always opens on the wall and remembers its launching tool', () => {
  for (const launchingTool of mobileTools) {
    assert.deepEqual(beginMobileCrop(launchingTool), {
      activeTool: 'wall',
      returnTool: launchingTool,
    });
  }
});

test('Done and Cancel can both restore the tool that launched crop mode', () => {
  for (const launchingTool of mobileTools) {
    const navigation = beginMobileCrop(launchingTool);

    const toolAfterDone = endMobileCrop(navigation);
    const toolAfterCancel = endMobileCrop(navigation);

    assert.equal(toolAfterDone, launchingTool);
    assert.equal(toolAfterCancel, launchingTool);
  }
});
