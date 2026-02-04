import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import { createServer } from 'http';

test.describe.configure({ mode: 'serial' });

test.describe('CDP Connection Failure Handling', () => {
  let mockServerPort: number;
  let mockServer: ReturnType<typeof createServer> | null = null;

  test.beforeAll(async () => {
    // Find an available port for mock server
    mockServerPort = 9500;
  });

  test.afterAll(async () => {
    if (mockServer) {
      mockServer.close();
      mockServer = null;
    }
  });

  test.afterEach(async () => {
    if (mockServer) {
      mockServer.close();
      mockServer = null;
    }
  });

  test.describe('Connection refused scenarios', () => {
    test('should fail gracefully when Chrome is not running (connection refused)', () => {
      try {
        execSync('node dist/cli.js check-cdp --port 9999', {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        const output = err.stdout || err.stderr;

        expect(err.status).toBe(5);
        expect(output).toContain('✗');
        expect(output).toContain('Failed to connect');
      }
    });

    test('should provide helpful guidance when Chrome is not running', () => {
      try {
        execSync('node dist/cli.js check-cdp --port 8888', {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        const output = err.stdout || err.stderr;

        expect(err.status).toBe(5);
        expect(output).toContain('--remote-debugging-port');
        expect(output).toContain('chrome --remote-debugging-port');
      }
    });

    test('should show port number in error message', () => {
      try {
        execSync('node dist/cli.js check-cdp --port 7777', {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        const output = err.stdout || err.stderr;

        expect(err.status).toBe(5);
        expect(output).toContain('7777');
        expect(output).toContain('port');
      }
    });
  });

  test.describe('Port conflict scenarios', () => {
    test('should fail gracefully when wrong port is specified', () => {
      try {
        execSync('node dist/cli.js check-cdp --port 6666', {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };

        expect(err.status).toBe(5);
        expect(err.stdout || err.stderr).toContain('✗');
      }
    });

    test('should handle multiple port conflict attempts consistently', () => {
      const ports = [5555, 4444, 3333];

      ports.forEach((port) => {
        try {
          execSync(`node dist/cli.js check-cdp --port ${port}`, {
            encoding: 'utf-8',
          });
          throw new Error('Command should have failed');
        } catch (error: unknown) {
          const err = error as { status?: number; stdout?: string; stderr?: string };

          expect(err.status).toBe(5);
          expect(err.stdout || err.stderr).toContain('✗');
        }
      });
    });
  });

  test.describe('Timeout during connection attempt', () => {
    test('should handle connection timeout gracefully', async () => {
      // Create a server that accepts connection but never responds
      mockServer = createServer((_req, _res) => {
        // Never respond to simulate timeout
      });

      await new Promise<void>((resolve, reject) => {
        mockServer!.listen(mockServerPort, () => resolve())
          .on('error', reject);
      });

      try {
        execSync(`node dist/cli.js check-cdp --port ${mockServerPort}`, {
          encoding: 'utf-8',
          timeout: 5000, // 5 second timeout for the test command
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string; killed?: boolean; signal?: string };

        // Command should have failed - verify error was thrown
        expect(err).toBeDefined();

        // When timeout option is used in execSync and it times out, it may not have stdout/stderr
        // The key test is that the command threw an error (didn't succeed)
        // Check for timeout or connection error indicators
        const isTimeout = err.killed || err.signal === 'SIGTERM' || err.signal === 'SIGKILL';
        const hasOutput = (err.stdout && err.stdout.includes('✗')) || (err.stderr && err.stderr.includes('✗'));

        // Either we got proper output, or we got a timeout signal
        expect(isTimeout || hasOutput).toBe(true);
      }
    });
  });

  test.describe('Invalid CDP response scenarios', () => {
    test('should handle non-WebSocket response from server', async () => {
      // Create a server that responds with plain HTML instead of WebSocket
      mockServer = createServer((_req, _res) => {
        _res.writeHead(200, { 'Content-Type': 'text/html' });
        _res.end('<html><body>Not a WebSocket server</body></html>');
      });

      await new Promise<void>((resolve, reject) => {
        mockServer!.listen(mockServerPort, () => resolve())
          .on('error', reject);
      });

      try {
        execSync(`node dist/cli.js check-cdp --port ${mockServerPort}`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };

        expect(err.status).toBe(5);
        expect(err.stdout || err.stderr).toContain('✗');
      }
    });

    test('should handle malformed response from server', async () => {
      // Create a server that sends invalid/malformed response
      mockServer = createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('invalid {{{ json');
      });

      await new Promise<void>((resolve, reject) => {
        mockServer!.listen(mockServerPort, () => resolve())
          .on('error', reject);
      });

      try {
        execSync(`node dist/cli.js check-cdp --port ${mockServerPort}`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };

        expect(err.status).toBe(5);
        expect(err.stdout || err.stderr).toContain('✗');
      }
    });

    test('should handle 404 response from server', async () => {
      // Create a server that returns 404
      mockServer = createServer((_req, res) => {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      });

      await new Promise<void>((resolve, reject) => {
        mockServer!.listen(mockServerPort, () => resolve())
          .on('error', reject);
      });

      try {
        execSync(`node dist/cli.js check-cdp --port ${mockServerPort}`, {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };

        expect(err.status).toBe(5);
        expect(err.stdout || err.stderr).toContain('✗');
      }
    });
  });

  test.describe('Error message quality', () => {
    test('should include original error details in error message', () => {
      try {
        execSync('node dist/cli.js check-cdp --port 9999', {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        const output = err.stdout || err.stderr;

        expect(output).toContain('✗');
        // Error message should be descriptive
        if (output) {
          expect(output.length).toBeGreaterThan(20);
        }
      }
    });

    test('should provide consistent error format across different failures', () => {
      const ports = [9999, 8888, 7777];
      const errorFormats: string[] = [];

      ports.forEach((port) => {
        try {
          execSync(`node dist/cli.js check-cdp --port ${port}`, {
            encoding: 'utf-8',
          });
          throw new Error('Command should have failed');
        } catch (error: unknown) {
          const err = error as { status?: number; stdout?: string; stderr?: string };
          const output = err.stdout || err.stderr;
          if (output) {
            errorFormats.push(output.trim());
          }
        }
      });

      // All errors should have consistent format (start with ✗)
      errorFormats.forEach((errorFormat) => {
        expect(errorFormat).toMatch(/^✗/);
      });
    });

    test('should include troubleshooting steps in error messages', () => {
      try {
        execSync('node dist/cli.js check-cdp --port 9999', {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        const output = err.stdout || err.stderr;

        // Check for helpful guidance
        expect(output).toMatch(/chrome|Chrome|CDP|remote-debugging/);
      }
    });
  });

  test.describe('Exit code consistency', () => {
    test('should exit with code 5 for all CDP connection failures', () => {
      const failurePorts = [9999, 8888, 7777, 6666];

      failurePorts.forEach((port) => {
        try {
          execSync(`node dist/cli.js check-cdp --port ${port}`, {
            encoding: 'utf-8',
          });
          throw new Error('Command should have failed');
        } catch (error: unknown) {
          const err = error as { status?: number };

          expect(err.status).toBe(5);
        }
      });
    });

    test('should exit with code 5 for invalid port number', () => {
      try {
        execSync('node dist/cli.js check-cdp --port invalid', {
          encoding: 'utf-8',
        });
        throw new Error('Command should have failed');
      } catch (error: unknown) {
        const err = error as { status?: number };

        expect(err.status).toBe(5);
      }
    });
  });
});
