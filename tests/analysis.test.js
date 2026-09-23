import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, careerPlanningAgent, extractSkills, resumeAgent } from '../server/analysis.js';
import { groundAnalysis, generateAI } from '../server/ai.js';

test('matches whole skill names and aliases without substring qualifications', () => {
  assert.deepEqual(extractSkills('JavaScript, ReactJS, PostgreSQL, C++, C# and Go to school.').map(s => s.name), ['JavaScript', 'React', 'C++', 'C#', 'PostgreSQL']);
  assert.equal(extractSkills('No Python experience.\nPlan to learn AWS.').length, 0);
});
test('score is deterministic, weighted, deduplicated and never uses AI', () => {
  const result = analyze('Skills\nReact, React.js, JavaScript\nExperience\n2 years of experience building web apps.', 'Required: React and Python.\nPreferred: JavaScript.\nRequired: 3+ years of experience.');
  assert.equal(result.match.score, 57);
  assert.equal(result.match.earned, 4);
  assert.equal(result.match.possible, 7);
  assert.deepEqual(result.match.missing.map(s => s.name), ['Python']);
  assert.equal(result.gaps[0].priority, 'High');
  assert.match(result.match.gaps[0], /2 years.*3\+/);
});
test('unknown evidence produces no invented score, experience or education', () => {
  const result = analyze('A thoughtful person looking for a new opportunity.', 'Looking for someone with enthusiasm and an interest in helping.');
  assert.equal(result.match.score, null);
  assert.equal(result.resume.years, null);
  assert.deepEqual(result.resume.education, []);
});
test('keeps section excerpts verbatim and does not infer tenure from dates', () => {
  const result = resumeAgent('Education\nBSc, Example University\nProjects\nBuilt a tracker\nExperience\nEngineer 2020–2024\nCertifications\nNone listed');
  assert.deepEqual(result.education, ['BSc, Example University']);
  assert.deepEqual(result.projects, ['Built a tracker']);
  assert.equal(result.years, null);
});
test('all roadmap durations have sequential days and identified gap names', () => {
  for (const duration of [7, 14, 30]) {
    const plan = careerPlanningAgent([{ name: 'Python' }, { name: 'Testing' }], duration);
    assert.equal(plan.length, duration);
    assert.deepEqual(plan.map(d => d.day), Array.from({ length: duration }, (_, i) => i + 1));
    assert.ok(plan.every(d => ['Python', 'Testing'].includes(d.skill)));
  }
});
test('AI grounding rejects fabricated evidence, metrics, and new qualifications', () => {
  const resume = 'Responsible for developing interfaces. Managed 3 projects.';
  const data = groundAnalysis({ summary: '', improvements: [], strengths: [{ observation: 'Invented', evidence: 'Led teams at Google' }], suggestions: [
    { original: 'Managed 3 projects.', replacement: 'Managed 30 projects.', reason: '' },
    { original: 'Responsible for developing interfaces.', replacement: 'Developed interfaces with Python.', reason: '' },
    { original: 'Responsible for developing interfaces.', replacement: 'Developed interfaces.', reason: '' },
  ] }, resume);
  assert.equal(data.strengths.length, 0);
  assert.equal(data.suggestions.length, 1);
  assert.equal(data.suggestions[0].replacement, 'Developed interfaces.');
});
test('provider requests use strict schemas and validated outputs; refusals and malformed data fail', async () => {
  const old = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  try {
    const feedback = { assessment: 'Developing', feedback: 'Give a specific example.', strengths: [], improvements: ['Discuss your own contribution.'], followUp: 'What did you do?' };
    const value = await generateAI('feedback', { answer: 'Example answer' }, { fetchImpl: async (url, request) => {
      const body = JSON.parse(request.body);
      assert.equal(body.store, false);
      assert.equal(body.text.format.type, 'json_schema');
      assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.schema.additionalProperties, false);
      return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(feedback) }] }] }) };
    } });
    assert.deepEqual(value, feedback);
    await assert.rejects(generateAI('feedback', {}, { fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'completed', output: [] }) }) }), /validated/);
    await assert.rejects(generateAI('feedback', {}, { fetchImpl: async () => ({ ok: false, status: 429 }) }), /quota/);
  } finally { if (old === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = old; }
});
