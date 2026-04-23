export async function* streamText(text, options = {}) {
  const chunkSize = Math.max(8, Number(options.chunkSize) || 28);
  const delayMs = Math.max(0, Number(options.delayMs) || 0);
  const value = String(text || "");

  for (let index = 0; index < value.length; index += chunkSize) {
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    yield value.slice(index, index + chunkSize);
  }
}
