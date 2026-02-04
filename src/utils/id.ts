/**
 * Generates a unique run ID using timestamp and random suffix.
 *
 * @returns string - Unique run ID in format: run_<timestamp>_<random>
 *
 * @example
 * const runId = generateRunId();
 * console.log(runId); // e.g., "run_1704067200000_abc123"
 */
export function generateRunId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `run_${timestamp}_${random}`;
}
