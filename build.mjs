// build.mjs
import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--prod');

const shared = {
  bundle: true,
  format: 'iife',
  target: ['firefox115', 'chrome110'],
  sourcemap: isProd ? false : 'inline',
  minify: isProd,
  logLevel: 'info',
  legalComments: 'none',
};

const builds = [
  { ...shared, entryPoints: ['src/content/index.js'], outfile: 'dist/content.js' },
  { ...shared, entryPoints: ['src/registration/index.js'], outfile: 'dist/registration.js' },
];

if (isWatch) {
  const ctxs = await Promise.all(builds.map(b => esbuild.context(b)));
  await Promise.all(ctxs.map(ctx => ctx.watch()));
  console.log('[esbuild] watching src/content/ and src/registration/ for changes... (Ctrl+C to stop)');
} else {
  await Promise.all(builds.map(b => esbuild.build(b)));
  console.log(`[esbuild] built dist/content.js and dist/registration.js${isProd ? ' (production, minified)' : ' (dev, sourcemapped)'}`);
}
