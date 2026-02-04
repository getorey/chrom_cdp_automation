import { test, expect } from '@playwright/test';
import * as yaml from 'js-yaml';
import { validateFlowData } from '../../src/validation/validator';

test.describe('Flow Data Validation', () => {
  test.describe('Valid Flow', () => {
    test('should pass validation for a complete valid flow', () => {
      const validFlow = {
        name: 'Login Flow',
        description: 'User login automation flow',
        url_prefix: 'https://example.com',
        steps: [
          {
            step_no: 1,
            action: 'navigate',
            target: 'https://example.com/login',
            description: 'Navigate to login page'
          },
          {
            step_no: 2,
            action: 'type',
            target: '#username',
            value: 'testuser@example.com',
            description: 'Enter username'
          },
          {
            step_no: 3,
            action: 'type',
            target: '#password',
            value: 'password123',
            description: 'Enter password'
          },
          {
            step_no: 4,
            action: 'click',
            target: '#submit',
            description: 'Click submit button'
          }
        ]
      };

      const result = validateFlowData(validFlow);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    test('should pass validation for flow with optional fields', () => {
      const flowWithOptional = {
        name: 'Complex Flow',
        description: 'Flow with optional fields',
        url_prefix: 'https://example.com',
        steps: [
          {
            step_no: 1,
            action: 'navigate',
            target: 'https://example.com',
            description: 'Navigate',
            timeout: 5000
          },
          {
            step_no: 2,
            action: 'wait',
            target: '1000',
            description: 'Wait for page load',
            timeout: 2000
          },
          {
            step_no: 3,
            action: 'select',
            target: '#country',
            value: 'US',
            description: 'Select country'
          }
        ]
      };

      const result = validateFlowData(flowWithOptional);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    test('should pass validation for valid YAML parsed flow', () => {
      const yamlContent = `
name: Test Flow
description: A test flow
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate to homepage
  - step_no: 2
    action: click
    target: '#button'
    description: Click button
      `.trim();

      const parsedFlow = yaml.load(yamlContent);
      const result = validateFlowData(parsedFlow);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });
  });

  test.describe('Missing Required Fields', () => {
    test('should fail validation when name is missing', () => {
      const flowWithoutName = {
        description: 'Flow without name',
        url_prefix: 'https://example.com',
        steps: [
          {
            step_no: 1,
            action: 'navigate',
            target: 'https://example.com',
            description: 'Navigate'
          }
        ]
      };

      const result = validateFlowData(flowWithoutName);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].message).toContain('must have required property');
      expect(result.errors![0].path).toBeUndefined();
    });

    test('should fail validation when description is missing', () => {
      const flowWithoutDescription = {
        name: 'Test Flow',
        url_prefix: 'https://example.com',
        steps: [
          {
            step_no: 1,
            action: 'navigate',
            target: 'https://example.com',
            description: 'Navigate'
          }
        ]
      };

      const result = validateFlowData(flowWithoutDescription);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].message).toContain('must have required property');
      expect(result.errors![0].path).toBeUndefined();
    });

    test('should fail validation when url_prefix is missing', () => {
      const flowWithoutUrlPrefix = {
        name: 'Test Flow',
        description: 'Flow without url_prefix',
        steps: [
          {
            step_no: 1,
            action: 'navigate',
            target: 'https://example.com',
            description: 'Navigate'
          }
        ]
      };

      const result = validateFlowData(flowWithoutUrlPrefix);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].message).toContain('must have required property');
      expect(result.errors![0].path).toBeUndefined();
    });

    test('should fail validation when steps is missing', () => {
      const flowWithoutSteps = {
        name: 'Test Flow',
        description: 'Flow without steps',
        url_prefix: 'https://example.com'
      };

      const result = validateFlowData(flowWithoutSteps);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].message).toContain('must have required property');
      expect(result.errors![0].path).toBeUndefined();
    });

    test('should fail validation when step_no is missing in a step', () => {
      const flowWithoutStepNo = {
        name: 'Test Flow',
        description: 'Flow with incomplete step',
        url_prefix: 'https://example.com',
        steps: [
          {
            action: 'navigate',
            target: 'https://example.com',
            description: 'Navigate'
          }
        ]
      };

      const result = validateFlowData(flowWithoutStepNo);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('must have required property');
      expect(result.errors![0].path).toBe('/steps/0');
    });

    test('should fail validation when action is missing in a step', () => {
      const flowWithoutAction = {
        name: 'Test Flow',
        description: 'Flow with incomplete step',
        url_prefix: 'https://example.com',
        steps: [
          {
            step_no: 1,
            target: 'https://example.com',
            description: 'Navigate'
          }
        ]
      };

      const result = validateFlowData(flowWithoutAction);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('must have required property');
      expect(result.errors![0].path).toBe('/steps/0');
    });

    test('should fail validation when target is missing in a step', () => {
      const flowWithoutTarget = {
        name: 'Test Flow',
        description: 'Flow with incomplete step',
        url_prefix: 'https://example.com',
        steps: [
          {
            step_no: 1,
            action: 'navigate',
            description: 'Navigate'
          }
        ]
      };

      const result = validateFlowData(flowWithoutTarget);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('must have required property');
      expect(result.errors![0].path).toBe('/steps/0');
    });

    test('should fail validation when description is missing in a step', () => {
      const flowWithoutStepDescription = {
        name: 'Test Flow',
        description: 'Flow with incomplete step',
        url_prefix: 'https://example.com',
        steps: [
          {
            step_no: 1,
            action: 'navigate',
            target: 'https://example.com'
          }
        ]
      };

      const result = validateFlowData(flowWithoutStepDescription);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('must have required property');
      expect(result.errors![0].path).toBe('/steps/0');
    });

    test('should report multiple missing required fields', () => {
      const flowWithMultipleErrors = {
        name: 'Test Flow',
        url_prefix: 'https://example.com',
        steps: [
          {
            step_no: 1,
            action: 'navigate',
            target: 'https://example.com'
          }
        ]
      };

      const result = validateFlowData(flowWithMultipleErrors);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(1);
      expect(result.errors!.some(error => error.path === '/steps/0')).toBe(true);
    });
  });

  test.describe('Invalid Action Types', () => {
    test('should fail validation for invalid action type', () => {
      const flowWithInvalidAction = {
        name: 'Test Flow',
        description: 'Flow with invalid action',
        url_prefix: 'https://example.com',
        steps: [
          {
            step_no: 1,
            action: 'invalid_action',
            target: 'https://example.com',
            description: 'Invalid action'
          }
        ]
      };

      const result = validateFlowData(flowWithInvalidAction);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].message).toContain('must be equal to one of the allowed values');
      expect(result.errors![0].path).toBe('/steps/0/action');
    });

    test('should fail validation for all invalid action types', () => {
      const invalidActions = ['hover', 'scroll', 'drag', 'upload', 'download', 'execute'];

      invalidActions.forEach(action => {
        const flow = {
          name: 'Test Flow',
          description: `Flow with ${action} action`,
          url_prefix: 'https://example.com',
          steps: [
            {
              step_no: 1,
              action,
              target: '#element',
              description: `Test ${action} action`
            }
          ]
        };

        const result = validateFlowData(flow);

        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors![0].message).toContain('must be equal to one of the allowed values');
      });
    });

    test('should pass validation for all valid action types', () => {
      const validActions = ['navigate', 'click', 'type', 'wait', 'select'];

      validActions.forEach(action => {
        const flow = {
          name: 'Test Flow',
          description: `Flow with ${action} action`,
          url_prefix: 'https://example.com',
          steps: [
            {
              step_no: 1,
              action,
              target: '#element',
              description: `Test ${action} action`
            }
          ]
        };

        const result = validateFlowData(flow);

        expect(result.valid).toBe(true);
        expect(result.errors).toBeUndefined();
      });
    });

    test('should report action type error with correct path', () => {
      const flow = {
        name: 'Test Flow',
        description: 'Flow with multiple steps',
        url_prefix: 'https://example.com',
        steps: [
          {
            step_no: 1,
            action: 'navigate',
            target: 'https://example.com',
            description: 'Valid step'
          },
          {
            step_no: 2,
            action: 'invalid',
            target: '#button',
            description: 'Invalid step'
          },
          {
            step_no: 3,
            action: 'click',
            target: '#link',
            description: 'Valid step'
          }
        ]
      };

      const result = validateFlowData(flow);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].path).toBe('/steps/1/action');
    });
  });

  test.describe('Invalid Data Types', () => {
    test('should fail validation when name is not a string', () => {
      const flowWithInvalidNameType = {
        name: 123,
        description: 'Flow',
        url_prefix: 'https://example.com',
        steps: [
          {
            step_no: 1,
            action: 'navigate',
            target: 'https://example.com',
            description: 'Navigate'
          }
        ]
      };

      const result = validateFlowData(flowWithInvalidNameType);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('must be string');
      expect(result.errors![0].path).toBe('/name');
    });

    test('should fail validation when url_prefix is not a string', () => {
      const flowWithInvalidUrlType = {
        name: 'Test Flow',
        description: 'Flow',
        url_prefix: { url: 'https://example.com' },
        steps: [
          {
            step_no: 1,
            action: 'navigate',
            target: 'https://example.com',
            description: 'Navigate'
          }
        ]
      };

      const result = validateFlowData(flowWithInvalidUrlType);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('must be string');
      expect(result.errors![0].path).toBe('/url_prefix');
    });

    test('should fail validation when steps is not an array', () => {
      const flowWithInvalidStepsType = {
        name: 'Test Flow',
        description: 'Flow',
        url_prefix: 'https://example.com',
        steps: 'not an array'
      };

      const result = validateFlowData(flowWithInvalidStepsType);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('must be array');
      expect(result.errors![0].path).toBe('/steps');
    });

    test('should fail validation when step_no is not a number', () => {
      const flowWithInvalidStepNoType = {
        name: 'Test Flow',
        description: 'Flow',
        url_prefix: 'https://example.com',
        steps: [
          {
            step_no: '1',
            action: 'navigate',
            target: 'https://example.com',
            description: 'Navigate'
          }
        ]
      };

      const result = validateFlowData(flowWithInvalidStepNoType);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('must be number');
      expect(result.errors![0].path).toBe('/steps/0/step_no');
    });

    test('should fail validation when timeout is not a number', () => {
      const flowWithInvalidTimeoutType = {
        name: 'Test Flow',
        description: 'Flow',
        url_prefix: 'https://example.com',
        steps: [
          {
            step_no: 1,
            action: 'navigate',
            target: 'https://example.com',
            description: 'Navigate',
            timeout: '5000'
          }
        ]
      };

      const result = validateFlowData(flowWithInvalidTimeoutType);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('must be number');
      expect(result.errors![0].path).toBe('/steps/0/timeout');
    });
  });

  test.describe('YAML Parsing Errors', () => {
    test('should handle invalid YAML syntax when parsing', () => {
      const invalidYaml = `
name: Test Flow
description: Flow with invalid YAML
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate
  - step_no: 2
    action: click
    target: '#button
    description: Click button
      `.trim();

      expect(() => yaml.load(invalidYaml)).toThrow();
    });

    test('should handle YAML with incorrect indentation', () => {
      const invalidIndentationYaml = `
name: Test Flow
description: Flow with incorrect indentation
url_prefix: https://example.com
steps:
- step_no: 1
action: navigate
target: https://example.com
description: Navigate
      `.trim();

      expect(() => {
        yaml.load(invalidIndentationYaml);
      }).toThrow();
    });

    test('should validate correctly parsed valid YAML', () => {
      const validYaml = `
name: Test Flow
description: Valid YAML flow
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate
  - step_no: 2
    action: type
    target: '#input'
    value: test value
    description: Type in input
      `.trim();

      const parsedFlow = yaml.load(validYaml);
      const result = validateFlowData(parsedFlow);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    test('should fail validation for parsed YAML with invalid action', () => {
      const yamlWithInvalidAction = `
name: Test Flow
description: YAML with invalid action
url_prefix: https://example.com
steps:
  - step_no: 1
    action: invalid_action
    target: '#button'
    description: Invalid action
      `.trim();

      const parsedFlow = yaml.load(yamlWithInvalidAction);
      const result = validateFlowData(parsedFlow);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('must be equal to one of the allowed values');
    });

    test('should fail validation for parsed YAML with missing required field', () => {
      const yamlWithMissingField = `
name: Test Flow
url_prefix: https://example.com
steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate
      `.trim();

      const parsedFlow = yaml.load(yamlWithMissingField);
      const result = validateFlowData(parsedFlow);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('must have required property');
    });
  });

  test.describe('Edge Cases', () => {
    test('should handle empty steps array', () => {
      const flowWithEmptySteps = {
        name: 'Empty Flow',
        description: 'Flow with no steps',
        url_prefix: 'https://example.com',
        steps: []
      };

      const result = validateFlowData(flowWithEmptySteps);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    test('should handle flow with all valid action types', () => {
      const flowWithAllActions = {
        name: 'All Actions Flow',
        description: 'Flow testing all action types',
        url_prefix: 'https://example.com',
        steps: [
          {
            step_no: 1,
            action: 'navigate',
            target: 'https://example.com',
            description: 'Navigate'
          },
          {
            step_no: 2,
            action: 'type',
            target: '#input',
            value: 'test',
            description: 'Type'
          },
          {
            step_no: 3,
            action: 'click',
            target: '#button',
            description: 'Click'
          },
          {
            step_no: 4,
            action: 'wait',
            target: '1000',
            description: 'Wait'
          },
          {
            step_no: 5,
            action: 'select',
            target: '#select',
            value: 'option1',
            description: 'Select'
          }
        ]
      };

      const result = validateFlowData(flowWithAllActions);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    test('should handle null values correctly', () => {
      const flowWithNullValues = {
        name: null,
        description: 'Flow with null',
        url_prefix: 'https://example.com',
        steps: null
      };

      const result = validateFlowData(flowWithNullValues);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(1);
    });

    test('should handle undefined values correctly', () => {
      const flowWithUndefinedValues = {
        name: 'Test Flow',
        description: undefined,
        url_prefix: 'https://example.com',
        steps: undefined
      };

      const result = validateFlowData(flowWithUndefinedValues);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  test.describe('Error Message Accuracy', () => {
    test('should provide clear error messages for missing fields', () => {
      const flow = {
        name: 'Test Flow',
        url_prefix: 'https://example.com',
        steps: []
      };

      const result = validateFlowData(flow);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toMatch(/must have required property/);
      expect(result.errors![0].message).toMatch(/description/);
    });

    test('should provide clear error messages for invalid enum values', () => {
      const flow = {
        name: 'Test Flow',
        description: 'Flow',
        url_prefix: 'https://example.com',
        steps: [
          {
            step_no: 1,
            action: 'hover',
            target: '#button',
            description: 'Hover'
          }
        ]
      };

      const result = validateFlowData(flow);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toMatch(/must be equal to one of the allowed values/);
    });

    test('should include path information in validation errors', () => {
      const flow = {
        name: 'Test Flow',
        description: 'Flow',
        url_prefix: 'https://example.com',
        steps: [
          {
            step_no: 1,
            action: 'click',
            target: '#button'
          }
        ]
      };

      const result = validateFlowData(flow);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].path).toBe('/steps/0');
      expect(result.errors![0].message).toMatch(/description/);
    });
  });
});
