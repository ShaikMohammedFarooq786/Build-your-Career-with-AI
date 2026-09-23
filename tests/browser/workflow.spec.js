import { test, expect } from '@playwright/test';
import { docxFixture } from '../fixtures.js';

async function navigate(page, label) {
  if (await page.getByRole('button', { name: 'Open navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: label, exact: true }).click();
}

test('complete local workflow preserves evidence, edits and responsive layout', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Local mode', { exact: true })).toBeVisible();
  await expect(page.getByText('Not uploaded', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Try a sample workspace' }).click();
  await expect(page.getByText('Sample workspace · All candidate and job details are fictional.')).toBeVisible();
  await page.getByRole('button', { name: 'Analyze resume', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resume analysis', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Analyze & match' }).click();
  await expect(page.getByRole('heading', { name: 'Your resume, at a glance' })).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: `test-results/dashboard-${test.info().project.name}.png`, fullPage: true });
  await navigate(page, 'Job matching');
  await expect(page.getByText('How this score works')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Not explicitly identified', exact: true }).first()).toBeVisible();
  await navigate(page, 'Learning plan');
  for (const duration of [7, 14, 30]) {
    await page.getByRole('button', { name: `${duration} days`, exact: true }).click();
    await page.getByRole('button', { name: 'Build local plan', exact: true }).click();
    await expect(page.getByRole('heading', { name: `Your ${duration}-day roadmap` })).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(duration);
  }
  await page.getByRole('checkbox', { name: 'Complete day 1', exact: true }).check();
  await expect(page.getByText('1 / 30 days complete')).toBeVisible();
  await navigate(page, 'Mock interview');
  await page.getByRole('button', { name: 'Start guided practice' }).click();
  for (let i = 0; i < 5; i++) {
    await page.getByLabel('Your answer', { exact: true }).fill('I built a personal expense tracker using React. I designed the interface and learned how to manage application state.');
    await page.getByRole('button', { name: i === 4 ? 'Finish interview' : 'Save & next question' }).click();
  }
  await expect(page.getByText('You answered 5 questions.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate final AI summary' })).toBeDisabled();
  await navigate(page, 'Resume studio');
  await page.getByRole('button', { name: 'Apply this suggestion' }).click();
  await expect(page.getByLabel('Editable text draft')).toHaveValue(/Developed responsive interfaces/);
  await page.getByRole('button', { name: 'Reset draft', exact: true }).click();
  await expect(page.getByLabel('Editable text draft')).toHaveValue(/Responsible for developing/);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download text draft' }).click();
  expect((await download).suggestedFilename()).toBe('careermatch-resume-draft.txt');
  await navigate(page, 'My resume');
  await page.getByLabel('Job description', { exact: true }).fill('A different role requiring Python and machine learning experience.');
  await navigate(page, 'Job matching');
  await expect(page.getByRole('heading', { name: 'Give your next move some direction' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('upload DOCX, review extracted resume without a job, and reject invalid files', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'My resume');
  await page.locator('input[type=file]').setInputFiles({ name: 'resume.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: docxFixture() });
  await expect(page.getByLabel('Or paste / correct your resume text')).toHaveValue(/Sample Resume/);
  await expect(page.getByRole('heading', { name: 'Resume analysis', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Education', exact: true })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({ name: 'invalid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a valid pdf') });
  await expect(page.getByRole('alert')).toContainText('Upload a valid PDF or DOCX');
  await expect(page.getByLabel('Or paste / correct your resume text')).toHaveValue(/Sample Resume/);
});

test('AI interview UI evaluates answers and shows a final summary with mocked provider responses', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ json: { ok: true, aiEnabled: true } }));
  const questions = [
    { category: 'HR', question: 'Why does this role interest you?' },
    { category: 'Technical', question: 'How do you manage state in React?' },
    { category: 'Project', question: 'What did you learn from your expense tracker?' },
  ];
  await page.route('**/api/interview', route => route.fulfill({ json: { questions, mode: 'ai' } }));
  await page.route('**/api/interview/feedback', route => route.fulfill({ json: { assessment: 'Developing', feedback: 'Explain why you chose that approach.', strengths: ['A specific project example.'], improvements: ['Describe a trade-off.'], followUp: 'What alternative did you consider?' } }));
  await page.route('**/api/interview/summary', route => route.fulfill({ json: { summary: 'You used a project example in your answers.', strengths: ['Concrete examples.'], nextSteps: ['Practice explaining technical trade-offs.'] } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample workspace' }).click();
  await page.getByRole('button', { name: 'Analyze & match' }).click();
  await expect(page.getByRole('heading', { name: 'Your resume, at a glance' })).toBeVisible();
  await navigate(page, 'Mock interview');
  await page.getByRole('button', { name: 'Start AI interview' }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByLabel('Your answer', { exact: true }).fill('I built a React expense tracker and used local component state for the form.');
    await page.getByRole('button', { name: 'Evaluate answer with AI' }).click();
    await expect(page.getByRole('heading', { name: 'Developing', exact: true })).toBeVisible();
    await expect(page.getByLabel('Your answer', { exact: true })).toBeDisabled();
    await page.getByRole('button', { name: i === 2 ? 'Finish interview' : 'Save & next question' }).click();
  }
  await page.getByRole('button', { name: 'Generate final AI summary' }).click();
  await expect(page.getByRole('heading', { name: 'Interview summary', exact: true })).toBeVisible();
  await expect(page.getByText('Practice explaining technical trade-offs.')).toBeVisible();
});
