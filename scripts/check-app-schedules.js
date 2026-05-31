import fs from 'fs';

const filePath = 'd:\\Vibe Code\\AAA Bala Bot\\src\\App.tsx';
const content = fs.readFileSync(filePath, 'utf8');

console.log(`src/App.tsx:`);
console.log(`- Contains 'Lịch Nhắc Tự Động':`, content.includes('Lịch Nhắc Tự Động'));
console.log(`- Contains 'schedules':`, content.includes('schedules'));
console.log(`- Contains 'ScheduleItem':`, content.includes('ScheduleItem'));
