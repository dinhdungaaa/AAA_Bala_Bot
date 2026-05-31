import fs from 'fs';

const filePath = 'd:\\Vibe Code\\AAA Bala Bot\\src\\App.tsx';
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('id="auth-portal"')) {
    console.log(`Found id="auth-portal" at line ${i + 1}:`);
    console.log(lines.slice(i, i + 50).join('\n'));
    break;
  }
}
