/**
 * Compilazione dell'app con esbuild.
 *
 *   node scripts/build.mjs            -> dist/index.html (file unico, apribile anche con doppio clic)
 *   node scripts/build.mjs --watch    -> ricompila a ogni modifica e serve su http://localhost:5173
 *
 * La configurazione (DEMO / produzione) è nel blocco SDF_CONFIG di index.html e si può
 * cambiare dopo la compilazione, senza ricompilare.
 */
import * as esbuild from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(radice, 'dist');
const watch = process.argv.includes('--watch');

const opzioni = {
  entryPoints: [resolve(radice, 'src/main.tsx')],
  bundle: true,
  write: false,
  outdir: dist,
  format: 'iife',
  target: ['es2020', 'chrome100', 'safari15', 'firefox100'],
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
  jsx: 'automatic',
  // carattere e logo vengono incorporati nel file unico (nessuna richiesta verso l'esterno)
  loader: { '.css': 'css', '.woff2': 'dataurl', '.png': 'dataurl' },
  logLevel: 'info',
};

/** Inserisce JavaScript e CSS nel modello HTML, producendo un file unico. */
async function componi(risultato) {
  const js = risultato.outputFiles.find((f) => f.path.endsWith('.js'))?.text ?? '';
  const css = risultato.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
  const modello = await readFile(resolve(radice, 'index.html'), 'utf8');
  // </script> dentro il codice chiuderebbe il tag: lo neutralizzo
  const jsSicuro = js.replace(/<\/script/gi, '<\\/script');
  const html = modello
    .replace('<!--CSS-->', () => `<style>${css}</style>`)
    .replace('<!--JS-->', () => `<script>${jsSicuro}</script>`);
  await mkdir(dist, { recursive: true });
  await writeFile(resolve(dist, 'index.html'), html);
  const kb = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`dist/index.html (${kb} KB)`);
  if (!watch) {
    // copia della DEMO versionata nel repository: si apre con un doppio clic, senza installare nulla
    await mkdir(resolve(radice, 'demo'), { recursive: true });
    await writeFile(resolve(radice, 'demo/Gestione-ore-formazione-DEMO.html'), html);
    console.log('demo/Gestione-ore-formazione-DEMO.html');
  }
}

if (watch) {
  const ctx = await esbuild.context({
    ...opzioni,
    plugins: [{ name: 'componi', setup: (b) => b.onEnd((r) => r.errors.length || componi(r)) }],
  });
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: dist, port: 5173 });
  console.log(`Sviluppo su http://localhost:${port}`);
} else {
  await componi(await esbuild.build(opzioni));
}
