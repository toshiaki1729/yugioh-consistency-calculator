import { countStates, runExact } from './exact';
import { project } from './project';
import { runSampling } from './sampling';
import { runSimulation } from './simulateRun';
import type {
  CalculationInput, EngineInput, Estimate, HandResult, ProgressCallback,
} from './types';

/** 選択済みの方式で計算し、全手札枚数の進捗と結果を返す。 */
export function runCalculation(
  calculation: CalculationInput, onProgress?: ProgressCallback,
): HandResult[] {
  if (calculation.mode === 'classes') return runEngine(calculation.input, onProgress);
  const { input } = calculation;
  const total = input.limits.samples * input.handSizes.length;
  let done = 0;
  onProgress?.(0, total);
  return input.handSizes.map(handSize => {
    const start = performance.now();
    const reportProgress = (localDone: number) => onProgress?.(done + localDone, total);
    const result = runSimulation(input, handSize, onProgress ? reportProgress : undefined);
    done += input.limits.samples;
    return { handSize, ...result, elapsedMs: performance.now() - start };
  });
}

/** 全体とパターン別の計算方式を選び、結果をまとめる。 */
export function runEngine(input: EngineInput, onProgress?: ProgressCallback): HandResult[] {
  const preparationStart = performance.now();
  const projections = input.patterns.map(pattern => project(input, pattern));
  const jobs = input.handSizes.map(handSize => [input, ...projections].map(source => {
    const states = source.patterns.length === 0 ? 0 : countStates(source, handSize);
    const isExact = states <= source.limits.exactMaxStates;
    return { source, states, isExact, work: isExact ? states : source.limits.samples };
  }));
  const preparationMs = performance.now() - preparationStart;
  const handWork = jobs.map(handJobs => handJobs.reduce((sum, job) => sum + job.work, 0));
  const total = handWork.reduce((sum, work) => sum + work, 0);
  let done = 0;
  onProgress?.(0, total);
  return input.handSizes.map((handSize, i) => {
    const start = performance.now();
    const estimates = jobs[i].map(job => {
      if (job.states === 0) return { p: 0, method: 'exact', states: 0 } as const;
      const reportProgress = (localDone: number) => onProgress?.(done + localDone, total);
      const progress = onProgress ? reportProgress : undefined;
      const estimate = job.isExact
        ? runExact(job.source, handSize, progress, job.states).estimate
        : runSampling(job.source, handSize, progress);
      done += job.work;
      return estimate;
    });
    const perPattern: Record<string, Estimate> = Object.fromEntries(
      [
        ...input.patterns.map((pattern, j) => [pattern.id, estimates[j + 1]]),
        ...(input.impossiblePatternIds ?? []).map(id => [id, { p: 0, method: 'exact', states: 0 }]),
      ],
    );
    return {
      handSize, success: estimates[0], perPattern,
      elapsedMs: performance.now() - start + (i === 0 ? preparationMs : 0),
    };
  });
}
