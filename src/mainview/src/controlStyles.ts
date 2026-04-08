export const controlButtonClass =
  'inline-flex min-h-7 items-center justify-center rounded border border-border bg-surface-2 px-2.5 font-mono text-[11px] text-text transition-[border-color,background-color,color,transform] enabled:cursor-pointer enabled:hover:border-copper enabled:hover:bg-[color-mix(in_srgb,var(--color-surface-2)_82%,var(--color-copper-glow))] enabled:hover:text-copper-bright enabled:active:translate-y-px disabled:cursor-default disabled:border-border disabled:bg-surface-2 disabled:text-text-faint disabled:opacity-45';

export const controlPrimaryButtonClass = `${controlButtonClass} border-[color-mix(in_srgb,var(--color-copper)_60%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-copper-glow)_55%,var(--color-surface-1))] text-copper-bright enabled:hover:border-copper enabled:hover:bg-[color-mix(in_srgb,var(--color-copper-glow-strong)_65%,var(--color-surface-1))]`;

export const controlDangerButtonClass = `${controlButtonClass} border-[color-mix(in_srgb,var(--color-danger)_60%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-danger)_18%,var(--color-surface-1))] text-[#f0b0b0] enabled:hover:border-danger enabled:hover:bg-[color-mix(in_srgb,var(--color-danger)_28%,var(--color-surface-1))] enabled:hover:text-[#ffd1d1]`;

export const controlIconButtonClass =
  'inline-flex items-center justify-center rounded border border-transparent bg-transparent p-0 text-text-dim transition-[border-color,background-color,color,transform] enabled:cursor-pointer enabled:hover:border-border enabled:hover:bg-surface-2 enabled:hover:text-text enabled:active:translate-y-px disabled:cursor-default disabled:opacity-40';

export const controlIconButtonActiveClass =
  'border-copper/40 bg-copper-glow text-copper-bright enabled:hover:border-copper enabled:hover:bg-copper-glow enabled:hover:text-copper-bright';

export const controlTextButtonClass =
  'inline-flex items-center gap-1 border-0 bg-transparent p-0 text-[11px] text-text-dim transition-colors enabled:cursor-pointer enabled:hover:text-copper disabled:cursor-default disabled:opacity-40';

export const controlTextDangerButtonClass =
  'inline-flex items-center gap-1 border-0 bg-transparent p-0 text-[11px] text-text-faint transition-colors enabled:cursor-pointer enabled:hover:text-danger disabled:cursor-default disabled:opacity-40';

export const controlSegmentButtonClass =
  'inline-flex min-h-6 items-center justify-center rounded-[3px] border border-border bg-transparent px-2 py-0.5 font-mono text-[11px] text-text-faint transition-[border-color,background-color,color,transform] enabled:cursor-pointer enabled:hover:border-border-strong enabled:hover:bg-surface-2 enabled:hover:text-text enabled:active:translate-y-px disabled:cursor-default disabled:opacity-40';

export const controlSegmentButtonActiveClass =
  'border-copper bg-copper-glow text-copper-bright enabled:hover:border-copper enabled:hover:bg-copper-glow enabled:hover:text-copper-bright';

export const controlChipButtonClass =
  'inline-flex min-h-6 shrink-0 items-center justify-center rounded-sm border border-border bg-surface-2 px-1.5 font-mono text-[10px] text-text-faint transition-[border-color,background-color,color,transform] enabled:cursor-pointer enabled:hover:border-border-strong enabled:hover:text-text enabled:active:translate-y-px disabled:cursor-default disabled:opacity-40';

export const controlChipButtonActiveClass =
  'border-copper/40 bg-copper-glow text-copper-bright enabled:hover:border-copper enabled:hover:text-copper-bright';

export const controlDisclosureButtonClass =
  'flex items-center gap-2 border-0 bg-transparent p-0 text-left text-[10px] font-medium uppercase tracking-[0.05em] text-text-faint transition-colors enabled:cursor-pointer enabled:hover:text-text-dim';

export const controlPropertyToggleButtonClass =
  'flex min-w-0 flex-1 items-center gap-1.5 border-0 bg-transparent py-0.5 text-left text-[11px] font-medium text-text-dim transition-colors enabled:cursor-pointer enabled:hover:text-text';

export const controlSubtleButtonClass =
  'inline-flex items-center justify-center rounded border border-border bg-transparent px-2 py-1 text-[11px] text-text-dim transition-[border-color,background-color,color,transform] enabled:cursor-pointer enabled:hover:border-copper enabled:hover:bg-copper-glow enabled:hover:text-copper enabled:active:translate-y-px disabled:cursor-default disabled:opacity-40';

export const controlListButtonClass =
  'rounded-sm border text-left transition-[border-color,background-color,color,transform,opacity] enabled:cursor-pointer enabled:active:translate-y-px';

export const controlListButtonDefaultClass =
  'border-border bg-surface-2 text-text hover:border-border-strong hover:-translate-y-px';

export const controlListButtonActiveClass =
  'border-copper bg-copper-glow text-copper-bright';

export const controlSliderClass =
  'h-1 appearance-none rounded-sm border-0 bg-border p-0 outline-none [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-border [&::-moz-range-thumb]:bg-text-dim [&::-moz-range-thumb]:transition-[background] [&::-moz-range-thumb]:duration-75 [&::-moz-range-thumb]:ease-linear [&::-moz-range-thumb]:hover:bg-copper [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-none [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-border [&::-webkit-slider-thumb]:bg-text-dim [&::-webkit-slider-thumb]:transition-[background] [&::-webkit-slider-thumb]:duration-75 [&::-webkit-slider-thumb]:ease-linear [&::-webkit-slider-thumb]:hover:bg-copper';
