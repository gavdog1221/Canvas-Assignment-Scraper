// build.mjs
import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--prod');

const buildOptions = {
  entryPoints: ['src/content/index.js'],
  outfile: 'dist/content.js',
  bundle: true,
  format: 'iife',
  target: ['firefox115', 'chrome110'],
  sourcemap: isProd ? false : 'inline',
  minify: isProd,
  logLevel: 'info',
  legalComments: 'none',
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('[esbuild] watching src/content/ for changes... (Ctrl+C to stop)');
} else {
  await esbuild.build(buildOptions);
  console.log(`[esbuild] built dist/content.js${isProd ? ' (production, minified)' : ' (dev, sourcemapped)'}`);
}
