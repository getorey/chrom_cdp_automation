const stepSchema = {
  type: 'object',
  required: ['action', 'target', 'description'],
  properties: {
    step_no: {
      type: 'number',
      description: 'Step number (1-based index)',
    },
    action: {
      type: 'string',
      enum: ['navigate', 'click', 'click_at', 'click_template', 'type', 'wait', 'select', 'press', 'loop'],
      description: 'Action to perform',
    },
    template_path: {
      type: 'string',
      description: 'Path to template image for click_template action (optional)',
    },
    template_data: {
      type: 'string',
      description: 'Base64 encoded template image for click_template action (optional)',
    },
    template_threshold: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence threshold for template matching (default: 0.8)',
    },
    target: {
      type: 'string',
      description: 'Target element or locator',
    },
    value: {
      type: 'string',
      description: 'Value to input (optional, for type/select actions)',
    },
    coordinates: {
      type: 'object',
      description: 'Coordinates for click_at action (x, y)',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
      },
      required: ['x', 'y'],
    },
    description: {
      type: 'string',
      description: 'Step description',
    },
    timeout: {
      type: 'number',
      description: 'Timeout in milliseconds (optional)',
    },
    vision_fallback: {
      type: 'boolean',
      description: 'Override global vision_fallback for this step (optional)',
    },
    repeat: {
      type: 'number',
      minimum: 1,
      description: 'Number of times to repeat this step (optional, default: 1)',
    },
    continue_on_error: {
      type: 'boolean',
      description: 'Continue to next repeat iteration on error (optional, default: false)',
    },
    loop_steps: {
      type: 'array',
      description: 'Sub-steps to execute in a loop (for loop action only)',
      items: {
        type: 'object',
        required: ['action', 'target', 'description'],
        properties: {
          action: {
            type: 'string',
            enum: ['navigate', 'click', 'click_at', 'click_template', 'type', 'wait', 'select', 'press', 'loop'],
            description: 'Action to perform',
          },
          template_path: {
            type: 'string',
            description: 'Path to template image for click_template action (optional)',
          },
          template_data: {
            type: 'string',
            description: 'Base64 encoded template image for click_template action (optional)',
          },
          template_threshold: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Confidence threshold for template matching (default: 0.8)',
          },
          target: {
            type: 'string',
            description: 'Target element or locator',
          },
          value: {
            type: 'string',
            description: 'Value to input (optional, for type/select actions)',
          },
          coordinates: {
            type: 'object',
            description: 'Coordinates for click_at action (x, y)',
            properties: {
              x: { type: 'number', description: 'X coordinate' },
              y: { type: 'number', description: 'Y coordinate' },
            },
            required: ['x', 'y'],
          },
          description: {
            type: 'string',
            description: 'Step description',
          },
          timeout: {
            type: 'number',
            description: 'Timeout in milliseconds (optional)',
          },
          vision_fallback: {
            type: 'boolean',
            description: 'Override global vision_fallback for this step (optional)',
          },
          vision_target: {
            type: 'string',
            description: 'Target text to search for when using vision fallback (optional)',
          },
          vision_ocr_language: {
            type: 'string',
            description: 'OCR language for vision fallback (e.g., "korean", "english", "chinese") (optional)',
          },
          repeat: {
            type: 'number',
            minimum: 1,
            description: 'Number of times to repeat this step (optional, default: 1)',
          },
          continue_on_error: {
            type: 'boolean',
            description: 'Continue to next repeat iteration on error (optional, default: false)',
          },
        },
      },
    },
  },
};

const flowSchema = {
  type: 'object',
  required: ['name', 'description', 'url_prefix', 'steps'],
  properties: {
    name: {
      type: 'string',
      description: 'Flow name',
    },
    description: {
      type: 'string',
      description: 'Flow description',
    },
    url_prefix: {
      type: 'string',
      description: 'URL prefix for flow',
    },
    vision_fallback: {
      type: 'boolean',
      description: 'Enable Vision fallback on selector failure (optional)',
    },
    vision_backend: {
      type: 'string',
      enum: ['som', 'omniparser', 'openai'],
      description: 'Vision backend: "som", "omniparser", or "openai" (optional)',
    },
    vision_api_url: {
      type: 'string',
      description: 'Vision API server URL (optional, e.g., http://192.168.40.167:7861)',
    },
    vision_ocr_language: {
      type: 'string',
      description: 'OCR language for vision fallback (e.g., "korean", "english") (optional)',
    },
    steps: {
      type: 'array',
      description: 'Array of steps to execute',
      items: {
        ...stepSchema,
        required: ['step_no', 'action', 'target', 'description'],
      },
    },
  },
};

export default flowSchema;
