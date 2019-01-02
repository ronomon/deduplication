// Type definitions for @ronomon/deduplication 2.0.4
// Project: deduplication
// Definitions by: Nathan Fiedler

export function targetSize(minimum: number, sourceSize: number): number

export function deduplicate(
  average: number,
  minimum: number,
  maximum: number,
  source: Buffer,
  sourceOffset: number,
  sourceSize: number,
  target: Buffer,
  targetOffset: number,
  flags: number,
  callback: Function
): void
