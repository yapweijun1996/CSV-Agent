import { getDeepValue } from './objectPath.js';

const TOOL_RESULT_REGEX = /\{\{\s*(tool_result|tool)\.([a-zA-Z0-9_\.]+)\s*\}\}/g;

export function hydrateReplyTemplate(template, context) {
  if (typeof template !== 'string' || !template.trim()) {
    return template;
  }
  const { lastToolResult, namedResults, fallbackValue = 'unavailable' } = context || {};
  return template.replace(TOOL_RESULT_REGEX, (_, kind, rawPath) => {
    if (kind === 'tool_result') {
      return formatValueFromResult(lastToolResult, rawPath, fallbackValue);
    }
    if (kind === 'tool') {
      const [saveAs, ...pathParts] = rawPath.split('.');
      if (!saveAs) return fallbackValue;
      const record = namedResults?.get(saveAs);
      if (!record) return fallbackValue;
      if (pathParts.length === 0) {
        return stringify(record);
      }
      let value = getDeepValue(record, pathParts);
      if (value === undefined && record?.result) {
        value = getDeepValue(record.result, pathParts);
      }
      return value === undefined ? fallbackValue : stringify(value);
    }
    return fallbackValue;
  });
}

function formatValueFromResult(result, path, fallbackValue) {
  if (!result) return fallbackValue;
  const pathSegments = path.split('.');
  let value = getDeepValue(result, pathSegments);
  if (value === undefined && result.result) {
    value = getDeepValue(result.result, pathSegments);
  }
  if (value === undefined || value === null) {
    return fallbackValue;
  }
  return stringify(value);
}

function stringify(value) {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }
  return String(value);
}
