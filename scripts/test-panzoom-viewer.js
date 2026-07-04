const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'app/static/index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'app/static/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'app/static/sw.js'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const vendorIndex = indexHtml.indexOf('/static/vendor/panzoom.min.js');
const appIndex = indexHtml.indexOf('/static/app.js');
assert(vendorIndex !== -1, 'index.html references vendored Panzoom');
assert(appIndex !== -1, 'index.html references app.js');
assert(vendorIndex < appIndex, 'Panzoom loads before app.js');
assert(swJs.includes('/static/vendor/panzoom.min.js'), 'service worker caches vendored Panzoom');
assert(appJs.includes('initScreenFramePanzoom'), 'app.js defines Panzoom initialization');
assert(appJs.includes('destroyScreenFramePanzoom'), 'app.js defines Panzoom cleanup');
assert(appJs.includes('toggleScreenFrameZoom'), 'app.js defines double-click/tap zoom toggle');
assert(!appJs.includes('framePinchDistance'), 'manual frame pinch state was removed');

console.log('PASS: panzoom viewer static integration checks passed');
