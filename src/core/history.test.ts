import { expect, it } from 'vitest';
import { SceneHistory } from './history';

it('coalesces a slider gesture, restores visibility/deletion and branches after undo', () => {
  const h = new SceneHistory([{ name: 'cloud', visible: true, size: 1 }]);
  h.push([{ name: 'cloud', visible: true, size: 2 }], 'size', 100);
  h.push([{ name: 'cloud', visible: true, size: 3 }], 'size', 200);
  expect(h.undo()![0].size).toBe(1); expect(h.redo()![0].size).toBe(3);
  h.push([{ name: 'cloud', visible: false, size: 3 }]); h.push([]);
  expect(h.undo()![0].visible).toBe(false); expect(h.undo()![0].visible).toBe(true);
  h.push([{ name: 'cloud', visible: true, size: 9 }]); expect(h.canRedo).toBe(false);
});
it('bounds history and owns snapshots independently of caller mutation', () => {
  const initial = { value: 0 }, h = new SceneHistory(initial, 2); initial.value = 99;
  for (let value = 1; value <= 4; value++) h.push({ value });
  const undone = h.undo()!; undone.value = 99;
  expect(h.undo()).toEqual({ value: 2 }); expect(h.undo()).toBeUndefined();
  expect(h.redo()).toEqual({ value: 3 });
});
