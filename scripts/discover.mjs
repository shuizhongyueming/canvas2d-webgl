import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Walk regular files only; symlinked worktrees/assets cannot leak into a run. */
export async function discover(root, suffix) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await discover(path, suffix));
    else if (entry.isFile() && entry.name.endsWith(suffix)) files.push(path);
  }
  return files.sort();
}
