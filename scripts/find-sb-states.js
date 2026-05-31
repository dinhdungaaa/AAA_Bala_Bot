import fs from 'fs';

const filePath = 'd:\\Vibe Code\\AAA Bala Bot\\src\\App.tsx';
const content = fs.readFileSync(filePath, 'utf8');

const urlIdx = content.indexOf('const [sbUrl');
if (urlIdx !== -1) {
  console.log(content.substring(urlIdx, urlIdx + 500));
} else {
  console.log('const [sbUrl not found');
}
