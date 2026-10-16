import { readdir, rm, mkdir, copyFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const source = fileURLToPath(new URL('../src/', import.meta.url));
const destination = fileURLToPath(new URL('../dist/', import.meta.url));
await rm(destination, { recursive: true, force: true });
let count = 0;
async function copy(from, to) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (entry.isDirectory()) await copy(join(from, entry.name), join(to, entry.name));
    else if (entry.isFile() && entry.name.endsWith('.js')) {
      const text = await readFile(join(from, entry.name), 'utf8');
      if (/\b(?:from\s*|import\s*\()\s*['"](?:node:|[^./])/.test(text)) {
        throw Error(`Runtime import must be a relative browser module: ${entry.name}`);
      }
      await copyFile(join(from, entry.name), join(to, entry.name));
      count++;
    }
  }
}
await copy(source, destination);
if (!count) throw Error('No runtime modules to build');
console.log(`Built ${count} ESM modules (no rendering implementation yet).`);
