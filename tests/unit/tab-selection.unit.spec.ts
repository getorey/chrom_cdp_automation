import { test, expect } from '@playwright/test';
import { selectTabByUrlPrefix, selectTabByTitle, selectFirstTab } from '../../src/runner/cdp-connector';
import type { Browser, Page, BrowserContext } from 'playwright';

test.describe('Tab Selection', () => {
  test.describe('selectTabByUrlPrefix', () => {
    test('should select tab matching URL prefix and return matching page', async () => {
      const mockPage1: Page = {
        url: () => 'https://example.com/home'
      } as unknown as Page;

      const mockPage2: Page = {
        url: () => 'https://different.com/page'
      } as unknown as Page;

      const mockContext: BrowserContext = {
        pages: () => [mockPage1, mockPage2]
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext]
      } as unknown as Browser;

      const result = await selectTabByUrlPrefix(mockBrowser, 'https://example.com');

      expect(result).toBe(mockPage1);
    });

    test('should fall back to title match when no URL match', async () => {
      const mockPage1: Page = {
        url: () => 'https://different.com/page',
        title: async () => 'Target Title'
      } as unknown as Page;

      const mockPage2: Page = {
        url: () => 'https://another.com/page',
        title: async () => 'Other Title'
      } as unknown as Page;

      const mockContext: BrowserContext = {
        pages: () => [mockPage1, mockPage2]
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext]
      } as unknown as Browser;

      const result = await selectTabByUrlPrefix(mockBrowser, 'https://example.com', 'Target Title');

      expect(result).toBe(mockPage1);
    });

    test('should fall back to first tab when no URL or title matches', async () => {
      const mockPage1: Page = {
        url: () => 'https://different.com/page',
        title: async () => 'Different Title'
      } as unknown as Page;

      const mockPage2: Page = {
        url: () => 'https://another.com/page',
        title: async () => 'Another Title'
      } as unknown as Page;

      const mockContext: BrowserContext = {
        pages: () => [mockPage1, mockPage2]
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext]
      } as unknown as Browser;

      const result = await selectTabByUrlPrefix(mockBrowser, 'https://example.com', 'Target Title');

      expect(result).toBe(mockPage1);
    });

    test('should return null when no tabs available', async () => {
      const mockContext: BrowserContext = {
        pages: () => []
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext]
      } as unknown as Browser;

      const result = await selectTabByUrlPrefix(mockBrowser, 'https://example.com');

      expect(result).toBeNull();
    });

    test('should return null when no contexts available', async () => {
      const mockBrowser: Browser = {
        contexts: () => []
      } as unknown as Browser;

      const result = await selectTabByUrlPrefix(mockBrowser, 'https://example.com');

      expect(result).toBeNull();
    });

    test('should return null when multiple URL matches exist and fall back to title match', async () => {
      const mockPage1: Page = {
        url: () => 'https://example.com/page1',
        title: async () => 'Target Title'
      } as unknown as Page;

      const mockPage2: Page = {
        url: () => 'https://example.com/page2',
        title: async () => 'Other Title'
      } as unknown as Page;

      const mockPage3: Page = {
        url: () => 'https://different.com/page',
        title: async () => 'Another Title'
      } as unknown as Page;

      const mockContext: BrowserContext = {
        pages: () => [mockPage1, mockPage2, mockPage3]
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext]
      } as unknown as Browser;

      const result = await selectTabByUrlPrefix(mockBrowser, 'https://example.com', 'Target Title');

      expect(result).toBe(mockPage1);
    });

    test('should handle page that throws error on url() gracefully', async () => {
      const mockPage1: Page = {
        url: () => 'https://example.com/page'
      } as unknown as Page;

      const mockPage2: Page = {
        url: () => {
          throw new Error('Page closed');
        }
      } as unknown as Page;

      const mockContext: BrowserContext = {
        pages: () => [mockPage1, mockPage2]
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext]
      } as unknown as Browser;

      const result = await selectTabByUrlPrefix(mockBrowser, 'https://example.com');

      expect(result).toBe(mockPage1);
    });
  });

  test.describe('selectTabByTitle', () => {
    test('should select tab by exact title match', async () => {
      const mockPage1: Page = {
        title: async () => 'Example Domain'
      } as unknown as Page;

      const mockPage2: Page = {
        title: async () => 'Another Title'
      } as unknown as Page;

      const mockContext: BrowserContext = {
        pages: () => [mockPage1, mockPage2]
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext]
      } as unknown as Browser;

      const result = await selectTabByTitle(mockBrowser, 'Example Domain');

      expect(result).toBe(mockPage1);
    });

    test('should return null when title is undefined', async () => {
      const mockPage1: Page = {
        title: async () => 'Example Domain'
      } as unknown as Page;

      const mockContext: BrowserContext = {
        pages: () => [mockPage1]
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext]
      } as unknown as Browser;

      const result = await selectTabByTitle(mockBrowser, undefined);

      expect(result).toBeNull();
    });

    test('should return null when title is empty string', async () => {
      const mockPage1: Page = {
        title: async () => 'Example Domain'
      } as unknown as Page;

      const mockContext: BrowserContext = {
        pages: () => [mockPage1]
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext]
      } as unknown as Browser;

      const result = await selectTabByTitle(mockBrowser, '');

      expect(result).toBeNull();
    });

    test('should return null when multiple title matches exist', async () => {
      const mockPage1: Page = {
        title: async () => 'Duplicate Title'
      } as unknown as Page;

      const mockPage2: Page = {
        title: async () => 'Duplicate Title'
      } as unknown as Page;

      const mockContext: BrowserContext = {
        pages: () => [mockPage1, mockPage2]
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext]
      } as unknown as Browser;

      const result = await selectTabByTitle(mockBrowser, 'Duplicate Title');

      expect(result).toBeNull();
    });

    test('should return null when no title matches', async () => {
      const mockPage1: Page = {
        title: async () => 'Example Domain'
      } as unknown as Page;

      const mockContext: BrowserContext = {
        pages: () => [mockPage1]
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext]
      } as unknown as Browser;

      const result = await selectTabByTitle(mockBrowser, 'Non-existent Title');

      expect(result).toBeNull();
    });

    test('should return null when no tabs available', async () => {
      const mockContext: BrowserContext = {
        pages: () => []
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext]
      } as unknown as Browser;

      const result = await selectTabByTitle(mockBrowser, 'Example Title');

      expect(result).toBeNull();
    });

    test('should return null when no contexts available', async () => {
      const mockBrowser: Browser = {
        contexts: () => []
      } as unknown as Browser;

      const result = await selectTabByTitle(mockBrowser, 'Example Title');

      expect(result).toBeNull();
    });

    test('should handle page that throws error on title() gracefully', async () => {
      const mockPage1: Page = {
        title: async () => 'Example Domain'
      } as unknown as Page;

      const mockPage2: Page = {
        title: async () => {
          throw new Error('Page closed');
        }
      } as unknown as Page;

      const mockContext: BrowserContext = {
        pages: () => [mockPage1, mockPage2]
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext]
      } as unknown as Browser;

      const result = await selectTabByTitle(mockBrowser, 'Example Domain');

      expect(result).toBe(mockPage1);
    });

    test('should search across multiple browser contexts', async () => {
      const mockPage1: Page = {
        title: async () => 'Title 1'
      } as unknown as Page;

      const mockPage2: Page = {
        title: async () => 'Title 2'
      } as unknown as Page;

      const mockContext1: BrowserContext = {
        pages: () => [mockPage1]
      } as unknown as BrowserContext;

      const mockContext2: BrowserContext = {
        pages: () => [mockPage2]
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext1, mockContext2]
      } as unknown as Browser;

      const result1 = await selectTabByTitle(mockBrowser, 'Title 1');
      const result2 = await selectTabByTitle(mockBrowser, 'Title 2');

      expect(result1).toBe(mockPage1);
      expect(result2).toBe(mockPage2);
    });
  });

  test.describe('selectFirstTab', () => {
    test('should return first tab when tabs exist', async () => {
      const mockPage1: Page = {
        url: () => 'https://example.com/page1'
      } as unknown as Page;

      const mockPage2: Page = {
        url: () => 'https://example.com/page2'
      } as unknown as Page;

      const mockContext: BrowserContext = {
        pages: () => [mockPage1, mockPage2]
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext]
      } as unknown as Browser;

      const result = await selectFirstTab(mockBrowser);

      expect(result).toBe(mockPage1);
    });

    test('should return null when no tabs available', async () => {
      const mockContext: BrowserContext = {
        pages: () => []
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext]
      } as unknown as Browser;

      const result = await selectFirstTab(mockBrowser);

      expect(result).toBeNull();
    });

    test('should return null when no contexts available', async () => {
      const mockBrowser: Browser = {
        contexts: () => []
      } as unknown as Browser;

      const result = await selectFirstTab(mockBrowser);

      expect(result).toBeNull();
    });

    test('should return first tab from first context when multiple contexts exist', async () => {
      const mockPage1: Page = {
        url: () => 'https://example.com/page1'
      } as unknown as Page;

      const mockPage2: Page = {
        url: () => 'https://example.com/page2'
      } as unknown as Page;

      const mockContext1: BrowserContext = {
        pages: () => [mockPage1]
      } as unknown as BrowserContext;

      const mockContext2: BrowserContext = {
        pages: () => [mockPage2]
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext1, mockContext2]
      } as unknown as Browser;

      const result = await selectFirstTab(mockBrowser);

      expect(result).toBe(mockPage1);
    });

    test('should skip empty contexts and return first tab from non-empty context', async () => {
      const mockPage1: Page = {
        url: () => 'https://example.com/page1'
      } as unknown as Page;

      const mockContext1: BrowserContext = {
        pages: () => []
      } as unknown as BrowserContext;

      const mockContext2: BrowserContext = {
        pages: () => [mockPage1]
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext1, mockContext2]
      } as unknown as Browser;

      const result = await selectFirstTab(mockBrowser);

      expect(result).toBe(mockPage1);
    });
  });

  test.describe('Integration scenarios', () => {
    test('should handle complete tab selection flow with URL prefix fallback', async () => {
      const mockPage1: Page = {
        url: () => 'https://example.com/page1',
        title: async () => 'Example Domain'
      } as unknown as Page;

      const mockPage2: Page = {
        url: () => 'https://other.com/page',
        title: async () => 'Other Title'
      } as unknown as Page;

      const mockContext: BrowserContext = {
        pages: () => [mockPage1, mockPage2]
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext]
      } as unknown as Browser;

      const result = await selectTabByUrlPrefix(mockBrowser, 'https://example.com', 'Example Domain');

      expect(result).toBe(mockPage1);
    });

    test('should handle complete tab selection flow with title fallback', async () => {
      const mockPage1: Page = {
        url: () => 'https://different.com/page',
        title: async () => 'Target Title'
      } as unknown as Page;

      const mockPage2: Page = {
        url: () => 'https://another.com/page',
        title: async () => 'Other Title'
      } as unknown as Page;

      const mockContext: BrowserContext = {
        pages: () => [mockPage1, mockPage2]
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext]
      } as unknown as Browser;

      const result = await selectTabByUrlPrefix(mockBrowser, 'https://example.com', 'Target Title');

      expect(result).toBe(mockPage1);
    });

    test('should handle complete tab selection flow with first tab fallback', async () => {
      const mockPage1: Page = {
        url: () => 'https://different.com/page',
        title: async () => 'Different Title'
      } as unknown as Page;

      const mockPage2: Page = {
        url: () => 'https://another.com/page',
        title: async () => 'Another Title'
      } as unknown as Page;

      const mockContext: BrowserContext = {
        pages: () => [mockPage1, mockPage2]
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext]
      } as unknown as Browser;

      const result = await selectTabByUrlPrefix(mockBrowser, 'https://example.com', 'Target Title');

      expect(result).toBe(mockPage1);
    });

    test('should handle multiple title matches and return first match for selectTabByTitle', async () => {
      const mockPage1: Page = {
        title: async () => 'Duplicate Title'
      } as unknown as Page;

      const mockPage2: Page = {
        title: async () => 'Duplicate Title'
      } as unknown as Page;

      const mockPage3: Page = {
        title: async () => 'Unique Title'
      } as unknown as Page;

      const mockContext: BrowserContext = {
        pages: () => [mockPage1, mockPage2, mockPage3]
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext]
      } as unknown as Browser;

      const result = await selectTabByTitle(mockBrowser, 'Duplicate Title');

      expect(result).toBeNull();
    });

    test('should report no tabs available when all contexts are empty', async () => {
      const mockContext1: BrowserContext = {
        pages: () => []
      } as unknown as BrowserContext;

      const mockContext2: BrowserContext = {
        pages: () => []
      } as unknown as BrowserContext;

      const mockBrowser: Browser = {
        contexts: () => [mockContext1, mockContext2]
      } as unknown as Browser;

      const resultByUrl = await selectTabByUrlPrefix(mockBrowser, 'https://example.com');
      const resultByTitle = await selectTabByTitle(mockBrowser, 'Example Title');
      const resultFirst = await selectFirstTab(mockBrowser);

      expect(resultByUrl).toBeNull();
      expect(resultByTitle).toBeNull();
      expect(resultFirst).toBeNull();
    });
  });
});
