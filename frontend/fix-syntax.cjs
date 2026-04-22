const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const fullPath = path.join(dir, f);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      const regex = /\}\)\.format\(value\)\s*\}/g;
      
      let newContent = content.replace(regex, '}');
      
      if (content !== newContent) {
        fs.writeFileSync(fullPath, newContent);
        console.log('Fixed ' + fullPath);
      }
    }
  }
}

processDir('src');
