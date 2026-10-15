/// <reference lib="webworker" />
let id: ReturnType<typeof setInterval> | null = null;

self.onmessage = (e: MessageEvent<{ type: 'start' | 'stop'; intervalMs?: number }>) => {
  if (id !== null) clearInterval(id);
  id = null;
  if (e.data.type === 'start') {
    id = setInterval(() => self.postMessage('tick'), e.data.intervalMs ?? 25);
  }
};
