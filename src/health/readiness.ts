export type ReadinessCheck = () => Promise<void>;

const checks = new Map<string, ReadinessCheck>();
let shuttingDown = false;

/** Dependencies (database, redis) register themselves here in later steps. */
export function registerReadinessCheck(name: string, check: ReadinessCheck): void {
  checks.set(name, check);
}

export function markShuttingDown(): void {
  shuttingDown = true;
}

export interface ReadinessResult {
  ready: boolean;
  checks: Record<string, 'ok' | 'fail'>;
}

const CHECK_TIMEOUT_MS = 2000;

function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function runReadiness(): Promise<ReadinessResult> {
  if (shuttingDown) return { ready: false, checks: { shutdown: 'fail' } };

  const results: Record<string, 'ok' | 'fail'> = {};
  await Promise.all(
    [...checks.entries()].map(async ([name, check]) => {
      try {
        await withTimeout(check(), CHECK_TIMEOUT_MS);
        results[name] = 'ok';
      } catch {
        results[name] = 'fail';
      }
    }),
  );
  return { ready: Object.values(results).every((r) => r === 'ok'), checks: results };
}
