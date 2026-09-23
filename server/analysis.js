// Deterministic extraction deliberately retains source evidence. Absence is not
// proof of inability; only explicitly mentioned skills contribute to the score.
const catalog = [
  ['JavaScript', 'js', 'javascript'], ['TypeScript', 'typescript'], ['React', 'react', 'react.js', 'reactjs'],
  ['Next.js', 'next.js', 'nextjs'], ['Vue', 'vue', 'vue.js'], ['Angular', 'angular'], ['HTML', 'html', 'html5'],
  ['CSS', 'css', 'css3'], ['Tailwind CSS', 'tailwind', 'tailwind css'], ['Node.js', 'node.js', 'nodejs'],
  ['Express', 'express', 'express.js'], ['Python', 'python'], ['Java', 'java'], ['C++', 'c++'], ['C#', 'c#'],
  ['Go', 'golang'], ['Rust', 'rust'], ['PHP', 'php'], ['Ruby', 'ruby'], ['Swift', 'swift'], ['Kotlin', 'kotlin'],
  ['SQL', 'sql'], ['PostgreSQL', 'postgresql', 'postgres'], ['MySQL', 'mysql'], ['MongoDB', 'mongodb'],
  ['Redis', 'redis'], ['GraphQL', 'graphql'], ['REST APIs', 'rest', 'restful', 'rest api', 'rest apis'],
  ['Git', 'git'], ['Docker', 'docker'], ['Kubernetes', 'kubernetes', 'k8s'], ['AWS', 'aws', 'amazon web services'],
  ['Azure', 'azure'], ['Google Cloud', 'gcp', 'google cloud'], ['CI/CD', 'ci/cd', 'continuous integration'],
  ['Testing', 'unit testing', 'automated testing', 'testing'], ['Jest', 'jest'], ['Playwright', 'playwright'],
  ['Figma', 'figma'], ['UI/UX', 'ui/ux', 'user experience', 'ux design'], ['Accessibility', 'accessibility', 'wcag'],
  ['Machine learning', 'machine learning'], ['Deep learning', 'deep learning'], ['TensorFlow', 'tensorflow'],
  ['PyTorch', 'pytorch'], ['Pandas', 'pandas'], ['NumPy', 'numpy'], ['Excel', 'excel'], ['Power BI', 'power bi'],
  ['Tableau', 'tableau'], ['Data analysis', 'data analysis', 'data analytics'], ['Statistics', 'statistics'],
  ['Agile', 'agile', 'scrum'], ['Linux', 'linux'], ['Cybersecurity', 'cybersecurity'],
  ['Communication', 'communication', 'communicate'], ['Teamwork', 'teamwork', 'collaboration', 'collaborate'],
  ['Leadership', 'leadership'], ['Problem solving', 'problem solving', 'problem-solving'],
  ['Time management', 'time management'], ['Adaptability', 'adaptability'], ['Critical thinking', 'critical thinking'],
  ['Project management', 'project management'], ['Stakeholder management', 'stakeholder management'],
];
const soft = new Set(['Communication', 'Teamwork', 'Leadership', 'Problem solving', 'Time management', 'Adaptability', 'Critical thinking', 'Stakeholder management']);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text, term) => new RegExp(`(?<![\\w+#])${escape(term)}(?![\\w+#])`, 'i').test(text);
export const linesOf = (text) => text.split(/\n|(?<=[.;])\s+/).map(s => s.trim()).filter(Boolean);
const negative = /\b(no|not|without|lack(?:ing)?|never|learning|plan to learn)\b/i;

export function extractSkills(text, job = false) {
  const lines = linesOf(text);
  return catalog.flatMap(([name, ...aliases]) => {
    const terms = name === 'Go' ? ['golang', 'go programming', 'go language'] : [name, ...aliases];
    const hits = lines.filter(line => terms.some(a => has(line, a)) || (name === 'Go' && /(?:^|[,|:])\s*Go\s*(?:[,|]|$)/.test(line)));
    const evidence = hits.find(line => !negative.test(line));
    if (!evidence) return [];
    const priority = job && /preferred|nice.to.have|bonus|optional|desirable/i.test(evidence) ? 'Low'
      : job && /required|must|essential|mandatory|minimum/i.test(evidence) ? 'High' : 'Medium';
    return [{ name, type: soft.has(name) ? 'soft' : 'technical', evidence, priority }];
  });
}

