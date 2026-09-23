import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { pdfFixture, docxFixture, resumeText } from './fixtures.js';

let server, base;
before(async () => { server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => new Promise(r => server.close(r)));
const context = { resumeText, jobText: 'Required: React, CSS, JavaScript, TypeScript. Build interfaces and maintain reusable components.' };
const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('local workflow extracts, matches, plans and provides all interview categories', async () => {
  const result = await (await post('/api/analyze', context)).json();
  assert.equal(result.match.score, 75);
  for (const duration of [7, 14, 30]) {
    const plan = await (await post('/api/plan', { ...context, duration })).json();
    assert.equal(plan.days.length, duration);
  }
  const interview = await (await post('/api/interview', context)).json();
  assert.deepEqual([...new Set(interview.questions.map(q => q.category))], ['HR', 'Technical', 'Project']);
});
for (const [extension, fixture] of [['pdf', pdfFixture], ['docx', docxFixture]]) {
  test(`extracts actual ${extension.toUpperCase()} files in an isolated process`, async () => {
    const form = new FormData(); form.append('resume', new Blob([fixture()]), `resume.${extension}`);
    const response = await fetch(`${base}/api/resume/upload`, { method: 'POST', body: form });
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.match(data.text, /JavaScript/);
    assert.ok(data.resume.skills.some(s => s.name === 'React'));
  });
}
test('rejects forged documents, oversize uploads, invalid inputs and cross-origin posts', async () => {
  for (const [name, content] of [['resume.pdf', 'not a pdf'], ['resume.docx', 'not a zip'], ['resume.txt', resumeText]]) {
    const form = new FormData(); form.append('resume', new Blob([content]), name);
    assert.equal((await fetch(`${base}/api/resume/upload`, { method: 'POST', body: form })).status, 400);
  }
  const form = new FormData(); form.append('resume', new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)]), 'large.pdf');
  assert.equal((await fetch(`${base}/api/resume/upload`, { method: 'POST', body: form })).status, 400);
  assert.equal((await post('/api/analyze', { ...context, resumeText: '' })).status, 400);
  assert.equal((await post('/api/plan', { ...context, duration: 90 })).status, 400);
  assert.equal((await fetch(`${base}/api/analyze`, { method: 'POST', headers: { Origin: 'https://example.com' } })).status, 403);
});
test('missing key reports unavailable AI without pretending to evaluate', async () => {
  const old = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  try {
    assert.equal((await post('/api/ai/analysis', context)).status, 503);
    assert.equal((await post('/api/interview/feedback', { ...context, question: { category: 'HR', question: 'Tell me about yourself.' }, answer: 'A sample answer about my work.' })).status, 503);
  } finally { if (old !== undefined) process.env.OPENAI_API_KEY = old; }
});
