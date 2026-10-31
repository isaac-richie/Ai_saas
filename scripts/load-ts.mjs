import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../src', import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { '@': src } });

export function loadTs(relativeToSrc) {
  return jiti.import(`${src}/${relativeToSrc}`);
}
