import { Page, Browser, chromium } from 'playwright';

export class CDPConnector {
  private page: Page | null = null;
  private browser: Browser | null = null;
  private previousPage: Page | null = null; // For returning to previous tab

  constructor() {}

  async connect(page: Page, browser?: Browser): Promise<void> {
    this.previousPage = this.page;
    this.page = page;
    if (browser) {
      this.browser = browser;
    }
  }

  async disconnect(): Promise<void> {
    this.page = null;
  }

  isConnected(): boolean {
    return this.page !== null;
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('CDP not connected');
    }
    return this.page;
  }

  getBrowser(): Browser | null {
    return this.browser;
  }

  setBrowser(browser: Browser): void {
    this.browser = browser;
  }

  /**
   * Wait for a new popup/tab to open
   */
  async waitForPopup(timeout: number = 5000): Promise<Page> {
    if (!this.browser) {
      throw new Error('Browser not connected');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Popup wait timeout after ${timeout}ms`));
      }, timeout);

      const handler = (page: Page) => {
        clearTimeout(timer);
        (this.browser! as any).off('page', handler);
        resolve(page);
      };

      (this.browser as any).on('page', handler);
    });
  }

  /**
   * Switch to a tab by index (0-based)
   */
  async switchToTabByIndex(index: number): Promise<void> {
    if (!this.browser) {
      throw new Error('Browser not connected');
    }

    const contexts = this.browser.contexts();
    const allPages: Page[] = [];
    
    for (const context of contexts) {
      allPages.push(...context.pages());
    }

    if (index < 0 || index >= allPages.length) {
      throw new Error(`Tab index ${index} out of range. Total tabs: ${allPages.length}`);
    }

    this.previousPage = this.page;
    this.page = allPages[index]!;
  }

  /**
   * Switch to a tab by title (partial match)
   */
  async switchToTabByTitle(title: string): Promise<void> {
    if (!this.browser) {
      throw new Error('Browser not connected');
    }

    const contexts = this.browser.contexts();
    
    for (const context of contexts) {
      for (const page of context.pages()) {
        try {
          const pageTitle = await page.title();
          if (pageTitle.includes(title)) {
            this.previousPage = this.page;
            this.page = page;
            return;
          }
        } catch {
          continue;
        }
      }
    }

    throw new Error(`No tab found with title containing: "${title}"`);
  }

  /**
   * Close current tab and optionally return to previous tab
   */
  async closeTab(returnToPrevious: boolean = false): Promise<void> {
    if (!this.page) {
      throw new Error('No active tab to close');
    }

    const pageToClose = this.page;
    
    if (returnToPrevious && this.previousPage) {
      this.page = this.previousPage;
      this.previousPage = null;
    } else {
      // Try to find another tab to switch to
      if (this.browser) {
        const contexts = this.browser.contexts();
        for (const context of contexts) {
          const pages = context.pages();
          const otherPage = pages.find(p => p !== pageToClose);
          if (otherPage) {
            this.page = otherPage || null;
            break;
          }
        }
      }
    }

    await pageToClose.close();
  }

  /**
   * Get all available tabs/pages
   */
  getAllTabs(): Page[] {
    if (!this.browser) {
      return this.page ? [this.page] : [];
    }

    const allPages: Page[] = [];
    for (const context of this.browser.contexts()) {
      allPages.push(...context.pages());
    }
    return allPages;
  }
}

/**
 * Connects to an existing Chrome instance via CDP protocol.
 * Chrome must be started with --remote-debugging-port=9222 flag.
 *
 * @param port - The CDP port number (default: 9222)
 * @returns Promise<Browser> - Connected Playwright Browser instance
 * @throws Error if connection fails
 *
 * @example
 * // Start Chrome with: /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
 * const browser = await connectToChrome(9222);
 * const page = await browser.newPage();
 * await page.goto('https://example.com');
 */
export async function connectToChrome(port: number = 9222): Promise<Browser> {
  try {
    const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
    return browser;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to connect to Chrome via CDP on port ${port}. ` +
        `Ensure Chrome is running with --remote-debugging-port=${port}. ` +
        `Original error: ${error.message}`
      );
    }
    throw new Error(
      `Failed to connect to Chrome via CDP on port ${port}. ` +
      `Unknown error occurred.`
    );
  }
}

