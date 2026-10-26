import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const distRoot = path.resolve('dist');
const basePath = '/Leafmark/';

async function collectFiles(directory, result = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectFiles(fullPath, result);
    else if (!entry.name.endsWith('.map') && entry.name !== 'precache-manifest.json') result.push(fullPath);
  }
  return result;
}

const files = await collectFiles(distRoot);
const relativePaths = files
  .map((file) => path.relative(distRoot, file).split(path.sep).join('/'))
  .filter((file) => file !== 'sw.js')
  .sort();
const hash = createHash('sha256').update(relativePaths.join('\n'));
for (const relativePath of relativePaths) hash.update(await readFile(path.join(distRoot, relativePath)));
const fingerprint = hash.digest('hex').slice(0, 16);
const urls = [basePath, ...relativePaths.map((file) => `${basePath}${file}`)];

await writeFile(path.join(distRoot, 'precache-manifest.json'), `${JSON.stringify({ version: fingerprint, urls }, null, 2)}\n`);
console.log(`Prepared offline cache for ${urls.length} files (${fingerprint}).`);
