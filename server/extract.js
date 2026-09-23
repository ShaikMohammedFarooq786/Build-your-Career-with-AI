import { fork } from 'node:child_process';
import { extname } from 'node:path';

let active = 0;
export function extractDocument(file) {
  const extension = extname(file.originalname).toLowerCase();
  const pdf = file.buffer.subarray(0, 5).toString() === '%PDF-';
  const zip = file.buffer[0] === 0x50 && file.buffer[1] === 0x4b;
  if (!(['.pdf', '.docx'].includes(extension)) || (extension === '.pdf' ? !pdf : !zip)) {
    throw Object.assign(new Error('Upload a valid PDF or DOCX file.'), { status: 400 });
  }
  if (active >= 2) throw Object.assign(new Error('Two documents are already processing. Please try again shortly.'), { status: 429 });
  active++;
  return new Promise((resolve, reject) => {
    // Native PDF libraries can fail inside worker threads on Windows.
    const child = fork(new URL('./parse-document.js', import.meta.url), [], {
      execArgv: ['--max-old-space-size=192'], serialization: 'advanced', stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    let settled = false;
    const finish = (error, text) => {
      if (settled) return;
      settled = true; clearTimeout(timeout); active--; child.kill();
      if (error) reject(Object.assign(new Error(error), { status: 422 })); else resolve(text);
    };
    const timeout = setTimeout(() => finish('Document extraction timed out. Try a smaller document or paste the text.'), 20000);
    child.on('message', result => {
      // Node's --watch also emits dependency-report messages over this channel.
      // Only an actual parser result may resolve the extraction request.
      if (typeof result?.text === 'string' || typeof result?.error === 'string') finish(result.error, result.text);
    });
    child.once('error', () => finish('Could not read this document. Try another file or paste the text.'));
    child.once('exit', () => finish('Document extraction stopped. Try a smaller file or paste the text.'));
    child.send({ buffer: file.buffer, extension }, error => { if (error) finish('Could not start document extraction. Please retry.'); });
  });
}
