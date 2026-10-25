# Arrangement reliability checkpoint

Scope: arranging existing wall items, retaining exact sizes and rigid groups,
preventing new overlaps, and restoring compositions with Undo/Redo. Local only.

## Automated checks

```sh
npm test
npm run typecheck
node --experimental-strip-types tests/arrangement-workflow.browser.mjs
```

Start the local server on port 3000 before the browser script. It uses an
isolated browser context with synthetic photos and its own local storage; it
does not read or modify the user's saved project. Set `CUTROOM_PLAYWRIGHT_PATH`
to an existing Playwright module entry and `CUTROOM_CHROME_PATH` to an existing
Chrome binary if required. No production test dependency is needed.

The browser script supplies controlled AI responses. It verifies editor
integration, not live model quality or whether a real model interprets a brief
well. The user should also try their own prompt and photos.

Coverage:

- Templates and custom AI move only placed items, preserving exact physical
  dimensions, rotations, text, borders, layer order and rigid group offsets.
- Loose pieces, locked units and standalone text stay fixed.
- Grouped photos/text reach the assistant as a single measured unit.
- One Undo/Redo restores geometry and the active composition indicator.
- A delayed AI result cannot overwrite a newer composition, label preference,
  or other edit captured in editor history, or add a spurious history step.
- No-op templates leave Undo and Redo untouched.
- A crowded but feasible wall does not gain overlaps from greedy placement.
- Angled photos are checked using their actual rotated geometry, not only
  their enclosing rectangles. Unsafe attempts fail without mutating inputs.

## Your manual checkpoint

1. Leave some photos in **Your Pieces**, place others on the wall at different
   sizes, and lock one. Try **Salon**, **Organic**, and **Diamond**. Confirm
   loose photos stay loose, the locked photo stays put, and sizes do not change.
2. Group an overlapping photo and text (or two photos), then try a template and
   your own AI brief. The group should move as one item with its overlap intact.
3. Use **Undo**, then **Redo** after each arrangement. Positions and the active
   template/custom marker should return together.
4. Try a crowded wall and a few angled photos. The arranger should either find
   a safe arrangement or explain that nothing moved; it must not silently
   shrink photos or introduce new overlaps. While AI is loading, make another
   edit and confirm the older suggestion leaves that edit untouched.

Stop here for feedback. Print/export QA, backup/share workflows and deployment
are separate checkpoints. No deployment is performed by these checks.
