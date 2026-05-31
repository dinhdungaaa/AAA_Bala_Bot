import fs from 'fs';

const filePath = 'd:\\Vibe Code\\AAA Bala Bot\\src\\App.tsx';
const content = fs.readFileSync(filePath, 'utf8');

const idx = content.indexOf('showAuthModal');
if (idx !== -1) {
  console.log('--- showAuthModal references ---');
  let searchIdx = 0;
  while (true) {
    const nextIdx = content.indexOf('showAuthModal', searchIdx);
    if (nextIdx === -1) break;
    console.log(`Reference at position ${nextIdx}:`);
    console.log(content.substring(nextIdx - 100, nextIdx + 200));
    console.log('------------------');
    searchIdx = nextIdx + 1;
  }
}
