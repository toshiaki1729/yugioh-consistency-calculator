import { countStates, runExact } from './exact';
import { project } from './project';
import { runSampling } from './sampling';
import type { EngineInput, Estimate, HandResult, ProgressCallback } from './types';

export function runEngine(input: EngineInput, onProgress?: ProgressCallback): HandResult[] {
  const preparationStart = performance.now();
  const projections = input.patterns.map(pattern => project(input, pattern));
  const jobs = input.handSizes.map(handSize => [input, ...projections].map(source => {
    const states = countStates(source, handSize);
    const exact = states <= source.limits.exactMaxStates;
    return { source, states, exact, work: exact ? states : source.limits.samples };
  }));
  const preparationMs = performance.now() - preparationStart;
  const total = jobs.reduce((sum, handJobs) => sum + handJobs.reduce((subtotal, job) => subtotal + job.work, 0), 0);
  let done = 0;
  onProgress?.(0, total);
  return input.handSizes.map((handSize, i) => {
    const start = performance.now();
    const estimates = jobs[i].map(job => {
      const progress = onProgress ? (localDone: number) => onProgress(done + localDone, total) : undefined;
      const estimate = job.exact
        ? runExact(job.source, handSize, progress, job.states).estimate
        : runSampling(job.source, handSize, progress);
      done += job.work;
      return estimate;
    });
    const perPattern: Record<string, Estimate> = Object.fromEntries(
      input.patterns.map((pattern, j) => [pattern.id, estimates[j + 1]]),
    );
    return {
      handSize, success: estimates[0], perPattern,
      elapsedMs: performance.now() - start + (i === 0 ? preparationMs : 0),
    };
  });
}
