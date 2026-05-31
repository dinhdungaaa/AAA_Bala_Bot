import fs from 'fs';

const filePath = 'd:\\Vibe Code\\AAA Bala Bot\\src\\App.tsx';
const content = fs.readFileSync(filePath, 'utf8');

const idx = content.indexOf('id="auth-portal"');
if (idx !== -1) {
  console.log('--- Context of id="auth-portal" ---');
  console.log(content.substring(idx - 2500, idx + 1000));
} else {
  console.log('id="auth-portal" not found');
}
