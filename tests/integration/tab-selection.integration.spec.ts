import { test, expect } from '@playwright/test';
import { 
  selectTabByTitle, 
  selectTabByUrlPrefix, 
  selectFirstTab 
} from '../../src/runner/cdp-connector.js';

test.describe.configure({ mode: 'serial' });

test.describe('Tab Selection Edge Cases', () => {
  let context1: any;
  let context2: any;
  let page1: any;
  let page2: any;
  let page3: any;

  async function setupMockRoutes(page: any) {
    await page.route('**/*', async (route: any) => {
      const url = route.request().url();
      let title = 'Page';
      if (url.includes('page1')) title = 'Page 1';
      else if (url.includes('page2')) title = 'Page 2';
      else if (url.includes('page3')) title = 'Page 3';
      else if (url.includes('settings')) title = 'Settings';
      else if (url.includes('dashboard')) title = 'Dashboard';
      else if (url.includes('profile')) title = 'Profile';
      else if (url.includes('other')) title = 'Other';

      const html = `<html><head><title>${title}</title></head><body>${title}</body></html>`;
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: html
      });
    });
  }

  test.beforeEach(async ({ browser }) => {
    context1 = await browser.newContext();
    context2 = await browser.newContext();
    
    page1 = await context1.newPage();
    page2 = await context1.newPage();
    page3 = await context2.newPage();

    await setupMockRoutes(page1);
    await setupMockRoutes(page2);
    await setupMockRoutes(page3);
  });

  test.afterEach(async () => {
    await page1?.close();
    await page2?.close();
    await page3?.close();
    await context1?.close();
    await context2?.close();
  });

  test.describe('selectTabByUrlPrefix', () => {
    test('should fallback to first tab when multiple tabs match URL prefix', async ({ browser }) => {
      await page1.goto('http://localhost:9000/page1');
      await page2.goto('http://localhost:9000/page2');
      await page3.goto('http://localhost:9001/page');

      const selectedPage = await selectTabByUrlPrefix(browser, 'http://localhost:9000');
      expect(selectedPage).not.toBeNull();
      expect(selectedPage?.url()).toBe('http://localhost:9000/page1');
    });

    test('should return unique tab when exactly one tab matches URL prefix', async ({ browser }) => {
      await page1.goto('http://localhost:9000/page1');
      await page2.goto('http://localhost:9001/page2');
      await page3.goto('http://localhost:9002/page');

      const selectedPage = await selectTabByUrlPrefix(browser, 'http://localhost:9000');
      expect(selectedPage).not.toBeNull();
      expect(selectedPage?.url()).toBe('http://localhost:9000/page1');
    });

    test('should fallback to first tab when multiple title matches exist', async ({ browser }) => {
      await page1.goto('http://localhost:9000/dashboard');
      await page2.goto('http://localhost:9001/settings');
      await page3.goto('http://localhost:9002/dashboard');

      const selectedPage = await selectTabByUrlPrefix(browser, 'http://localhost:9999', 'Dashboard');
      expect(selectedPage).not.toBeNull();
      expect(selectedPage?.url()).toBe('http://localhost:9000/dashboard');
    });

    test('should fallback to title match when unique title match exists', async ({ browser }) => {
      await page1.goto('http://localhost:9000/dashboard');
      await page2.goto('http://localhost:9001/settings');
      await page3.goto('http://localhost:9002/profile');

      const selectedPage = await selectTabByUrlPrefix(browser, 'http://localhost:9999', 'Settings');
      expect(selectedPage).not.toBeNull();
      expect(selectedPage?.url()).toBe('http://localhost:9001/settings');
    });

    test('should fallback to first tab when no URL or title match', async ({ browser }) => {
      await page1.goto('http://localhost:9000/page1');
      await page2.goto('http://localhost:9001/page2');
      await page3.goto('http://localhost:9002/page3');

      const selectedPage = await selectTabByUrlPrefix(browser, 'http://localhost:9999', 'NonExistentTitle');
      expect(selectedPage).not.toBeNull();
      expect(selectedPage?.url()).toBe('http://localhost:9000/page1');
    });
  });

  test.describe('selectTabByTitle', () => {
    test('should return page when exactly one tab matches title', async ({ browser }) => {
      await page1.goto('http://localhost:9000/dashboard');
      await page2.goto('http://localhost:9001/settings');
      await page3.goto('http://localhost:9002/profile');

      const selectedPage = await selectTabByTitle(browser, 'Settings');
      expect(selectedPage).not.toBeNull();
      expect(selectedPage?.url()).toBe('http://localhost:9001/settings');
    });

    test('should return null when multiple tabs match title', async ({ browser }) => {
      await page1.goto('http://localhost:9000/dashboard');
      await page2.goto('http://localhost:9001/dashboard');
      await page3.goto('http://localhost:9002/profile');

      const selectedPage = await selectTabByTitle(browser, 'Dashboard');
      expect(selectedPage).toBeNull();
    });

    test('should return null when no tabs match title', async ({ browser }) => {
      await page1.goto('http://localhost:9000/page1');
      await page2.goto('http://localhost:9001/page2');

      const selectedPage = await selectTabByTitle(browser, 'NonExistentTitle');
      expect(selectedPage).toBeNull();
    });

    test('should return null when title is undefined', async ({ browser }) => {
      await page1.goto('http://localhost:9000/page1');

      const selectedPage = await selectTabByTitle(browser, undefined);
      expect(selectedPage).toBeNull();
    });

    test('should return null when title is empty string', async ({ browser }) => {
      await page1.goto('http://localhost:9000/page1');

      const selectedPage = await selectTabByTitle(browser, '');
      expect(selectedPage).toBeNull();
    });
  });

  test.describe('selectFirstTab', () => {
    test('should return first tab when tabs are available', async ({ browser }) => {
      await page1.goto('http://localhost:9000/page1');
      await page2.goto('http://localhost:9001/page2');
      await page3.goto('http://localhost:9002/page');

      const selectedPage = await selectFirstTab(browser);
      expect(selectedPage).not.toBeNull();
      expect(selectedPage?.url()).toBe('http://localhost:9000/page1');
    });

    test('should return null when no tabs are available', async ({ browser }) => {
      await page1.close();
      await page2.close();
      await page3.close();

      const selectedPage = await selectFirstTab(browser);
      expect(selectedPage).toBeNull();
    });

    test('should return first tab from first context when multiple contexts exist', async ({ browser }) => {
      await page1.goto('http://localhost:9000/page1');
      await page2.goto('http://localhost:9001/page2');
      await page3.goto('http://localhost:9002/page3');

      const selectedPage = await selectFirstTab(browser);
      expect(selectedPage).not.toBeNull();
      expect(selectedPage?.url()).toBe('http://localhost:9000/page1');
    });
  });

  test.describe('Dynamic tab creation and closing', () => {
    test('should handle newly created tabs correctly', async ({ browser }) => {
      await page1.goto('http://localhost:9000/page1');

      let selectedPage = await selectFirstTab(browser);
      expect(selectedPage?.url()).toBe('http://localhost:9000/page1');

      const newPage = await context1.newPage();
      await setupMockRoutes(newPage);
      await newPage.goto('http://localhost:9000/page2');

      selectedPage = await selectFirstTab(browser);
      expect(selectedPage?.url()).toBe('http://localhost:9000/page1');

      await newPage.close();
    });

    test('should handle closed tabs gracefully', async ({ browser }) => {
      await page1.goto('http://localhost:9000/page1');
      await page2.goto('http://localhost:9001/page2');

      await page1.close();

      const selectedPage = await selectFirstTab(browser);
      expect(selectedPage?.url()).toBe('http://localhost:9001/page2');
    });

    test('should return null after closing all tabs', async ({ browser }) => {
      await page1.goto('http://localhost:9000/page1');

      let selectedPage = await selectFirstTab(browser);
      expect(selectedPage).not.toBeNull();

      await page1.close();
      await page2.close();
      await page3.close();

      selectedPage = await selectFirstTab(browser);
      expect(selectedPage).toBeNull();
    });

    test('should handle tabs closing during iteration', async ({ browser }) => {
      await page1.goto('http://localhost:9000/page1');
      await page2.goto('http://localhost:9001/page2');

      let selectedPage = await selectTabByTitle(browser, 'Page 2');
      expect(selectedPage?.url()).toBe('http://localhost:9001/page2');

      await page2.close();

      selectedPage = await selectTabByTitle(browser, 'Page 2');
      expect(selectedPage).toBeNull();
    });
  });

  test.describe('URL prefix edge cases', () => {
    test('should fallback to first tab when trailing slash does not match', async ({ browser }) => {
      await page1.goto('http://localhost:9000/page');

      const selectedPage = await selectTabByUrlPrefix(browser, 'http://localhost:9000/');
      expect(selectedPage).not.toBeNull();
      expect(selectedPage?.url()).toBe('http://localhost:9000/page');
    });

    test('should handle URL prefix without trailing slash', async ({ browser }) => {
      await page1.goto('http://localhost:9000/page');

      const selectedPage = await selectTabByUrlPrefix(browser, 'http://localhost:9000');
      expect(selectedPage?.url()).toBe('http://localhost:9000/page');
    });

    test('should handle URL prefix with query parameters', async ({ browser }) => {
      await page1.goto('http://localhost:9000/page?param=value');

      const selectedPage = await selectTabByUrlPrefix(browser, 'http://localhost:9000');
      expect(selectedPage?.url()).toBe('http://localhost:9000/page?param=value');
    });

    test('should handle URL prefix with hash fragments', async ({ browser }) => {
      await page1.goto('http://localhost:9000/page#section');

      const selectedPage = await selectTabByUrlPrefix(browser, 'http://localhost:9000');
      expect(selectedPage?.url()).toBe('http://localhost:9000/page#section');
    });

    test('should handle URL prefix with port numbers', async ({ browser }) => {
      await page1.goto('http://localhost:8080/page');

      const selectedPage = await selectTabByUrlPrefix(browser, 'http://localhost:8080');
      expect(selectedPage?.url()).toBe('http://localhost:8080/page');
    });
  });
});
