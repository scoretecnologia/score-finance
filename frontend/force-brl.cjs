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
      
      const regex = /function formatCurrency\([^)]*\)\s*\{\s*return new Intl\.NumberFormat[^}]*\}[ \t\n]*\}/g;
      const regex2 = /function formatCurrency\([^)]*\)\s*\{\s*return new Intl\.NumberFormat[^}]*\}/g;
      
      const newContent = content.replace(regex2, "function formatCurrency(value: number, _currency?: string, _locale?: string) {\n  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)\n}");
      
      if (content !== newContent) {
        fs.writeFileSync(fullPath, newContent);
        console.log('Updated ' + fullPath);
      }
    }
  }
}

processDir('src');
