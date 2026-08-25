const fs = require('fs');
const path = require('path');

fs.mkdirSync('public', { recursive: true });
fs.mkdirSync('public/icons', { recursive: true });

const files = ['index.html', 'style.css', 'app.js', 'manifest.json', 'sw.js'];
files.forEach(f => {
  if (fs.existsSync(f)) {
    fs.copyFileSync(f, path.join('public', f));
  }
});

if (fs.existsSync('icons/icon.svg')) {
  fs.copyFileSync('icons/icon.svg', path.join('public/icons', 'icon.svg'));
}

console.log('Build complete: All public files synchronized successfully.');
