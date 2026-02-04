import { test, expect } from '@playwright/test';
import { connectToChrome, getChromeVersion, CDPConnector } from '../../src/runner/cdp-connector';
import { chromium, type Browser } from 'playwright';

test.describe.configure({ mode: 'serial' });

const shouldSkipCDPTests = process.env.SKIP_CDP_TESTS !== 'false';

test.describe('CDP Connector', () => {
  test.describe('connectToChrome', () => {
    test('should connect to running Chrome with CDP and return Browser', async () => {
      test.skip(shouldSkipCDPTests, 'Skipping CDP tests - set SKIP_CDP_TESTS=false to run integration tests');

      const browser: Browser = await connectToChrome(9222);

      expect(browser).toBeDefined();
      expect(typeof browser.version).toBe('function');
      expect(typeof browser.close).toBe('function');

      await browser.close();
    });

    test('should fail gracefully when Chrome not running and throw error', async () => {
      const port = 9999;

      await expect(connectToChrome(port)).rejects.toThrow(
        `Failed to connect to Chrome via CDP on port ${port}`
      );
    });

    test('should fail gracefully with descriptive error message', async () => {
      const port = 9999;

      await expect(connectToChrome(port)).rejects.toThrow(
        /Failed to connect to Chrome via CDP/
      );
      await expect(connectToChrome(port)).rejects.toThrow(
        /Ensure Chrome is running with --remote-debugging-port=9999/
      );
    });

    test('should connect to default port 9222 when no port specified', async () => {
      test.skip(shouldSkipCDPTests, 'Skipping CDP tests - set SKIP_CDP_TESTS=false to run integration tests');

      const browser: Browser = await connectToChrome();

      expect(browser).toBeDefined();

      await browser.close();
    });

    test('should handle CDP protocol version mismatch and throw error', async () => {
      test.skip(shouldSkipCDPTests, 'Skipping CDP tests - set SKIP_CDP_TESTS=false to run integration tests');

      await expect(connectToChrome(9222)).rejects.toThrow();
    });
  });

  test.describe('getChromeVersion', () => {
    test('should detect and report Chrome version', async () => {
      test.skip(shouldSkipCDPTests, 'Skipping CDP tests - set SKIP_CDP_TESTS=false to run integration tests');

      const browser: Browser = await connectToChrome(9222);

      const version: string = await getChromeVersion(browser);

      expect(version).toBeDefined();
      expect(typeof version).toBe('string');
      expect(version.length).toBeGreaterThan(0);

      expect(version).toMatch(/Chrome|Chromium/);

      await browser.close();
    });

    test('should fail gracefully when browser is disconnected', async () => {
      const mockBrowser = {
        version: async () => {
          throw new Error('Browser has been disconnected');
        }
      } as unknown as Browser;

      await expect(getChromeVersion(mockBrowser)).rejects.toThrow(
        'Failed to get Chrome version'
      );
    });

    test('should fail gracefully with descriptive error message', async () => {
      const mockBrowser = {
        version: async () => {
          throw new Error('Connection closed');
        }
      } as unknown as Browser;

      await expect(getChromeVersion(mockBrowser)).rejects.toThrow(
        /Failed to get Chrome version/
      );
      await expect(getChromeVersion(mockBrowser)).rejects.toThrow(
        /Connection closed/
      );
    });
  });

  test.describe('CDPConnector class', () => {
    test('should connect to a page successfully', async () => {
      test.skip(shouldSkipCDPTests, 'Skipping CDP tests - set SKIP_CDP_TESTS=false to run integration tests');

      const browser: Browser = await connectToChrome(9222);
      const page = await browser.newPage();

      const connector = new CDPConnector();
      await connector.connect(page);

      expect(connector.isConnected()).toBe(true);
      expect(connector.getPage()).toBe(page);

      await browser.close();
    });

    test('should disconnect from a page successfully', async () => {
      test.skip(shouldSkipCDPTests, 'Skipping CDP tests - set SKIP_CDP_TESTS=false to run integration tests');

      const browser: Browser = await connectToChrome(9222);
      const page = await browser.newPage();

      const connector = new CDPConnector();
      await connector.connect(page);
      expect(connector.isConnected()).toBe(true);

      await connector.disconnect();
      expect(connector.isConnected()).toBe(false);

      await browser.close();
    });

    test('should throw error when getting page before connection', async () => {
      const connector = new CDPConnector();

      expect(() => connector.getPage()).toThrow('CDP not connected');
    });

    test('should return correct connection status', async () => {
      test.skip(shouldSkipCDPTests, 'Skipping CDP tests - set SKIP_CDP_TESTS=false to run integration tests');

      const connector = new CDPConnector();

      const browser: Browser = await connectToChrome(9222);
      const page = await browser.newPage();

      await connector.connect(page);
      expect(connector.isConnected()).toBe(true);

      await connector.disconnect();
      expect(connector.isConnected()).toBe(false);

      await browser.close();
    });
  });

  test.describe('Integration tests', () => {
    test('should connect, get version, and close browser', async () => {
      test.skip(shouldSkipCDPTests, 'Skipping CDP tests - set SKIP_CDP_TESTS=false to run integration tests');

      const browser: Browser = await connectToChrome(9222);
      const version: string = await getChromeVersion(browser);

      expect(browser).toBeDefined();
      expect(version).toBeDefined();
      expect(version).toMatch(/Chrome|Chromium/);

      await browser.close();
    });

    test('should handle multiple sequential connections', async () => {
      test.skip(shouldSkipCDPTests, 'Skipping CDP tests - set SKIP_CDP_TESTS=false to run integration tests');

      for (let i = 0; i < 3; i++) {
        const browser: Browser = await connectToChrome(9222);
        expect(browser).toBeDefined();

        const version: string = await getChromeVersion(browser);
        expect(version).toBeDefined();

        await browser.close();
      }
    });
  });

  test.describe('Error handling', () => {
    test('should handle connection timeout gracefully', async () => {
      const originalConnect = chromium.connectOverCDP;
      chromium.connectOverCDP = async () => {
        throw new Error('Connection timed out');
      };

      try {
        await expect(connectToChrome(9222)).rejects.toThrow('Connection timed out');
      } finally {
        chromium.connectOverCDP = originalConnect;
      }
    });

    test('should handle network errors gracefully', async () => {
      const originalConnect = chromium.connectOverCDP;
      chromium.connectOverCDP = async () => {
        throw new Error('ECONNREFUSED');
      };

      try {
        await expect(connectToChrome(9222)).rejects.toThrow('ECONNREFUSED');
      } finally {
        chromium.connectOverCDP = originalConnect;
      }
    });

    test('should handle unknown errors in getChromeVersion', async () => {
      const mockBrowser = {
        version: async () => {
          // eslint-disable-next-line @typescript-eslint/no-throw-literal
          throw 'string error';
        }
      } as unknown as Browser;

      await expect(getChromeVersion(mockBrowser)).rejects.toThrow(
        'Failed to get Chrome version. Unknown error occurred.'
      );
    });

    test('should handle unknown errors in connectToChrome', async () => {
      const originalConnect = chromium.connectOverCDP;
      chromium.connectOverCDP = async () => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'string error';
      };

      try {
        await expect(connectToChrome(9222)).rejects.toThrow(
          'Failed to connect to Chrome via CDP on port 9222. Unknown error occurred.'
        );
      } finally {
        chromium.connectOverCDP = originalConnect;
      }
    });
  });
});
