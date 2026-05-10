const fs = require('fs');

const css = fs.readFileSync('output.css', 'utf8');
let html = fs.readFileSync('index.html', 'utf8');

// Replace either the external link or a previously inlined style block
html = html.replace(
  /<link rel="stylesheet" href="output\.css">|<style data-inline-css>[\s\S]*?<\/style>/,
  `<style data-inline-css>${css}</style>`
);

fs.writeFileSync('index.html', html);
console.log('Done.');
