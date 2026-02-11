// This module handles dynamic loading of external dependencies for pkg compatibility
// When running in a pkg environment, we need to load from the actual filesystem

import path from 'path';

// Get the directory where the executable is located
function getExecutableDir(): string {
  // In pkg environment, process.execPath is the path to the executable
  // In normal Node.js, it's the path to node.exe
  const execPath = process.execPath;
  return path.dirname(execPath);
}

// Dynamically require a module from the external node_modules
export async function requireExternal(moduleName: string): Promise<any> {
  try {
    // Try standard require first (works in normal Node.js and might work in pkg)
    return require(moduleName);
  } catch (e) {
    // If that fails, try to load from executable's node_modules
    const execDir = getExecutableDir();
    const modulePath = path.join(execDir, 'node_modules', moduleName);
    
    try {
      return require(modulePath);
    } catch (e2) {
      // If still failing, try with process.cwd()
      const cwdPath = path.join(process.cwd(), 'node_modules', moduleName);
      return require(cwdPath);
    }
  }
}

// Synchronous version for modules that need to be imported synchronously
export function requireExternalSync(moduleName: string): any {
  try {
    return require(moduleName);
  } catch (e) {
    const execDir = getExecutableDir();
    const modulePath = path.join(execDir, 'node_modules', moduleName);
    
    try {
      return require(modulePath);
    } catch (e2) {
      const cwdPath = path.join(process.cwd(), 'node_modules', moduleName);
      return require(cwdPath);
    }
  }
}
