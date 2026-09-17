// Minimal, dependency-free Valve Data Format (VDF / KeyValues) parser.
// Steam stores its library + app manifests as VDF text. We parse it into a
// plain JS object so the Steam detector can extract appid / name / installdir.

type VdfValue = string | { [key: string]: VdfValue };

/**
 * Parse a VDF string into a nested object.
 * Supports quoted keys/values, nested sections, and comments.
 */
export function parseVdf(input: string): VdfValue {
  const tokens = tokenize(input);
  let i = 0;

  function parseObject(): { [key: string]: VdfValue } {
    const obj: { [key: string]: VdfValue } = {};
    while (i < tokens.length) {
      const tok = tokens[i];
      if (tok === "}") {
        i++;
        break;
      }
      // tok is a key
      const key = stripQuotes(tokens[i]);
      i++;
      if (tokens[i] === "{") {
        i++; // skip {
        obj[key] = parseObject();
      } else {
        obj[key] = stripQuotes(tokens[i]);
        i++;
      }
    }
    return obj;
  }

  // VDF files start with a top-level "key { ... }" wrapper.
  const root = parseObject();
  return root;
}

function stripQuotes(s: string): string {
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return s;
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    const c = input[i];
    // Whitespace
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    // Comment
    if (c === "/" && input[i + 1] === "/") {
      while (i < n && input[i] !== "\n") i++;
      continue;
    }
    // String
    if (c === '"') {
      let j = i + 1;
      let buf = "";
      while (j < n) {
        const ch = input[j];
        if (ch === "\\" && j + 1 < n) {
          buf += ch + input[j + 1];
          j += 2;
          continue;
        }
        if (ch === '"') break;
        buf += ch;
        j++;
      }
      tokens.push(`"${buf}"`);
      i = j + 1;
      continue;
    }
    // Brace
    if (c === "{" || c === "}") {
      tokens.push(c);
      i++;
      continue;
    }
    // Bare token (rare in VDF but handle it)
    let j = i;
    let buf = "";
    while (j < n && !/[\s{}"]/.test(input[j])) {
      buf += input[j];
      j++;
    }
    tokens.push(buf);
    i = j;
  }
  return tokens;
}

/** Walk into a nested VDF object using a dotted path. */
export function vdfGet(obj: VdfValue, path: string[]): VdfValue | undefined {
  let cur: VdfValue | undefined = obj;
  for (const p of path) {
    if (cur && typeof cur === "object" && !Array.isArray(cur)) {
      cur = (cur as { [k: string]: VdfValue })[p];
    } else {
      return undefined;
    }
  }
  return cur;
}