const headingPatterns = {
  education: /^(education|academic(?: background| qualifications)?|qualifications)$/i,
  projects: /^(?:personal |selected |academic )?projects$/i,
  certifications: /^(certifications?|certificates?|licenses?(?: and certifications)?)$/i,
  experience: /^(?:(?:work|professional|employment|relevant) )?(experience|history)$/i,
  skills: /^(?:(?:technical|soft|core) )?skills(?: and technologies)?$/i,
  summary: /^(summary|profile|objective|about(?: me)?)$/i,
};
function sections(text) {
  const result = { education: [], projects: [], certifications: [], experience: [] };
  let current = null;
  for (const line of text.split('\n').map(s => s.trim()).filter(Boolean)) {
    const heading = line.replace(/[:\s]+$/, '');
    const entry = Object.entries(headingPatterns).find(([, pattern]) => pattern.test(heading));
    if (entry) { current = entry[0]; continue; }
    if (result[current]) result[current].push(line);
  }
  return result;
}

export function resumeAgent(text) {
  const skills = extractSkills(text);
  const extracted = sections(text);
  // Never derive years by adding overlapping roles or guessing from graduation.
  const yearsEvidence = linesOf(text).find(s => /\b\d+(?:\.\d+)?\+?\s+years?\s+(?:(?:of|professional|work|relevant|total)\s+)*experience\b/i.test(s) && !negative.test(s));
  const years = yearsEvidence ? Number(yearsEvidence.match(/\b(\d+(?:\.\d+)?)\+?\s+years?/i)[1]) : null;
  const strengths = [];
  if (skills.length) strengths.push(`${skills.length} explicitly mentioned skills provide a starting point for matching.`);
  if (extracted.projects.length) strengths.push('A projects section provides material to discuss in an interview.');
  if (extracted.experience.length) strengths.push('An experience section is present.');
  const improvements = [];
  for (const key of ['education', 'experience', 'projects']) if (!extracted[key].length) improvements.push(`No ${key} section recognized. Review extraction or add a clear heading if applicable.`);
  if (!skills.length) improvements.push('No catalog skills recognized. Review the text and add accurate, explicit skill names.');
  if (!/\d+\s*%/.test(text)) improvements.push('Where you have verifiable results, describe the outcome. Do not add invented metrics.');
  return {
    skills, ...extracted, years, yearsEvidence: yearsEvidence || null, strengths, improvements,
    summary: skills.length ? `This resume explicitly mentions ${skills.slice(0, 6).map(s => s.name).join(', ')}${skills.length > 6 ? ' and other skills' : ''}. Review the source excerpts below to confirm the extracted information.` : 'No catalog skills were recognized. Review the extracted text before matching.',
  };
}

export function jobAnalysisAgent(text) {
  const lines = linesOf(text);
  const experience = lines.filter(s => /\byears?\b.*\bexperience\b|\bexperience\b.*\byears?\b/i.test(s));
  const minimums = experience.map(s => {
    const m = s.match(/\b(\d+(?:\.\d+)?)(?:\s*[-–]\s*\d+)?\+?\s+years?/i);
    return m && !/preferred|optional|nice.to.have/i.test(s) ? Number(m[1]) : null;
  }).filter(n => n !== null);
  return {
    skills: extractSkills(text, true), experience,
    minimumYears: minimums.length ? Math.max(...minimums) : null,
    qualifications: lines.filter(s => /\b(degree|bachelor|master|ph\.?d|diploma|certification|certified)\b/i.test(s)),
    responsibilities: lines.filter(s => /\b(build|develop|design|maintain|lead|manage|implement|collaborate|deliver|responsible|analy[sz]e|support)\b/i.test(s)),
  };
}

