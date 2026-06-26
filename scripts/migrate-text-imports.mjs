/**
 * One-off migration: use app Text (`@/src/theme/Text`) instead of RN `Text`
 * so Lato applies project-wide. Run: node scripts/migrate-text-imports.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.expo']);

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (skipDirs.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

function migrate(content, filePath) {
  const norm = filePath.replace(/\\/g, '/');
  if (norm.endsWith('src/theme/Text.tsx')) {
    return { text: content, changed: false };
  }

  let changed = false;
  const out = content.replace(
    /import\s*\{([^}]*)\}\s*from\s*['"]react-native['"]/gs,
    (full, inner) => {
      const parts = inner
        .replace(/\r/g, '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const textIdx = parts.findIndex(
        (p) => p === 'Text' || /^Text\s+as\s+\w+$/.test(p),
      );
      if (textIdx === -1) return full;

      const textPart = parts[textIdx];
      const rest = parts.filter((_, i) => i !== textIdx);
      changed = true;

      const themeLine = `import { ${textPart} } from '@/src/theme/Text';`;
      if (rest.length === 0) return themeLine;
      return `${themeLine}\nimport { ${rest.join(', ')} } from 'react-native'`;
    },
  );

  return { text: out, changed: changed && out !== content };
}

const dirs = [path.join(root, 'app'), path.join(root, 'src'), path.join(root, 'components')];
const files = dirs.flatMap((d) => (fs.existsSync(d) ? walk(d) : []));

let n = 0;
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  const { text, changed } = migrate(c, f);
  if (changed) {
    fs.writeFileSync(f, text, 'utf8');
    n++;
    console.log('Updated:', path.relative(root, f));
  }
}
console.log(`Done. ${n} files updated.`);
