import fs from 'fs';
import path from 'path';

const jsFile = 'd:\\Vibe Code\\AAA Bala Bot\\dist\\assets\\index-BoK0hBAe.js';
const content = fs.readFileSync(jsFile, 'utf8');

console.log(`index-BoK0hBAe.js:`);
console.log(`- Contains 'schedules':`, content.includes('schedules'));
console.log(`- Contains 'ScheduleItem':`, content.includes('ScheduleItem'));
console.log(`- Contains 'Lịch Nhắc Tự Động' (transpiled/raw):`, content.includes('Lịch Nhắc Tự Động') || content.includes('L\\u1ecbch Nh\\u1eafc T\\u1ef1 \\u0110\\u1ed9ng'));
