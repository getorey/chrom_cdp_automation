export enum ActionType {
  navigate = 'navigate',
  click = 'click',
  click_at = 'click_at',
  click_template = 'click_template',
  type = 'type',
  wait = 'wait',
  select = 'select',
  press = 'press',
  loop = 'loop',
  wait_for_popup = 'wait_for_popup',
  switch_to_tab = 'switch_to_tab',
  close_tab = 'close_tab'
}

export interface VisionCrop {
  left?: number;   // 0-100%
  top?: number;    // 0-100%
  right?: number;  // 0-100%
  bottom?: number; // 0-100%
}

export interface Step {
  step_no: number;
  action: ActionType;
  target: string;
  value?: string;
  coordinates?: { x: number; y: number };
  template_path?: string;
  template_data?: string;
  template_threshold?: number;
  description: string;
  timeout?: number;
  vision_fallback?: boolean;
  vision_target?: string;
  vision_ocr_language?: string;
  vision_crop?: VisionCrop;
  repeat?: number;
  continue_on_error?: boolean;
  skip_on_change?: boolean;  // Skip vision fallback if screen changed from previous iteration (only call LLM when screen is unchanged)
  loop_steps?: Omit<Step, 'step_no'>[];
  // Tab/Popup management
  tab_index?: number;           // For switch_to_tab: 0-based index
  tab_title?: string;           // For switch_to_tab: match by title
  return_to_previous?: boolean; // For close_tab: return to previous tab
}

export interface Flow {
  name: string;
  description: string;
  url_prefix: string;
  vision_fallback?: boolean;
  vision_backend?: 'som' | 'omniparser' | 'openai' | 'gemini';
  vision_api_url?: string;
  vision_ocr_language?: string;
  vision_model_name?: string;
  vision_max_tokens?: number;
  vision_api_key?: string;
  steps: Step[];
}

export interface RunMetadata {
  run_id: string;
  user_id: string;
  timestamp: string;
}

export interface LogEntry {
  run_id: string;
  user_id: string;
  timestamp: string;
  step_no: number;
  url: string;
  action: string;
  target: string;
  result: 'success' | 'failed' | 'vision_fallback_success';
  error?: string;
}

export interface LockFile {
  pid: number;
  created_at: string;
  flow_file: string;
  status: string;
}
