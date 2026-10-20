// Copies finished project outputs into samples/<project>/ for the README (deck sheet, feature graphic, slides).
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT } from '../src/core/paths.js';
import { loadProject } from '../src/core/project.js';

const names = process.argv.slice(2);
if (!names.length) {
  console.log('usage: node scripts/collect-samples.js <project>[:<sample-name>] [...]');
  process.exit(1);
}

for (const arg of names) {
  const [name, alias = name] = arg.split(':');
  const p = await loadProject(name);
  const exportDir = path.join(p.paths.export, ...(p.app.locales ? [p.app.locales[0]] : []));
  const out = path.join(ROOT, 'samples', alias);
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(path.join(out, 'slides'), { recursive: true });
  await sharp(path.join(p.paths.runs, 'contact-sheet.png')).png({ compressionLevel: 9, palette: false }).toFile(path.join(out, 'deck.png'));
  for (const f of p.exports.feature) await fs.copyFile(path.join(exportDir, 'feature', f), path.join(out, f));
  // Half-size slides keep the repo light; full-size PNGs come from `mockup export`.
  for (const f of p.exports.phone) {
    await sharp(path.join(exportDir, 'phone', f)).resize(540).png({ compressionLevel: 9 }).toFile(path.join(out, 'slides', f));
  }
  await fs.writeFile(path.join(out, 'plan.json'), JSON.stringify(p.plan, null, 2) + '\n');
  await fs.writeFile(path.join(out, 'app.json'), JSON.stringify(p.app, null, 2) + '\n');
  console.log(`samples/${alias}: deck.png, ${p.exports.feature.length} feature graphic, ${p.exports.phone.length} slides, plan.json, app.json`);
}
