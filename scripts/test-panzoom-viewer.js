const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const frontendPackage = fs.readFileSync(path.join(root, 'frontend/package.json'), 'utf8');
const frontendIndex = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
const distIndex = fs.readFileSync(path.join(root, 'app/static/dist/index.html'), 'utf8');
const screenPreview = fs.readFileSync(path.join(root, 'frontend/src/composables/useScreenPreview.js'), 'utf8');
const screenModal = fs.readFileSync(path.join(root, 'frontend/src/components/ScreenFrameModal.vue'), 'utf8');
const remoteInputApp = fs.readFileSync(path.join(root, 'frontend/src/components/RemoteInputApp.vue'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'frontend/src/styles.css'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'app/static/sw.js'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const packageJson = JSON.parse(frontendPackage);
assert(packageJson.dependencies.photoswipe, 'frontend package declares PhotoSwipe dependency');
assert(!fs.existsSync(path.join(root, 'app/static/vendor/panzoom.min.js')), 'vendored Panzoom file was removed');
assert(!frontendIndex.includes('/static/vendor/panzoom.min.js'), 'frontend shell no longer loads vendored Panzoom');
assert(!distIndex.includes('/static/vendor/panzoom.min.js'), 'built frontend shell no longer loads vendored Panzoom');
assert(!swJs.includes('/static/vendor/panzoom.min.js'), 'service worker no longer caches vendored Panzoom');
assert(screenPreview.includes("from 'photoswipe'"), 'screen preview composable imports PhotoSwipe');
assert(screenPreview.includes("import 'photoswipe/style.css'"), 'screen preview composable imports PhotoSwipe styles');
assert(screenPreview.includes('naturalWidth'), 'PhotoSwipe uses the loaded image natural width for slide metadata');
assert(screenPreview.includes('naturalHeight'), 'PhotoSwipe uses the loaded image natural height for slide metadata');
assert(!screenPreview.includes('instance.isDestroying = true'), 'PhotoSwipe opening cleanup does not pre-mark the instance as destroying');
assert(screenPreview.includes('opener.isOpening = false'), 'PhotoSwipe opening cleanup clears opening state before destroy');
assert(!screenPreview.includes('initScreenFramePanzoom'), 'Panzoom initialization was removed');
assert(!screenPreview.includes('toggleScreenFrameZoom'), 'custom double-click zoom toggle was removed');
assert(!screenPreview.includes('handleFrameTouchEnd'), 'custom double-tap zoom handler was removed');
assert(screenModal.includes('screen-frame-close'), 'screen modal keeps the custom close button');
assert(!screenModal.includes('screen-frame-stage'), 'screen modal no longer renders custom Panzoom stage');
assert(!remoteInputApp.includes('toggleScreenFrameZoom'), 'app no longer wires custom double-click zoom');
assert(!remoteInputApp.includes('handleFrameTouchEnd'), 'app no longer wires custom double-tap zoom');
assert(styles.includes('.pswp'), 'styles include PhotoSwipe layering overrides');
assert(styles.includes('.screen-frame-close.align-right'), 'styles keep sliding close-button alignment');

console.log('PASS: PhotoSwipe viewer static integration checks passed');
