import fs from 'fs';
import path from 'path';

const filePath = 'd:\\Vibe Code\\AAA Bala Bot\\server.ts';
const content = fs.readFileSync(filePath, 'utf8');

const regex = /app\.(get|post|put|delete)\(['"]([^'"]+)['"]/g;
let match;
console.log('Registered endpoints in server.ts:');
while ((match = regex.exec(content)) !== null) {
  console.log(`- ${match[1].toUpperCase()} ${match[2]}`);
}
