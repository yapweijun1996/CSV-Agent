export function repairJson(malformedJson) {
  if (typeof malformedJson !== 'string') {
    return null;
  }
  const startIndex = malformedJson.indexOf('{');
  const endIndex = malformedJson.lastIndexOf('}');
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }

  const candidate = malformedJson.slice(startIndex, endIndex + 1);
  const attempts = [candidate, ...generateJsonRepairCandidates(candidate)];
  let lastError = null;

  for (const attempt of attempts) {
    if (!attempt) continue;
    try {
      return JSON.parse(attempt);
    } catch (parseError) {
      lastError = parseError;
    }
  }

  if (lastError) {
    console.error('JSON repair failed:', lastError);
  }
  return null;
}

function generateJsonRepairCandidates(text) {
  const variants = [];
  const noDanglingCommas = removeDanglingCommas(text);
  if (noDanglingCommas !== text) {
    variants.push(noDanglingCommas);
  }

  const inserted = insertMissingCommas(noDanglingCommas);
  if (inserted !== noDanglingCommas) {
    variants.push(inserted);
  }

  const directInserted = insertMissingCommas(text);
  if (
    directInserted !== text &&
    directInserted !== inserted &&
    !variants.includes(directInserted)
  ) {
    variants.push(directInserted);
  }

  return variants;
}

function removeDanglingCommas(input) {
  if (typeof input !== 'string') return input;
  return input.replace(/,\s*([}\]])/g, '$1');
}

function insertMissingCommas(text) {
  if (typeof text !== 'string' || text.indexOf('"') === -1) {
    return text;
  }

  let result = '';
  let inString = false;
  let escape = false;
  let changed = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    result += char;

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = false;
        const insertPosition = i + 1;
        let j = insertPosition;
        let sawComma = false;

        while (j < text.length) {
          const lookahead = text[j];
          if (lookahead === ',') {
            sawComma = true;
            break;
          }
          if (!/\s/.test(lookahead)) {
            break;
          }
          j++;
        }

        const nextChar = text[j];
        if (
          !sawComma &&
          nextChar &&
          nextChar !== ':' &&
          nextChar !== ']' &&
          nextChar !== '}' &&
          isLikelyValueStart(nextChar)
        ) {
          result += ',';
          changed = true;
        }
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    }
  }

  return changed ? result : text;
}

function isLikelyValueStart(char) {
  return (
    char === '"' ||
    char === '{' ||
    char === '[' ||
    char === '-' ||
    (char >= '0' && char <= '9') ||
    char === 't' ||
    char === 'f' ||
    char === 'n'
  );
}
