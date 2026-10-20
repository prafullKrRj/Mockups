// Generates projects/demo: five synthetic Android screenshots of a fictional budgeting app, its app info and a plan (stored in SQLite).
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { projectPaths } from '../src/core/paths.js';
import { heuristicPlan } from '../src/core/plan.js';
import { createProject, deleteProject, savePlan } from '../src/core/project.js';
import { getProjectRow } from '../src/core/store.js';

const p = projectPaths('demo');
// Start over on every run so the demo always matches this script; screenshots are re-rendered below.
if (getProjectRow('demo')) await deleteProject('demo');
await fs.rm(p.app, { force: true });
await fs.rm(p.plan, { force: true });

const css = `
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:2400px;font-family:Roboto,system-ui,sans-serif;background:#F7F8FC;color:#14172B;overflow:hidden}
.status{height:96px;display:flex;align-items:center;justify-content:space-between;padding:0 56px;font-size:36px;font-weight:500}
.bar{display:flex;gap:18px}.bar i{display:block;width:34px;height:22px;border-radius:5px;background:#14172B}
.top{padding:24px 56px 0;display:flex;justify-content:space-between;align-items:center}
.top h2{font-size:64px;font-weight:700;letter-spacing:-1px}.av{width:104px;height:104px;border-radius:50%;background:linear-gradient(135deg,#FF9A62,#FF5A8A)}
.card{margin:40px 56px 0;border-radius:48px;background:#fff;padding:52px;box-shadow:0 8px 30px rgba(20,23,43,.06)}
.hero{background:linear-gradient(140deg,#4C3BFF,#7B5CFF);color:#fff}
.lbl{font-size:36px;opacity:.75}.big{font-size:120px;font-weight:700;letter-spacing:-3px;margin-top:12px}
.row{display:flex;justify-content:space-between;align-items:center;padding:30px 0;border-bottom:2px solid #EEF0F6;font-size:40px}
.row:last-child{border:0}.row b{font-weight:600}.ico{width:88px;height:88px;border-radius:26px;margin-right:30px;flex:none}
.l{display:flex;align-items:center}.sub{font-size:32px;color:#7A7F99;margin-top:6px}
.neg{color:#E5484D;font-weight:600}.pos{color:#18A957;font-weight:600}
.prog{height:26px;border-radius:13px;background:#EEF0F6;margin-top:22px;overflow:hidden}.prog i{display:block;height:100%;border-radius:13px}
.nav{position:absolute;bottom:0;left:0;right:0;height:210px;background:#fff;display:flex;justify-content:space-around;align-items:center;padding-bottom:40px;box-shadow:0 -6px 30px rgba(20,23,43,.06)}
.nav span{width:72px;height:72px;border-radius:22px;background:#E3E6F0}.nav span.on{background:#4C3BFF}
.chips{display:flex;gap:20px;margin:36px 56px 0}.chips span{padding:22px 40px;border-radius:40px;background:#fff;font-size:36px;font-weight:500}.chips .on{background:#14172B;color:#fff}
.bars{display:flex;align-items:flex-end;gap:34px;height:520px;margin-top:40px}.bars i{flex:1;border-radius:22px 22px 8px 8px;background:#DCD7FF}.bars i.on{background:#4C3BFF}
.days{display:flex;gap:34px;margin-top:20px;font-size:30px;color:#7A7F99}.days span{flex:1;text-align:center}
.btn{margin:56px;height:150px;border-radius:75px;background:#4C3BFF;color:#fff;font-size:44px;font-weight:600;display:flex;align-items:center;justify-content:center}
.cam{margin:40px 56px 0;height:1250px;border-radius:48px;background:linear-gradient(160deg,#2B2F45,#0E1020);position:relative;overflow:hidden}
.receipt{position:absolute;left:190px;top:170px;width:590px;height:880px;background:#FBFAF6;border-radius:18px;transform:rotate(-4deg);padding:56px;font-family:monospace;font-size:30px;color:#333;line-height:1.9}
.scan{position:absolute;left:120px;right:120px;top:520px;height:8px;background:#7CFFB2;box-shadow:0 0 40px 10px rgba(124,255,178,.6)}
.corner{position:absolute;width:120px;height:120px;border:10px solid #fff}
`;

