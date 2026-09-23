import express from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { analyze, careerPlanningAgent, interviewAgent, resumeAgent } from './analysis.js';
import { aiEnabled, generateAI, groundAnalysis } from './ai.js';
import { extractDocument } from './extract.js';

const text = z.string().trim().min(40, 'Please provide at least 40 characters.').max(40000);
const context = z.object({ resumeText: text, jobText: text });
const question = z.object({ category: z.enum(['HR', 'Technical', 'Project']), question: z.string().trim().min(5).max(1500) });
const answer = z.string().trim().min(10, 'Please give an answer of at least 10 characters.').max(6000);

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    // Same-origin browser requests only. No permissive CORS on paid AI routes.
    if (req.method === 'POST' && req.headers.origin) {
      let origin;
      try { origin = new URL(req.headers.origin); } catch { return res.status(403).json({ error: 'Invalid request origin.' }); }
      const devOrigin = process.env.NODE_ENV !== 'production' && ['http://127.0.0.1:5173', 'http://localhost:5173'].includes(origin.origin);
      if (origin.host !== req.headers.host && !devOrigin) return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
    }
    next();
  });
  app.use('/api', rateLimit({ windowMs: 60000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many requests. Please wait a minute and try again.' } }));
  app.use(express.json({ limit: '200kb' }));
  app.get('/api/health', (req, res) => res.json({ ok: true, aiEnabled: aiEnabled() }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } });
  app.post('/api/resume/upload', upload.single('resume'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Choose a PDF or DOCX resume.' });
    const resumeText = await extractDocument(req.file);
    res.json({ text: resumeText, filename: req.file.originalname, resume: resumeAgent(resumeText) });
  });
  app.post('/api/analyze', (req, res) => {
    const data = context.parse(req.body);
    res.json(analyze(data.resumeText, data.jobText));
  });
  app.post('/api/resume/analyze', (req, res) => {
    const data = z.object({ resumeText: text }).parse(req.body);
    res.json(resumeAgent(data.resumeText));
  });
  app.post('/api/ai/analysis', async (req, res) => {
    const data = z.object({ resumeText: text, jobText: z.string().max(40000).default('') }).parse(req.body);
    res.json(groundAnalysis(await generateAI('analysis', data), data.resumeText));
  });
  app.post('/api/plan', async (req, res) => {
    const data = context.extend({ duration: z.union([z.literal(7), z.literal(14), z.literal(30)]), useAI: z.boolean().default(false) }).parse(req.body);
    const result = analyze(data.resumeText, data.jobText);
    const days = data.useAI ? (await generateAI('plan', { gaps: result.gaps, duration: data.duration, job: result.job })).days : careerPlanningAgent(result.gaps, data.duration);
    const allowed = new Set(result.gaps.length ? result.gaps.map(s => s.name) : ['Interview preparation']);
    if (days.length !== data.duration || days.some((d, i) => d.day !== i + 1 || !allowed.has(d.skill))) throw Object.assign(new Error('The AI roadmap did not match the requested days or gaps. Please retry or use the local plan.'), { status: 502 });
    res.json({ days, mode: data.useAI ? 'ai' : 'local' });
  });
  app.post('/api/interview', async (req, res) => {
    const data = context.extend({ useAI: z.boolean().default(false) }).parse(req.body);
    const result = analyze(data.resumeText, data.jobText);
    const questions = data.useAI ? (await generateAI('interview', { resumeText: data.resumeText, jobText: data.jobText })).questions : interviewAgent(result.resume, result.job);
    if (!['HR', 'Technical', 'Project'].every(c => questions.some(q => q.category === c))) throw Object.assign(new Error('The AI omitted an interview category. Please retry.'), { status: 502 });
    res.json({ questions, mode: data.useAI ? 'ai' : 'local' });
  });
  app.post('/api/interview/feedback', async (req, res) => {
    const data = context.extend({ question, answer }).parse(req.body);
    res.json(await generateAI('feedback', data));
  });
  app.post('/api/interview/summary', async (req, res) => {
    const data = context.extend({ responses: z.array(z.object({ question, answer })).min(1).max(8) }).parse(req.body);
    res.json(await generateAI('summary', data));
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
  const dist = fileURLToPath(new URL('../dist', import.meta.url));
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*path}', (req, res) => res.sendFile(join(dist, 'index.html')));
  }
  app.use((error, req, res, next) => {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0].message });
    if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Resume must be 5 MB or smaller.' : 'Upload one PDF or DOCX file.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'Invalid JSON request.' });
    if (error.name === 'TimeoutError') return res.status(504).json({ error: 'AI request timed out. Please try again.' });
    if (!error.status) console.error('CareerMatch request failed:', error.name);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to complete the request. Please retry.' });
  });
  return app;
}
