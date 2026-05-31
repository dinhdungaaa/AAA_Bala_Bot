import fs from 'fs';

const filePath = 'd:\\Vibe Code\\AAA Bala Bot\\src\\App.tsx';
const content = fs.readFileSync(filePath, 'utf8');

const idx = content.indexOf('setShowAuthModal');
if (idx !== -1) {
  console.log('--- setShowAuthModal references ---');
  let searchIdx = 0;
  while (true) {
    const nextIdx = content.indexOf('setShowAuthModal', searchIdx);
    if (nextIdx === -1) break;
    console.log(`Reference at position ${nextIdx}:`);
    console.log(content.substring(nextIdx - 100, nextIdx + 200));
    console.log('------------------');
    searchIdx = nextIdx + 1;
  }
} else {
  console.log('setShowAuthModal not found');
}
