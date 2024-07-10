const esbuild = require('esbuild')

esbuild.build({
  entryPoints: ['./service-worker.js'],
  bundle: true,
  outfile: 'service-worker-bundled.js',
  format: 'esm',
  target: ['es2020'],
  minify: false,
  sourcemap: true,
  logLevel: 'info'
}).catch(() => process.exit(1))
