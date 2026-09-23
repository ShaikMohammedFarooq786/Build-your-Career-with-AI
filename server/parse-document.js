// Data travels over IPC. Uploaded files are never written to disk.
process.once('message', async ({ buffer, extension }) => {
  try {
    let text;
    if (extension === '.pdf') {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const info = await parser.getInfo();
        if (info.total > 30) throw new Error('Please upload a resume with 30 pages or fewer.');
        text = (await parser.getText()).pages.map(page => page.text).join('\n\n');
      } finally { await parser.destroy(); }
    } else {
      const mammoth = await import('mammoth');
      text = (await mammoth.extractRawText({ buffer: Buffer.from(buffer) })).value;
    }
    text = text.replace(/\u0000/g, '').trim();
    if (text.length < 40) throw new Error('Not enough readable text found. Scanned PDFs need OCR first; you can also paste the resume text.');
    if (text.length > 40000) throw new Error('The resume exceeds 40,000 characters. Upload a shorter document.');
    process.send({ text });
  } catch (error) {
    process.send({ error: /30 pages|readable text|40,000/.test(error.message) ? error.message : 'Unable to extract this file. It may be corrupt, password-protected, or not a valid resume document. Try another file or paste the text.' });
  }
});