export function matchingAgent(resume, job) {
  const names = new Set(resume.skills.map(s => s.name));
  const matched = job.skills.filter(s => names.has(s.name));
  const missing = job.skills.filter(s => !names.has(s.name));
  const weight = s => ({ High: 3, Medium: 2, Low: 1 })[s.priority];
  const earned = matched.reduce((sum, s) => sum + weight(s), 0);
  const possible = job.skills.reduce((sum, s) => sum + weight(s), 0);
  const gaps = [];
  if (job.minimumYears !== null) {
    if (resume.years === null) gaps.push(`The job mentions ${job.minimumYears}+ years. Total relevant experience is not explicitly stated in the resume; review manually.`);
    else if (resume.years < job.minimumYears) gaps.push(`The resume explicitly states ${resume.years} years; the job mentions ${job.minimumYears}+ years. Review relevance and scope manually.`);
    else gaps.push(`The stated ${resume.years} years meets the numeric ${job.minimumYears}-year requirement. Relevance to the role still needs review.`);
  }
  if (job.qualifications.length) gaps.push('Qualification requirements need manual review against the education and certification excerpts. Equivalence is not assumed.');
  return { matched, missing, gaps, score: possible ? Math.round(earned / possible * 100) : null, earned, possible,
    explanation: 'Weighted skill coverage = matched points ÷ recognized job-skill points × 100. Required: 3, unspecified: 2, preferred: 1. Each skill counts once. Experience and qualifications are flagged separately, not scored. This is not a hiring probability.' };
}

export function skillGapAgent(match) {
  return [...match.missing].sort((a, b) => ({ High: 0, Medium: 1, Low: 2 })[a.priority] - ({ High: 0, Medium: 1, Low: 2 })[b.priority]).map(s => ({
    ...s,
    recommendation: s.type === 'soft' ? `Practice ${s.name.toLowerCase()} in a realistic role scenario. Record an example, reflect on the outcome, and request feedback.` : `Study the fundamentals of ${s.name}, complete a small hands-on exercise, and document what you can demonstrate.`,
  }));
}

export function careerPlanningAgent(gaps, duration) {
  const focus = gaps.length ? gaps : [{ name: 'Interview preparation', priority: 'Low', type: 'soft' }];
  return Array.from({ length: duration }, (_, i) => {
    const skill = focus[Math.min(focus.length - 1, Math.floor(i * focus.length / duration))];
    const phase = i % 3;
    const task = phase === 0 ? `Learn the core concepts of ${skill.name}. Take notes and explain three ideas in your own words.`
      : phase === 1 ? `Practice ${skill.name} with a small exercise relevant to the job. Save your work and note any blockers.`
        : `Review your ${skill.name} exercise, correct mistakes, and explain your decisions aloud.`;
    return { day: i + 1, skill: skill.name, task, deliverable: phase === 0 ? 'A one-page concept note' : phase === 1 ? 'A completed practice exercise' : 'A short reflection and explanation', minutes: 45 };
  });
}

export function interviewAgent(resume, job) {
  const focus = job.skills.slice(0, 2).map(s => s.name);
  return [
    { category: 'HR', question: 'Walk me through your background and explain why this role interests you.' },
    { category: 'HR', question: 'Tell me about a real challenge you faced while working with others. What did you do, and what did you learn?' },
    ...((focus.length ? focus : ['the main responsibility in this job']).map(skill => ({ category: 'Technical', question: `How would you approach a task involving ${skill}? Explain your decisions, trade-offs, and how you would validate the result.` }))),
    { category: 'Project', question: resume.projects.length ? `Your resume mentions “${resume.projects[0].slice(0, 200)}”. Describe your own contribution, one trade-off, and what you learned.` : 'Choose a real project or exercise you have completed. Describe the problem, your contribution, and what you learned. If you have none, explain how you would approach a relevant practice project.' },
  ];
}

export function improvementAgent(text) {
  const suggestions = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const replacement = trimmed.replace(/\bresponsible for\s+developing\b/i, 'Developed').replace(/\bresponsible for\s+managing\b/i, 'Managed').replace(/\bresponsible for\s+building\b/i, 'Built').replace(/\bresponsible for\s+maintaining\b/i, 'Maintained').replace(/\bhelped to\b/i, 'Helped');
    if (replacement !== trimmed) suggestions.push({ original: line, replacement, reason: 'Use a concise verb while preserving the original responsibility and facts.' });
  }
  return suggestions.slice(0, 8);
}

export function analyze(resumeText, jobText) {
  const resume = resumeAgent(resumeText);
  const job = jobAnalysisAgent(jobText);
  const match = matchingAgent(resume, job);
  return { resume, job, match, gaps: skillGapAgent(match), suggestions: improvementAgent(resumeText), mode: 'local' };
}
