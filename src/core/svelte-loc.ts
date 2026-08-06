import { SvelteLocSchema, type SvelteLoc } from './model';

export {
  SQUAWK_HOST_ID,
  SVELTE_LOC_REQUEST_EVENT,
  SVELTE_LOC_RESULT_ATTRIBUTE,
} from './svelte-loc-protocol';

const MAX_LOC_LABEL_LENGTH = 80;

export function svelteLocLabel(raw: string): SvelteLoc | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const filenameStart =
    Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\')) + 1;
  const filenameAndLine = trimmed.slice(filenameStart);
  const codePoints = Array.from(filenameAndLine);
  const label =
    codePoints.length > MAX_LOC_LABEL_LENGTH
      ? `…${codePoints.slice(codePoints.length - (MAX_LOC_LABEL_LENGTH - 1)).join('')}`
      : filenameAndLine;
  return SvelteLocSchema.parse(label);
}
