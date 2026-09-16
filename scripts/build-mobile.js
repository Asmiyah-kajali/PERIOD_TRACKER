const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const webDir = path.join(projectRoot, 'www');
const assets = [
  'index.html', 'login.html', 'signup.html', 'styles.css', 'auth.css',
  'app.js', 'auth.js', 'rythora-logo.svg'
];

fs.rmSync(webDir, { recursive: true, force: true });
fs.mkdirSync(webDir, { recursive: true });
for (const asset of assets) fs.copyFileSync(path.join(projectRoot, asset), path.join(webDir, asset));
console.log('Mobile web bundle created in www/.');
