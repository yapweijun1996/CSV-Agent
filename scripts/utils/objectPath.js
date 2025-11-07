export function getDeepValue(root, pathSegments = []) {
  if (!root || !Array.isArray(pathSegments) || pathSegments.length === 0) {
    return undefined;
  }
  let current = root;
  for (const segment of pathSegments) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (!(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

export function deepClone(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item));
  }
  const clone = {};
  Object.keys(value).forEach((key) => {
    clone[key] = deepClone(value[key]);
  });
  return clone;
}
