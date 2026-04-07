import { ref } from 'vue';

// --- Tool selection state ---

export const activeTool = ref<string>('');
export const activePaintTool = ref<'' | 'pencil' | 'erase' | 'eyedropper' | 'marquee'>('');
export const activeAtlasTool = ref<'' | 'sprite-move'>('');
export const activePaintColor = ref('#e8e2d4');
export const paintToolSize = ref(1);

// Eyedropper state: when non-null, the canvas is in eyedropper mode
export const activeEyedropper = ref<{
  callback: (hex: string) => void;
  originalValue: string;
} | null>(null);

// --- Tool selection functions ---

export function setSelectTool() {
  activeTool.value = '';
  activePaintTool.value = '';
  activeAtlasTool.value = '';
}

export function setEntityTool(label: string) {
  activePaintTool.value = '';
  activeAtlasTool.value = '';
  activeTool.value = label;
}

export function setPaintTool(tool: '' | 'pencil' | 'erase' | 'eyedropper' | 'marquee') {
  activeTool.value = '';
  activeAtlasTool.value = '';
  activePaintTool.value = tool;
}

export function setAtlasTool(tool: '' | 'sprite-move') {
  activeTool.value = '';
  activePaintTool.value = '';
  activeAtlasTool.value = tool;
}
