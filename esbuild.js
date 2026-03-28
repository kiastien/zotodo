const path = require('path')
const rmrf = require('rimraf')
const fs = require('fs')
const esbuild = require('esbuild')

async function build() {
  const root = __dirname
  rmrf.sync(path.join(root, 'build'))
  fs.mkdirSync(path.join(root, 'build'), { recursive: true })

  require('zotero-plugin/copy-assets')
  require('zotero-plugin/make-manifest')
  require('zotero-plugin/make-version')

  // Zotero loads bootstrap.js from the XPI root, so keep it in build/
  fs.copyFileSync(path.join(root, 'bootstrap.js'), path.join(root, 'build/bootstrap.js'))

  await esbuild.build({
    bundle: true,
    format: 'iife',
    target: ['firefox60'],
    entryPoints: [ 'content/zotodo.ts', 'content/options.ts' ],
    outdir: 'build/content',
  })
}

build().catch(err => {
  console.log(err)
  process.exit(1)
})
