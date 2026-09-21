import { readFile } from 'node:fs/promises';
const required = ['index.html','assets/css/chunks/01.css','assets/css/chunks/07.css','assets/js/app.js','assets/js/data.js','data/tools.json'];
for (const path of required) await readFile(new URL(`../${path}`, import.meta.url));
JSON.parse(await readFile(new URL('../data/tools.json', import.meta.url), 'utf8'));
console.log('ASRO Lab check passed.');
