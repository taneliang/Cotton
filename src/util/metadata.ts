// Heavily adapted from probot/metadata
// https://github.com/probot/metadata/blob/master/index.js

const regex = /<!-- cottonmetadata = (.*) -->/;

function getMetadataObject(body: string) {
  const match = body.match(regex);
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch (e) {
    return null;
  }
}

export function getMetadata(body: string, key: string) {
  const data = getMetadataObject(body);
  return data && data[key];
}

// Set add key:value to metadata in bodyString.
// value must be JSON serializable
export function setMetadata(body: string, key: string, value: any) {
  const data = getMetadataObject(body) || {};
  // Remove metadata and starting and trailing newlines
  const bodyWithoutMetadata = body.replace(new RegExp(regex, 'g'), (_, json) => '').trim();

  data[key] = value;
  return `${bodyWithoutMetadata}\n\n<!-- cottonmetadata = ${JSON.stringify(data)} -->`;
}
