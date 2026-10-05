export type Component = number | string;
export type TextOperation = Component[];

export class OperationError extends Error {}

export function isRetain(c: Component | undefined): c is number {
  return typeof c === 'number' && c > 0;
}

export function isDelete(c: Component | undefined): c is number {
  return typeof c === 'number' && c < 0;
}

export function isInsert(c: Component | undefined): c is string {
  return typeof c === 'string';
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export function isWellFormed(text: string): boolean {
  return !LONE_SURROGATE.test(text);
}

export function isValidOperation(value: unknown): value is TextOperation {
  return (
    Array.isArray(value) &&
    value.every(
      (c) =>
        (typeof c === 'string' && c.length > 0 && isWellFormed(c)) ||
        (typeof c === 'number' && Number.isSafeInteger(c) && c !== 0),
    )
  );
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

export function baseLength(op: TextOperation): number {
  let length = 0;
  for (const c of op) {
    if (isRetain(c)) length += c;
    else if (isDelete(c)) length -= c;
  }
  return length;
}

export function targetLength(op: TextOperation): number {
  let length = 0;
  for (const c of op) {
    if (isRetain(c)) length += c;
    else if (isInsert(c)) length += c.length;
  }
  return length;
}

export function isNoop(op: TextOperation): boolean {
  return op.every((c) => isRetain(c));
}

class Builder {
  private readonly ops: TextOperation = [];

  retain(n: number): this {
    if (n <= 0) return this;
    const last = this.ops.length - 1;
    const lastOp = this.ops[last];
    if (isRetain(lastOp)) this.ops[last] = lastOp + n;
    else this.ops.push(n);
    return this;
  }

  insert(text: string): this {
    if (!text) return this;
    const last = this.ops.length - 1;
    const lastOp = this.ops[last];
    if (isInsert(lastOp)) {
      this.ops[last] = lastOp + text;
    } else if (isDelete(lastOp)) {
      const before = this.ops[last - 1];
      if (isInsert(before)) this.ops[last - 1] = before + text;
      else this.ops.splice(last, 0, text);
    } else {
      this.ops.push(text);
    }
    return this;
  }

  delete(n: number): this {
    if (n <= 0) return this;
    const last = this.ops.length - 1;
    const lastOp = this.ops[last];
    if (isDelete(lastOp)) this.ops[last] = lastOp - n;
    else this.ops.push(-n);
    return this;
  }

  build(): TextOperation {
    return this.ops;
  }
}

export function apply(text: string, op: TextOperation): string {
  if (baseLength(op) !== text.length) {
    throw new OperationError('L’opération ne correspond pas au texte.');
  }
  const parts: string[] = [];
  let index = 0;
  for (const c of op) {
    if (isRetain(c)) {
      parts.push(text.slice(index, index + c));
      index += c;
    } else if (isInsert(c)) {
      parts.push(c);
    } else {
      index -= c;
    }
  }
  return parts.join('');
}

function size(c: Component): number {
  return isInsert(c) ? c.length : Math.abs(c);
}

function reader(op: TextOperation) {
  let i = 0;
  let head: Component | undefined = op[0];
  return {
    get head() {
      return head;
    },
    next(): void {
      head = op[++i];
    },
    take(n: number): void {
      if (head === undefined) return;
      if (n < size(head)) {
        head = isInsert(head) ? head.slice(n) : isRetain(head) ? head - n : head + n;
      } else {
        head = op[++i];
      }
    },
  };
}

export function compose(first: TextOperation, second: TextOperation): TextOperation {
  if (targetLength(first) !== baseLength(second)) {
    throw new OperationError('Opérations impossibles à enchaîner.');
  }
  const a = reader(first);
  const b = reader(second);
  const out = new Builder();
  while (a.head !== undefined || b.head !== undefined) {
    if (isDelete(a.head)) {
      out.delete(-a.head);
      a.next();
      continue;
    }
    if (isInsert(b.head)) {
      out.insert(b.head);
      b.next();
      continue;
    }
    if (a.head === undefined || b.head === undefined) {
      throw new OperationError('Opérations impossibles à enchaîner.');
    }
    const n = Math.min(size(a.head), size(b.head));
    if (isRetain(a.head) && isRetain(b.head)) out.retain(n);
    else if (isInsert(a.head) && isRetain(b.head)) out.insert(a.head.slice(0, n));
    else if (isRetain(a.head) && isDelete(b.head)) out.delete(n);
    a.take(n);
    b.take(n);
  }
  return out.build();
}

export function transform(
  first: TextOperation,
  second: TextOperation,
): [TextOperation, TextOperation] {
  if (baseLength(first) !== baseLength(second)) {
    throw new OperationError('Opérations concurrentes sur des textes différents.');
  }
  const a = reader(first);
  const b = reader(second);
  const firstOut = new Builder();
  const secondOut = new Builder();
  while (a.head !== undefined || b.head !== undefined) {
    if (isInsert(a.head)) {
      firstOut.insert(a.head);
      secondOut.retain(a.head.length);
      a.next();
      continue;
    }
    if (isInsert(b.head)) {
      firstOut.retain(b.head.length);
      secondOut.insert(b.head);
      b.next();
      continue;
    }
    if (a.head === undefined || b.head === undefined) {
      throw new OperationError('Opérations concurrentes sur des textes différents.');
    }
    const n = Math.min(size(a.head), size(b.head));
    if (isRetain(a.head) && isRetain(b.head)) {
      firstOut.retain(n);
      secondOut.retain(n);
    } else if (isDelete(a.head) && isRetain(b.head)) {
      firstOut.delete(n);
    } else if (isRetain(a.head) && isDelete(b.head)) {
      secondOut.delete(n);
    }
    a.take(n);
    b.take(n);
  }
  return [firstOut.build(), secondOut.build()];
}

export function diff(before: string, after: string, caret?: number): TextOperation {
  const max = Math.min(before.length, after.length);
  let start = 0;
  const prefixLimit = caret === undefined ? max : Math.max(0, Math.min(max, caret));
  while (start < prefixLimit && before[start] === after[start]) start++;
  let end = 0;
  while (end < max - start && before[before.length - 1 - end] === after[after.length - 1 - end]) {
    end++;
  }
  if (start > 0 && isHighSurrogate(before.charCodeAt(start - 1))) start--;
  if (end > 0 && isLowSurrogate(before.charCodeAt(before.length - end))) end--;
  return new Builder()
    .retain(start)
    .delete(before.length - start - end)
    .insert(after.slice(start, after.length - end))
    .retain(end)
    .build();
}

export function transformIndex(index: number, op: TextOperation): number {
  let position = 0;
  let result = index;
  for (const c of op) {
    if (position >= index) break;
    if (isRetain(c)) {
      position += c;
    } else if (isInsert(c)) {
      result += c.length;
    } else {
      result -= Math.min(-c, index - position);
      position -= c;
    }
  }
  return result;
}