const status = '<div class="status"><span>9:41</span><div class="bar"><i></i><i></i><i style="width:56px"></i></div></div>';
const nav = (on) => `<div class="nav">${[0, 1, 2, 3].map((i) => `<span class="${i === on ? 'on' : ''}"></span>`).join('')}</div>`;
const row = (c, t, s, a, cls = 'neg') => `<div class="row"><div class="l"><div class="ico" style="background:${c}"></div><div><b>${t}</b><div class="sub">${s}</div></div></div><span class="${cls}">${a}</span></div>`;

const screens = {
  '01-home.png': `${status}<div class="top"><h2>Hi, Asha</h2><div class="av"></div></div>
    <div class="card hero"><div class="lbl">Total balance</div><div class="big">₹1,24,580</div><div class="lbl" style="margin-top:20px">+ ₹8,240 this month</div></div>
    <div class="card"><div style="font-size:44px;font-weight:700;margin-bottom:10px">Recent</div>
    ${row('#FFE3D3', 'Swiggy', 'Food · Today', '− ₹420')}${row('#D9F5E5', 'Salary', 'Income · 1 Oct', '+ ₹72,000', 'pos')}${row('#E3E0FF', 'Netflix', 'Subscriptions · 28 Sep', '− ₹649')}${row('#FFF1C7', 'Uber', 'Travel · 27 Sep', '− ₹236')}</div>${nav(0)}`,
  '02-budgets.png': `${status}<div class="top"><h2>Budgets</h2></div><div class="chips"><span class="on">October</span><span>September</span><span>August</span></div>
    ${[['Food & dining', 62, '#FF8A4C', '₹6,200 of ₹10,000'], ['Travel', 35, '#4C3BFF', '₹1,750 of ₹5,000'], ['Shopping', 88, '#E5484D', '₹8,800 of ₹10,000'], ['Bills', 50, '#18A957', '₹4,000 of ₹8,000']]
    .map(([n, v, c, s]) => `<div class="card"><div style="display:flex;justify-content:space-between;font-size:44px;font-weight:600"><span>${n}</span><span>${v}%</span></div><div class="sub">${s}</div><div class="prog"><i style="width:${v}%;background:${c}"></i></div></div>`).join('')}${nav(1)}`,
  '03-insights.png': `${status}<div class="top"><h2>Insights</h2></div>
    <div class="card"><div class="lbl" style="opacity:1;color:#7A7F99">Spent this week</div><div class="big" style="font-size:96px">₹9,340</div>
    <div class="bars">${[40, 65, 30, 85, 55, 100, 45].map((h, i) => `<i class="${i === 5 ? 'on' : ''}" style="height:${h}%"></i>`).join('')}</div>
    <div class="days">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span>${d}</span>`).join('')}</div></div>
    <div class="card">${row('#FFE3D3', 'Food', '38% of spending', '₹3,550')}${row('#E3E0FF', 'Shopping', '27% of spending', '₹2,520')}</div>${nav(2)}`,
  '04-scan.png': `${status}<div class="top"><h2>Scan receipt</h2></div>
    <div class="cam"><div class="receipt">FRESH MART<br>------------------<br>Milk 2L ....... 120<br>Bread ......... 45<br>Eggs x12 ...... 96<br>Apples 1kg .... 180<br>Coffee ........ 340<br>------------------<br>TOTAL ......... 781</div><div class="scan"></div>
    <div class="corner" style="left:90px;top:120px;border-right:0;border-bottom:0"></div><div class="corner" style="right:90px;top:120px;border-left:0;border-bottom:0"></div>
    <div class="corner" style="left:90px;bottom:120px;border-right:0;border-top:0"></div><div class="corner" style="right:90px;bottom:120px;border-left:0;border-top:0"></div></div>
    <div class="card" style="display:flex;justify-content:space-between;font-size:44px"><b>Fresh Mart</b><span class="neg">− ₹781</span></div><div class="btn">Save transaction</div>`,
  '05-bills.png': `${status}<div class="top"><h2>Upcoming bills</h2></div>
    <div class="card hero" style="background:linear-gradient(140deg,#14172B,#33385C)"><div class="lbl">Due in next 7 days</div><div class="big">₹5,480</div><div class="lbl" style="margin-top:20px">3 bills · reminders on</div></div>
    <div class="card">${row('#D3ECFF', 'Electricity', 'Due 22 Oct · Auto-remind', '₹2,140')}${row('#FFE3D3', 'Phone', 'Due 24 Oct', '₹599')}${row('#E3E0FF', 'Internet', 'Due 26 Oct', '₹1,180')}${row('#D9F5E5', 'Rent', 'Due 1 Nov', '₹18,000')}</div>${nav(3)}`,
};

const browser = await chromium.launch();
await fs.mkdir(p.screenshots, { recursive: true });
await fs.mkdir(p.reference, { recursive: true });
for (const [file, body] of Object.entries(screens)) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 2400 } });
  await page.setContent(`<!doctype html><style>${css}</style><body>${body}</body>`);
  await page.screenshot({ path: path.join(p.screenshots, file) });
  await page.close();
}
await browser.close();

const demo = await createProject('demo', {
  name: 'Paisa Calm',
  packageName: 'com.example.paisacalm',
  category: 'finance',
  shortDescription: 'Budgets, bills and spending in one calm place',
  fullDescription: 'Paisa Calm tracks spending across accounts, sets monthly budgets per category, scans paper receipts, and reminds you before bills are due. Everything stays on your device.',
  audience: 'Young professionals in India managing their first salary',
  tone: 'calm, reassuring, plain language',
  brandColors: ['#4C3BFF', '#FF8A4C'],
  features: ['Monthly budgets per category', 'Receipt scanning', 'Bill reminders', 'Weekly spending insights', 'Works offline'],
  facts: ['Works offline', 'No ads', 'No sign-up'],
  locale: 'en-US', locales: ['en-US', 'hi-IN'],
  slideCount: 6,
  screens: {
    '01-home.png': { title: 'Home', description: 'Total balance across accounts and the latest transactions', priority: 5 },
    '02-budgets.png': { title: 'Budgets', description: 'Monthly budget per category with progress bars', priority: 4 },
    '03-insights.png': { title: 'Insights', description: 'Weekly spending chart and top categories', priority: 3 },
    '04-scan.png': { title: 'Receipt scan', description: 'Point the camera at a paper receipt to add an expense', priority: 3 },
    '05-bills.png': { title: 'Bills', description: 'Upcoming bills with due dates and reminders', priority: 2 },
  },
  notes: 'Indian rupee amounts. Emphasise privacy (on-device) and calm.',
}, { appId: 'paisa-calm', label: 'demo' });
console.log(`demo project written to ${p.dir}`);

const plan = heuristicPlan({ app: demo.app, screenshots: Object.keys(screens).map((file) => ({ file, width: 1080, height: 2400 })) });
const hiHeadlines = ['पैसे का हिसाब आसान', 'हर खर्च का बजट', 'खर्च को समझें', 'रसीद स्कैन करें', 'बिल समय पर चुकाएँ'];
const hiSublines = ['सभी खातों का बैलेंस और लेनदेन', 'हर श्रेणी के मासिक बजट पर नज़र', 'साप्ताहिक खर्च और मुख्य श्रेणियाँ', 'रसीद स्कैन करके खर्च जोड़ें', 'आने वाले बिल और उनकी तारीखें'];
const badgeCopy = { 'Works offline': 'ऑफ़लाइन चले', 'No ads': 'विज्ञापन नहीं', 'No sign-up': 'साइन-अप नहीं' };
const pair = (en, hi) => ({ 'en-US': en, 'hi-IN': hi });
plan.slides.forEach((slide, i) => {
  slide.headline = pair(slide.headline, hiHeadlines[i]);
  if (slide.subline) slide.subline = pair(slide.subline, hiSublines[i]);
  if (slide.eyebrow) slide.eyebrow = pair(slide.eyebrow, 'पैसे का हिसाब');
  if (slide.badges) slide.badges = slide.badges.map((text) => pair(text, badgeCopy[text]));
});
plan.featureGraphic.headline = pair(plan.featureGraphic.headline, 'पैसे का हिसाब आसान');
console.log(`demo plan v${savePlan('demo', plan, 'demo').version} saved`);
