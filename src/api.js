export async function api(path, body) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method: body ? 'POST' : 'GET',
      ...(body instanceof FormData ? { body } : body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(90000),
    });
  } catch (error) {
    throw new Error(error.name === 'TimeoutError' ? 'The request timed out. Please try again.' : 'Cannot reach the CareerMatch server. Check that it is running and retry.');
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('The server returned an unexpected response. Check that the API is running.'); }
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

export function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
