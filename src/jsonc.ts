/**
 * Minimal JSONC support: strip `//` and block comments, then drop trailing
 * commas, so the mapping file can be annotated in place.
 *
 * Since this project reads sensitive financial data, we hand-roll a parser rather than pull in any dependencies.
 */

/** Remove `//` line comments and block comments outside of string literals. */
function stripComments(input: string): string {
  let out = "";
  let inString = false;
  let inLine = false;
  let inBlock = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const next = input[i + 1];

    if (inLine) {
      // Keep the newline so line/column numbers in parse errors stay usable.
      if (c === "\n") {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === "*" && next === "/") {
        inBlock = false;
        i++;
      } else if (c === "\n") {
        out += c;
      }
      continue;
    }
    if (inString) {
      out += c;
      if (c === "\\") {
        // Copy the escaped character wholesale so an escaped quote can't end the string.
        out += input[i + 1] ?? "";
        i++;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }

    if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && next === "/") {
      inLine = true;
      i++;
    } else if (c === "/" && next === "*") {
      inBlock = true;
      i++;
    } else {
      out += c;
    }
  }

  return out;
}

/**
 * Drop commas that are followed only by whitespace and a closing brace/bracket.
 * Commenting out the last entry of a mapping otherwise leaves a trailing comma
 * and a confusing `JSON.parse` failure.
 */
function stripTrailingCommas(input: string): string {
  let out = "";
  let inString = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];

    if (inString) {
      out += c;
      if (c === "\\") {
        out += input[i + 1] ?? "";
        i++;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === ",") {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j])) j++;
      if (input[j] === "}" || input[j] === "]") continue; // trailing — drop it
    }
    out += c;
  }

  return out;
}

/** Parse JSON that may contain comments and trailing commas. */
export function parseJsonc<T>(text: string): T {
  return JSON.parse(stripTrailingCommas(stripComments(text))) as T;
}
