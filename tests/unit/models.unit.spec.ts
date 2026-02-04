import { test, expect } from '@playwright/test';
import {
  ActionType,
  Step,
  Flow,
  RunMetadata,
  LogEntry,
  LockFile
} from '../../src/models/flow';

test.describe('Type Definitions', () => {
  test.describe('ActionType enum', () => {
    test('should have all required action types', () => {
      expect(ActionType.navigate).toBe('navigate');
      expect(ActionType.click).toBe('click');
      expect(ActionType.type).toBe('type');
      expect(ActionType.wait).toBe('wait');
      expect(ActionType.select).toBe('select');
    });

    test('should have exactly 7 action types', () => {
      const actionTypes = Object.values(ActionType);
      expect(actionTypes).toHaveLength(7);
      expect(actionTypes).toContain('navigate');
      expect(actionTypes).toContain('click');
      expect(actionTypes).toContain('click_at');
      expect(actionTypes).toContain('type');
      expect(actionTypes).toContain('wait');
      expect(actionTypes).toContain('select');
      expect(actionTypes).toContain('press');
    });
  });

  test.describe('Step interface', () => {
    test('should accept valid step data with all fields', () => {
      const step: Step = {
        step_no: 1,
        action: ActionType.navigate,
        target: 'https://example.com',
        value: 'test value',
        description: 'Navigate to homepage',
        timeout: 5000
      };

      expect(step.step_no).toBe(1);
      expect(step.action).toBe(ActionType.navigate);
      expect(step.target).toBe('https://example.com');
      expect(step.value).toBe('test value');
      expect(step.description).toBe('Navigate to homepage');
      expect(step.timeout).toBe(5000);
    });

    test('should accept valid step data without optional fields', () => {
      const step: Step = {
        step_no: 1,
        action: ActionType.click,
        target: '#submit-button',
        description: 'Click submit button'
      };

      expect(step.step_no).toBe(1);
      expect(step.action).toBe(ActionType.click);
      expect(step.target).toBe('#submit-button');
      expect(step.description).toBe('Click submit button');
      expect(step.value).toBeUndefined();
      expect(step.timeout).toBeUndefined();
    });

    test('should accept all ActionTypes', () => {
      const step1: Step = { step_no: 1, action: ActionType.navigate, target: '/', description: '' };
      const step2: Step = { step_no: 2, action: ActionType.click, target: '#btn', description: '' };
      const step3: Step = { step_no: 3, action: ActionType.type, target: '#input', description: '' };
      const step4: Step = { step_no: 4, action: ActionType.wait, target: '1000', description: '' };
      const step5: Step = { step_no: 5, action: ActionType.select, target: 'option', description: '' };

      expect(step1.action).toBe(ActionType.navigate);
      expect(step2.action).toBe(ActionType.click);
      expect(step3.action).toBe(ActionType.type);
      expect(step4.action).toBe(ActionType.wait);
      expect(step5.action).toBe(ActionType.select);
    });
  });

  test.describe('Flow interface', () => {
    test('should accept valid flow data with all steps', () => {
      const steps: Step[] = [
        {
          step_no: 1,
          action: ActionType.navigate,
          target: 'https://example.com',
          description: 'Navigate to homepage'
        },
        {
          step_no: 2,
          action: ActionType.click,
          target: '#submit-button',
          description: 'Click submit'
        }
      ];

      const flow: Flow = {
        name: 'Test Flow',
        description: 'A test automation flow',
        url_prefix: 'https://example.com',
        steps
      };

      expect(flow.name).toBe('Test Flow');
      expect(flow.description).toBe('A test automation flow');
      expect(flow.url_prefix).toBe('https://example.com');
      expect(flow.steps).toEqual(steps);
      expect(flow.steps).toHaveLength(2);
    });

    test('should accept flow with empty steps array', () => {
      const flow: Flow = {
        name: 'Empty Flow',
        description: 'Flow with no steps',
        url_prefix: 'https://example.com',
        steps: []
      };

      expect(flow.steps).toEqual([]);
      expect(flow.steps).toHaveLength(0);
    });

    test('should accept flow with steps containing optional fields', () => {
      const steps: Step[] = [
        {
          step_no: 1,
          action: ActionType.navigate,
          target: 'https://example.com',
          description: 'Navigate',
          timeout: 3000
        },
        {
          step_no: 2,
          action: ActionType.type,
          target: '#username',
          value: 'testuser',
          description: 'Type username',
          timeout: 5000
        }
      ];

      const flow: Flow = {
        name: 'Complex Flow',
        description: 'Flow with various step types',
        url_prefix: 'https://example.com',
        steps
      };

      expect(flow.steps[0].timeout).toBe(3000);
      expect(flow.steps[1].value).toBe('testuser');
    });
  });

  test.describe('RunMetadata interface', () => {
    test('should accept valid run metadata', () => {
      const metadata: RunMetadata = {
        run_id: 'run-123',
        user_id: 'user-456',
        timestamp: '2026-02-01T12:00:00Z'
      };

      expect(metadata.run_id).toBe('run-123');
      expect(metadata.user_id).toBe('user-456');
      expect(metadata.timestamp).toBe('2026-02-01T12:00:00Z');
    });

    test('should accept UUID-format strings for run_id', () => {
      const metadata: RunMetadata = {
        run_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: 'user-789',
        timestamp: '2026-02-01T12:00:00Z'
      };

      expect(metadata.run_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  test.describe('LogEntry interface', () => {
    test('should accept valid log entry without error', () => {
      const logEntry: LogEntry = {
        run_id: 'run-123',
        user_id: 'user-456',
        timestamp: '2026-02-01T12:00:00Z',
        step_no: 1,
        url: 'https://example.com',
        action: 'navigate',
        target: '/',
        result: 'success'
      };

      expect(logEntry.run_id).toBe('run-123');
      expect(logEntry.user_id).toBe('user-456');
      expect(logEntry.timestamp).toBe('2026-02-01T12:00:00Z');
      expect(logEntry.step_no).toBe(1);
      expect(logEntry.url).toBe('https://example.com');
      expect(logEntry.action).toBe('navigate');
      expect(logEntry.target).toBe('/');
      expect(logEntry.result).toBe('success');
      expect(logEntry.error).toBeUndefined();
    });

    test('should accept valid log entry with error', () => {
      const logEntry: LogEntry = {
        run_id: 'run-123',
        user_id: 'user-456',
        timestamp: '2026-02-01T12:00:01Z',
        step_no: 2,
        url: 'https://example.com/page2',
        action: 'click',
        target: '#missing-button',
        result: 'failed',
        error: 'Element not found: #missing-button'
      };

      expect(logEntry.run_id).toBe('run-123');
      expect(logEntry.user_id).toBe('user-456');
      expect(logEntry.timestamp).toBe('2026-02-01T12:00:01Z');
      expect(logEntry.step_no).toBe(2);
      expect(logEntry.url).toBe('https://example.com/page2');
      expect(logEntry.action).toBe('click');
      expect(logEntry.target).toBe('#missing-button');
      expect(logEntry.result).toBe('failed');
      expect(logEntry.error).toBe('Element not found: #missing-button');
    });

    test('should handle different result values', () => {
      const logEntry1: LogEntry = {
        run_id: 'run-1',
        user_id: 'user-1',
        timestamp: '2026-02-01T12:00:00Z',
        step_no: 1,
        url: 'https://example.com',
        action: 'navigate',
        target: '/',
        result: 'success'
      };

      const logEntry2: LogEntry = {
        run_id: 'run-2',
        user_id: 'user-2',
        timestamp: '2026-02-01T12:00:00Z',
        step_no: 1,
        url: 'https://example.com',
        action: 'click',
        target: '#btn',
        result: 'failed',
        error: 'Timeout'
      };

      const logEntry3: LogEntry = {
        run_id: 'run-3',
        user_id: 'user-3',
        timestamp: '2026-02-01T12:00:00Z',
        step_no: 1,
        url: 'https://example.com',
        action: 'wait',
        target: '1000',
        result: 'skipped'
      };

      expect(logEntry1.result).toBe('success');
      expect(logEntry2.result).toBe('failed');
      expect(logEntry3.result).toBe('skipped');
    });
  });

  test.describe('LockFile interface', () => {
    test('should accept valid lock file data', () => {
      const lockFile: LockFile = {
        pid: 12345,
        created_at: '2026-02-01T12:00:00Z',
        flow_file: '/path/to/flow.json',
        status: 'running'
      };

      expect(lockFile.pid).toBe(12345);
      expect(lockFile.created_at).toBe('2026-02-01T12:00:00Z');
      expect(lockFile.flow_file).toBe('/path/to/flow.json');
      expect(lockFile.status).toBe('running');
    });

    test('should accept different status values', () => {
      const lockFile1: LockFile = {
        pid: 12345,
        created_at: '2026-02-01T12:00:00Z',
        flow_file: '/path/to/flow1.json',
        status: 'running'
      };

      const lockFile2: LockFile = {
        pid: 67890,
        created_at: '2026-02-01T12:01:00Z',
        flow_file: '/path/to/flow2.json',
        status: 'completed'
      };

      const lockFile3: LockFile = {
        pid: 11111,
        created_at: '2026-02-01T12:02:00Z',
        flow_file: '/path/to/flow3.json',
        status: 'failed'
      };

      expect(lockFile1.status).toBe('running');
      expect(lockFile2.status).toBe('completed');
      expect(lockFile3.status).toBe('failed');
    });

    test('should accept realistic PID values', () => {
      const lockFile: LockFile = {
        pid: 99999,
        created_at: '2026-02-01T12:00:00Z',
        flow_file: '/flows/test.json',
        status: 'running'
      };

      expect(lockFile.pid).toBeGreaterThan(0);
      expect(lockFile.pid).toBeLessThan(1000000);
    });
  });

  test.describe('Type Integration', () => {
    test('should work together: Flow with Steps using ActionType', () => {
      const steps: Step[] = [
        { step_no: 1, action: ActionType.navigate, target: 'https://example.com', description: 'Navigate' },
        { step_no: 2, action: ActionType.type, target: '#email', value: 'test@example.com', description: 'Type email' },
        { step_no: 3, action: ActionType.click, target: '#submit', description: 'Submit' }
      ];

      const flow: Flow = {
        name: 'Login Flow',
        description: 'User login automation',
        url_prefix: 'https://example.com',
        steps
      };

      expect(flow.steps).toHaveLength(3);
      expect(flow.steps[0].action).toBe(ActionType.navigate);
      expect(flow.steps[1].action).toBe(ActionType.type);
      expect(flow.steps[2].action).toBe(ActionType.click);
    });

    test('should work together: LogEntry and RunMetadata correlation', () => {
      const runId = 'run-123';
      const userId = 'user-456';
      const timestamp = '2026-02-01T12:00:00Z';

      const metadata: RunMetadata = {
        run_id: runId,
        user_id: userId,
        timestamp
      };

      const logEntry: LogEntry = {
        run_id: runId,
        user_id: userId,
        timestamp,
        step_no: 1,
        url: 'https://example.com',
        action: 'navigate',
        target: '/',
        result: 'success'
      };

      expect(metadata.run_id).toBe(logEntry.run_id);
      expect(metadata.user_id).toBe(logEntry.user_id);
    });
  });
});
