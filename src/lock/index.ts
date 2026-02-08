import { writeFile, unlink, readFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { LockFile } from '../models/flow';

console.warn = (...args: unknown[]) => {
  console.error('[WARN]', ...args);
};

export const LOCK_FILE_PATH = './tmp/automation.lock';
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

export async function acquireLock(flowFile: string): Promise<boolean> {
  const now = Date.now();

  try {
    // Ensure tmp directory exists
    await mkdir(dirname(LOCK_FILE_PATH), { recursive: true });

    let existingLockContent: string;
    try {
      existingLockContent = await readFile(LOCK_FILE_PATH, 'utf-8');
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        throw err;
      }
      existingLockContent = '';
    }

    if (existingLockContent) {
      try {
        const existingLock: LockFile = JSON.parse(existingLockContent);
        const createdAt = new Date(existingLock.created_at).getTime();
        const lockAge = now - createdAt;

        if (lockAge < LOCK_TIMEOUT_MS) {
          return false;
        }

        await unlink(LOCK_FILE_PATH);
      } catch (parseError: unknown) {
        if (parseError instanceof SyntaxError) {
          console.warn('Corrupted lock file detected. Cleaning up...');
          try {
            await unlink(LOCK_FILE_PATH);
          } catch (unlinkError: unknown) {
            const err = unlinkError as NodeJS.ErrnoException;
            if (err.code !== 'ENOENT') {
              throw unlinkError;
            }
          }
        } else {
          const err = parseError as NodeJS.ErrnoException;
          if (err.code !== 'ENOENT') {
            throw parseError;
          }
        }
      }
    }

    const lockData: LockFile = {
      pid: process.pid,
      created_at: new Date().toISOString(),
      flow_file: flowFile,
      status: 'active'
    };

    await writeFile(LOCK_FILE_PATH, JSON.stringify(lockData, null, 2), { flag: 'wx' });
    return true;
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'EEXIST') {
      return false;
    }
    throw error;
  }
}

export async function releaseLock(): Promise<void> {
  try {
    await unlink(LOCK_FILE_PATH);
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}
