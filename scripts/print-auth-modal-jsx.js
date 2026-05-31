import fs from 'fs';

const filePath = 'd:\\Vibe Code\\AAA Bala Bot\\src\\App.tsx';
const content = fs.readFileSync(filePath, 'utf8');

const authModalIdx = content.indexOf('showAuthModal && (');
if (authModalIdx !== -1) {
  console.log(content.substring(authModalIdx - 20, authModalIdx + 3000));
} else {
  console.log('showAuthModal && ( not found');
}
