import { appendFile, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { LogEntry } from '../models/flow';
import { getLogsPath } from '../config/index.js';

export interface Logger {
  logStep(entry: Omit<LogEntry, 'run_id' | 'user_id' | 'timestamp'>): Promise<void>;
}

export async function createLogger(run_id: string, user_id: string): Promise<Logger> {
  const logsDir = getLogsPath();
  await mkdir(logsDir, { recursive: true });

  const logPath = join(logsDir, `${run_id}.csv`);
  const header = 'run_id,user_id,timestamp,step_no,url,action,target,result,error\n';

  try {
    await writeFile(logPath, header, { flag: 'wx' });
  } catch {}

  return {
    async logStep(entry: Omit<LogEntry, 'run_id' | 'user_id' | 'timestamp'>): Promise<void> {
      const timestamp = new Date().toISOString();
      const logEntry: LogEntry = {
        run_id,
        user_id,
        timestamp,
        ...entry,
      };

      const csvRow = [
        logEntry.run_id,
        logEntry.user_id,
        logEntry.timestamp,
        logEntry.step_no,
        logEntry.url,
        logEntry.action,
        logEntry.target,
        logEntry.result,
        logEntry.error ?? '',
      ].join(',');

      await appendFile(logPath, csvRow + '\n');
    },
  };
}

export async function logStep(entry: LogEntry): Promise<void> {
  const logsDir = getLogsPath();
  await mkdir(logsDir, { recursive: true });

  const logPath = join(logsDir, `${entry.run_id}.csv`);
  const header = 'run_id,user_id,timestamp,step_no,url,action,target,result,error\n';

  try {
    await writeFile(logPath, header, { flag: 'wx' });
  } catch {}

  const csvRow = [
    entry.run_id,
    entry.user_id,
    entry.timestamp,
    entry.step_no,
    entry.url,
    entry.action,
    entry.target,
    entry.result,
    entry.error ?? '',
  ].join(',');

  await appendFile(logPath, csvRow + '\n');
}
