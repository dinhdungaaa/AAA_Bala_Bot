import fs from 'fs';

const filePath = 'd:\\Vibe Code\\AAA Bala Bot\\src\\App.tsx';
const content = fs.readFileSync(filePath, 'utf8');

const keyIdx = content.indexOf('handleSaveSupabaseConfig');
if (keyIdx !== -1) {
  // Let's find the second or third occurrence which is likely in the JSX return statement!
  let currentIdx = keyIdx;
  for (let i = 0; i < 3; i++) {
    const nextIdx = content.indexOf('handleSaveSupabaseConfig', currentIdx + 1);
    if (nextIdx !== -1) {
      currentIdx = nextIdx;
    }
  }
  console.log('--- Config section in UI ---');
  console.log(content.substring(currentIdx - 500, currentIdx + 1500));
} else {
  console.log('handleSaveSupabaseConfig not found');
}
