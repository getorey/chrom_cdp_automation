#!/usr/bin/env node

import { program } from 'commander';
import { validateFlowData } from './validation/validator.js';
import fs from 'fs/promises';
import yaml from 'js-yaml';

program
  .name('chrome-cdp')
  .description('Chrome DevTools Protocol automation runner with YAML flow definitions')
  .version('1.0.0');

program
  .command('validate')
  .description('Validate a flow file')
  .argument('<flow-file>', 'Path to the YAML flow file')
  .action(async (flowFile: string) => {
    try {
      const flowData = await loadFlowFile(flowFile);
      const validation = validateFlowData(flowData);
      
      if (validation.valid) {
        console.log(`✓ Flow file "${flowFile}" is valid`);
      } else {
        console.error(`✗ Flow file "${flowFile}" has validation errors:`);
        validation.errors?.forEach((error, index) => {
          console.error(`  ${index + 1}. ${error.message}${error.path ? ` (path: ${error.path})` : ''}`);
        });
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error validating flow file "${flowFile}":`, error);
      process.exit(1);
    }
  });

program
  .command('run')
  .description('Run a flow file')
  .argument('<flow-file>', 'Path to the YAML flow file')
  .option('-m, --mode <mode>', 'Execution mode', 'manual')
  .action(async (flowFile: string, options: { mode: string }) => {
    try {
      console.log(`🚀 Starting flow execution in ${options.mode} mode...`);
      
      const flowData = await loadFlowFile(flowFile);
      const validation = validateFlowData(flowData);
      
      if (!validation.valid) {
        console.error(`✗ Flow file "${flowFile}" has validation errors:`);
        validation.errors?.forEach((error, index) => {
          console.error(`  ${index + 1}. ${error.message}${error.path ? ` (path: ${error.path})` : ''}`);
        });
        process.exit(1);
      }
      
      
      
      console.log('Note: CLI-standalone requires manual browser setup');
      console.log('For full functionality, use the main CLI with: npm start');
      
      const mockRunId = `mock_${Date.now()}`;
      console.log(`✓ Flow "${flowData.name}" validation completed in ${options.mode} mode`);
      console.log(`  Mock Run ID: ${mockRunId}`);
      console.log(`  For execution, use: npm start run ${flowFile}`);
      
    } catch (error) {
      console.error('Error executing flow:', error);
      process.exit(1);
    }
  });

async function loadFlowFile(flowFile: string): Promise<any> {
  const fileContent = await fs.readFile(flowFile, 'utf8');
  const flowData = yaml.load(fileContent);
  return flowData;
}

program.parse();