/**
 * Gets the Chrome version from a connected browser instance.
 *
 * @param browser - Playwright Browser instance
 * @returns Promise<string> - Chrome version string
 * @throws Error if browser is not connected or version retrieval fails
 *
 * @example
 * const browser = await connectToChrome(9222);
 * const version = await getChromeVersion(browser);
 * console.log(`Chrome version: ${version}`);
 */
export async function getChromeVersion(browser: Browser): Promise<string> {
  try {
    const version = await browser.version();
    return version;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to get Chrome version. Original error: ${error.message}`
      );
    }
    throw new Error('Failed to get Chrome version. Unknown error occurred.');
  }
}

/**
 * Selects a tab (page) by matching page title.
 *
 * @param browser - Playwright Browser instance
 * @param title - Page title to match (optional, returns null if undefined or empty)
 * @returns Promise<Page | null> - Matching Page if exactly one match, null otherwise
 *
 * @example
 * const browser = await connectToChrome(9222);
 * const page = await selectTabByTitle(browser, 'Example Domain');
 * if (page) {
 *   console.log('Found tab:', page.url());
 * } else {
 *   console.log('No matching tab found');
 * }
 */
export async function selectTabByTitle(browser: Browser, title?: string): Promise<Page | null> {
  // Return null if title is undefined or empty
  if (!title) {
    return null;
  }

  const contexts = browser.contexts();
  const matchingPages: Page[] = [];

  for (const context of contexts) {
    const pages = context.pages();
    for (const page of pages) {
      try {
        const pageTitle = await page.title();
        if (pageTitle === title) {
          matchingPages.push(page);
        }
      } catch {
        continue;
      }
    }
  }

  if (matchingPages.length === 1) {
    return matchingPages[0]!;
  }

  return null;
}

/**
 * Selects a tab (page) by matching URL prefix, with fallback to title matching.
 *
 * @param browser - Playwright Browser instance
 * @param urlPrefix - URL prefix to match against page URLs
 * @param title - Optional title to match if URL prefix match fails
 * @returns Promise<Page | null> - Matching Page if exactly one match, null otherwise
 *
 * @example
 * const browser = await connectToChrome(9222);
 * const page = await selectTabByUrlPrefix(browser, 'https://example.com', 'Example Domain');
 * if (page) {
 *   console.log('Found tab:', page.url());
 * } else {
 *   console.log('No matching tab found');
 * }
 */
export async function selectTabByUrlPrefix(browser: Browser, urlPrefix: string, title?: string): Promise<Page | null> {
  const contexts = browser.contexts();
  const matchingPages: Page[] = [];

  for (const context of contexts) {
    const pages = context.pages();
    for (const page of pages) {
      try {
        const url = page.url();
        if (url.startsWith(urlPrefix)) {
          matchingPages.push(page);
        }
      } catch {
        continue;
      }
    }
  }

  if (matchingPages.length === 1) {
    return matchingPages[0]!;
  }

  // Fallback to title matching if URL prefix match fails
  const titleMatch = await selectTabByTitle(browser, title);
  if (titleMatch) {
    return titleMatch;
  }

  // Final fallback to first tab
  return selectFirstTab(browser);
}

/**
 * Selects the first available tab (page) from all browser contexts.
 *
 * @param browser - Playwright Browser instance
 * @returns Promise<Page | null> - First Page if any pages exist, null otherwise
 *
 * @example
 * const browser = await connectToChrome(9222);
 * const page = await selectFirstTab(browser);
 * if (page) {
 *   console.log('First tab:', page.url());
 * } else {
 *   console.log('No tabs available');
 * }
 */
export async function selectFirstTab(browser: Browser): Promise<Page | null> {
  const contexts = browser.contexts();

  for (const context of contexts) {
    const pages = context.pages();
    if (pages.length > 0) {
      return pages[0]!;
    }
  }

  return null;
}
