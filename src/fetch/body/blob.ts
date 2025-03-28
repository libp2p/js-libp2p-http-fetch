export function blobBody (blob: Blob, headers: Headers): ReadableStream {
  headers.set('Content-Length', `${blob.size}`)
  headers.set('Content-Type', (blob.type != null && blob.type !== '') ? blob.type : 'application/octet-stream')

  return blob.stream()
}
