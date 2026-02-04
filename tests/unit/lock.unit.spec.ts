import { test, expect } from '@playwright/test';
import { writeFile, unlink, readFile } from 'fs/promises';
import { acquireLock, releaseLock } from '../../src/lock/index';

const LOCK_FILE_PATH = '/tmp/automation.lock';
const FLOW_FILE = '/test/flow.yaml';

test.describe.configure({ mode: 'serial' });

test.describe('Lock File Management', () => {
  test.beforeEach(async () => {
    try {
      await unlink(LOCK_FILE_PATH);
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        throw error;
      }
    }
  });

  test.afterEach(async () => {
    try {
      await unlink(LOCK_FILE_PATH);
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        throw error;
      }
    }
  });

  test.describe('Acquire Lock', () => {
    test('should acquire lock when none exists', async () => {
      const result = await acquireLock(FLOW_FILE);

      expect(result).toBe(true);

      const lockContent = await readFile(LOCK_FILE_PATH, 'utf-8');
      const lockData = JSON.parse(lockContent);

      expect(lockData.pid).toBe(process.pid);
      expect(lockData.flow_file).toBe(FLOW_FILE);
      expect(lockData.status).toBe('active');
      expect(lockData.created_at).toBeDefined();
    });

    test('should reject concurrent lock attempts', async () => {
      const firstResult = await acquireLock(FLOW_FILE);
      expect(firstResult).toBe(true);

      const secondResult = await acquireLock(FLOW_FILE);
      expect(secondResult).toBe(false);
    });

    test('should clean up stale locks older than 5 minutes and acquire new lock', async () => {
      const staleTime = new Date(Date.now() - 6 * 60 * 1000).toISOString();

      const staleLockData = {
        pid: 999,
        created_at: staleTime,
        flow_file: FLOW_FILE,
        status: 'active'
      };
      await writeFile(LOCK_FILE_PATH, JSON.stringify(staleLockData, null, 2));

      const result = await acquireLock(FLOW_FILE);
      expect(result).toBe(true);

      const lockContent = await readFile(LOCK_FILE_PATH, 'utf-8');
      const lockData = JSON.parse(lockContent);

      expect(lockData.pid).toBe(process.pid);
      expect(lockData.created_at).not.toBe(staleTime);
    });

    test('should not acquire lock if recent (less than 5 minutes)', async () => {
      const recentTime = new Date(Date.now() - 2 * 60 * 1000).toISOString();

      const recentLockData = {
        pid: 999,
        created_at: recentTime,
        flow_file: FLOW_FILE,
        status: 'active'
      };
      await writeFile(LOCK_FILE_PATH, JSON.stringify(recentLockData, null, 2));

      const result = await acquireLock(FLOW_FILE);
      expect(result).toBe(false);
    });

    test('should handle corrupted lock files by deleting and acquiring new lock', async () => {
      await writeFile(LOCK_FILE_PATH, '{invalid json content}');

      const result = await acquireLock(FLOW_FILE);
      expect(result).toBe(true);

      const lockContent = await readFile(LOCK_FILE_PATH, 'utf-8');
      const lockData = JSON.parse(lockContent);

      expect(lockData.pid).toBe(process.pid);
      expect(lockData.flow_file).toBe(FLOW_FILE);
      expect(lockData.status).toBe('active');
    });

    test('should handle corrupted lock files with partially valid but malformed content', async () => {
      await writeFile(LOCK_FILE_PATH, '{"pid": 123, "created_at": "2025-01-01T00:00:00.000Z", "incomplete":');

      const result = await acquireLock(FLOW_FILE);
      expect(result).toBe(true);

      const lockContent = await readFile(LOCK_FILE_PATH, 'utf-8');
      const lockData = JSON.parse(lockContent);

      expect(lockData.pid).toBe(process.pid);
      expect(lockData.flow_file).toBe(FLOW_FILE);
    });
  });

  test.describe('Release Lock', () => {
    test('should release lock and remove lock file', async () => {
      await acquireLock(FLOW_FILE);
      expect(await readFile(LOCK_FILE_PATH, 'utf-8')).toBeDefined();

      await releaseLock();

      await expect(async () => {
        await readFile(LOCK_FILE_PATH, 'utf-8');
      }).rejects.toThrow('ENOENT');
    });

    test('should release lock without error when file does not exist', async () => {
      await expect(releaseLock()).resolves.not.toThrow();
    });

    test('should allow new lock acquisition after release', async () => {
      const firstResult = await acquireLock(FLOW_FILE);
      expect(firstResult).toBe(true);

      await releaseLock();

      const secondResult = await acquireLock(FLOW_FILE);
      expect(secondResult).toBe(true);
    });
  });

  test.describe('Lock File Integrity', () => {
    test('should maintain correct lock file structure', async () => {
      await acquireLock(FLOW_FILE);

      const lockContent = await readFile(LOCK_FILE_PATH, 'utf-8');
      const lockData = JSON.parse(lockContent);

      expect(lockData).toHaveProperty('pid');
      expect(lockData).toHaveProperty('created_at');
      expect(lockData).toHaveProperty('flow_file');
      expect(lockData).toHaveProperty('status');

      expect(typeof lockData.pid).toBe('number');
      expect(typeof lockData.created_at).toBe('string');
      expect(typeof lockData.flow_file).toBe('string');
      expect(typeof lockData.status).toBe('string');

      expect(lockData.status).toBe('active');
      expect(lockData.flow_file).toBe(FLOW_FILE);
    });

    test('should use ISO date format for created_at timestamp', async () => {
      await acquireLock(FLOW_FILE);

      const lockContent = await readFile(LOCK_FILE_PATH, 'utf-8');
      const lockData = JSON.parse(lockContent);

      const parsedDate = new Date(lockData.created_at);
      expect(parsedDate.toISOString()).toBe(lockData.created_at);
      expect(parsedDate.getTime()).toBeLessThanOrEqual(Date.now());
      expect(parsedDate.getTime()).toBeGreaterThan(Date.now() - 1000);
    });
  });

  test.describe('Edge Cases', () => {
    test('should handle rapid acquire and release cycles', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await acquireLock(FLOW_FILE);
        expect(result).toBe(true);
        await releaseLock();
      }
    });

    test('should handle concurrent acquisitions with proper rejection', async () => {
      const result1 = await acquireLock(FLOW_FILE);
      expect(result1).toBe(true);

      const result2 = await acquireLock(FLOW_FILE);
      const result3 = await acquireLock(FLOW_FILE);
      const result4 = await acquireLock(FLOW_FILE);

      expect(result2).toBe(false);
      expect(result3).toBe(false);
      expect(result4).toBe(false);

      await releaseLock();
      const result5 = await acquireLock(FLOW_FILE);
      expect(result5).toBe(true);
    });

    test('should handle different flow files in lock acquisition', async () => {
      const flowFile1 = '/test/flow1.yaml';
      const flowFile2 = '/test/flow2.yaml';

      const result1 = await acquireLock(flowFile1);
      expect(result1).toBe(true);

      const result2 = await acquireLock(flowFile2);
      expect(result2).toBe(false);
    });

    test('should handle lock timeout exactly at 5 minute boundary', async () => {
      const boundaryTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const boundaryLockData = {
        pid: 999,
        created_at: boundaryTime,
        flow_file: FLOW_FILE,
        status: 'active'
      };
      await writeFile(LOCK_FILE_PATH, JSON.stringify(boundaryLockData, null, 2));

      const result = await acquireLock(FLOW_FILE);
      expect(result).toBe(true);
    });

    test('should handle lock just under 5 minute threshold', async () => {
      const justUnderTime = new Date(Date.now() - 5 * 60 * 1000 + 100).toISOString();

      const recentLockData = {
        pid: 999,
        created_at: justUnderTime,
        flow_file: FLOW_FILE,
        status: 'active'
      };
      await writeFile(LOCK_FILE_PATH, JSON.stringify(recentLockData, null, 2));

      const result = await acquireLock(FLOW_FILE);
      expect(result).toBe(false);
    });
  });
});
