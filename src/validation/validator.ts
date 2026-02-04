import Ajv, { ErrorObject } from 'ajv';
import flowSchema from './schema.js';

const ajv = new Ajv({ allErrors: true });

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

export interface ValidationError {
  message: string;
  path?: string;
  property?: string;
}

const validateFlow = ajv.compile(flowSchema);

export function validateFlowData(data: unknown): ValidationResult {
  const valid = validateFlow(data);

  if (!valid && validateFlow.errors) {
    const validationErrors: ValidationError[] = validateFlow.errors.map((error: ErrorObject): ValidationError => {
      const result: ValidationError = {
        message: error.message || 'Unknown validation error',
      };

      if (error.instancePath) {
        result.path = error.instancePath;
      }

      if (error.schemaPath) {
        result.property = error.schemaPath;
      }

      return result;
    });

    return {
      valid: false,
      errors: validationErrors,
    };
  }

  return {
    valid: true,
  };
}
