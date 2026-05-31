import fs from 'fs';

const filePath = 'd:\\Vibe Code\\AAA Bala Bot\\src\\App.tsx';
const content = fs.readFileSync(filePath, 'utf8');

const portalIdx = content.indexOf('id="auth-portal"');
if (portalIdx !== -1) {
  console.log(content.substring(portalIdx, portalIdx + 3000));
} else {
  console.log('id="auth-portal" not found');
}
