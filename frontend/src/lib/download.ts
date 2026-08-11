export function downloadBlobFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  downloadBlobFile(new Blob([content], { type: mimeType }), filename);
}

export function downloadJsonFile(content: string, filename: string): void {
  downloadTextFile(content, filename, 'application/json;charset=utf-8');
}
