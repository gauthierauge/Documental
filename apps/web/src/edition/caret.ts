const COPIED = [
  'boxSizing',
  'width',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontFamily',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'textAlign',
  'textIndent',
  'textTransform',
  'tabSize',
] as const;

export interface CaretBox {
  top: number;
  left: number;
  height: number;
}

export function caretBox(area: HTMLTextAreaElement, index: number): CaretBox {
  const style = window.getComputedStyle(area);
  const mirror = document.createElement('div');
  for (const property of COPIED) mirror.style[property] = style[property];
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.top = '0';
  mirror.style.left = '-99999px';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.overflowY = area.scrollHeight > area.clientHeight ? 'scroll' : 'hidden';
  mirror.textContent = area.value.slice(0, index);
  const marker = document.createElement('span');
  marker.textContent = area.value.slice(index, index + 1) || '​';
  mirror.append(marker);
  document.body.append(mirror);
  const lineHeight = Number.parseFloat(style.lineHeight);
  const box = {
    top: marker.offsetTop - area.scrollTop,
    left: marker.offsetLeft - area.scrollLeft,
    height: Number.isFinite(lineHeight) ? lineHeight : marker.offsetHeight,
  };
  mirror.remove();
  return box;
}

const HUES = [210, 340, 140, 28, 270, 185, 0, 95];

export function colorFor(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return `hsl(${HUES[hash % HUES.length]} 70% 38%)`;
}
