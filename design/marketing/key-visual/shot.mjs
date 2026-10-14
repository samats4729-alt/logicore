import { chromium } from '../../../node_modules/playwright-core/index.mjs';
const [,, src, out, w='1920', h='1080', scale='2'] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +scale });
await p.goto('file://' + src); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
await p.screenshot({ path: out }); await b.close(); console.log('saved', out);
