// Launcher script for pkg executable to load external node_modules
const path = require('path');
const Module = require('module');

// Get the directory where the executable is located
const execDir = path.dirname(process.execPath);

// Add the external node_modules to the module search paths
const externalNodeModules = path.join(execDir, 'node_modules');

// Patch Module._nodeModulesPaths to include our external path
const originalNodeModulesPaths = Module._nodeModulesPaths;
Module._nodeModulesPaths = function(from) {
  const paths = originalNodeModulesPaths.call(this, from);
  // Add our external path at the beginning if not already there
  if (!paths.includes(externalNodeModules)) {
    paths.unshift(externalNodeModules);
  }
  return paths;
};

// Also patch require.resolve to check external node_modules
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  // Try original resolution first
  try {
    return originalResolveFilename.call(this, request, parent, isMain, options);
  } catch (e) {
    // If that fails, try in external node_modules
    if (!request.startsWith('.') && !request.startsWith('/')) {
      try {
        const externalPath = path.join(externalNodeModules, request);
        return originalResolveFilename.call(this, externalPath, parent, isMain, options);
      } catch (e2) {
        // Ignore and throw original error
      }
    }
    throw e;
  }
};

console.log('[Launcher] External node_modules path:', externalNodeModules);

// Now load the main bundle
require('./bundle.js');
