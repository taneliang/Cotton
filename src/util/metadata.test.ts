import { getMetadata, setMetadata } from './metadata';

describe(getMetadata, () => {
  test('should return null when no metadata found', () => {
    const body = 'No metadata\n\ncottonmetadata = {"key": "value"}';
    expect(getMetadata(body, 'key')).toBeNull();
  });

  test('should return null when metadata is invalid JSON', () => {
    const body = '\n\n<!-- cottonmetadata = {"key": "value" -->';
    expect(getMetadata(body, 'key')).toBeNull();
  });

  test('should return undefined when parsed metadata is not an object', () => {
    const body1 = '\n\n<!-- cottonmetadata = ["key", "value"] -->';
    expect(getMetadata(body1, 'key')).toBeUndefined();

    const body2 = '\n\n<!-- cottonmetadata = "key" -->';
    expect(getMetadata(body2, 'key')).toBeUndefined();
  });

  test('should return undefined when key is not found', () => {
    const body = '\n\n<!-- cottonmetadata = {"anotherkey": "value"} -->';
    expect(getMetadata(body, 'key')).toBeUndefined();
  });

  test('should return requested value if present', () => {
    const body1 = '\n\n<!-- cottonmetadata = {"key": "value"} -->';
    expect(getMetadata(body1, 'key')).toEqual('value');

    const body2 = '\n\n<!-- cottonmetadata = {"key": {"key": ["one", "two"]}} -->';
    expect(getMetadata(body2, 'key')).toEqual({ key: ['one', 'two'] });
  });

  test('should only use first comment if more than one present', () => {
    const body =
      '\n\n<!-- cottonmetadata = {"key": "value"} -->\n\n<!-- cottonmetadata = {"anotherkey": "value"} -->';
    expect(getMetadata(body, 'key')).toEqual('value');
    expect(getMetadata(body, 'anotherkey')).toBeUndefined();
  });
});

describe(setMetadata, () => {
  const standardExpectedBody =
    'Body\n\ncottonmetadata\n\n<!-- cottonmetadata = {"key":"value"} -->';

  test('should set new metadata object with value', () => {
    const body = 'Body\n\ncottonmetadata';
    const value = 'value';
    const newBody = setMetadata(body, 'key', value);
    expect(newBody).toEqual(standardExpectedBody);
  });

  test('should replace and append to existing metadata object if present', () => {
    const body = 'Body\n\ncottonmetadata\n\n<!-- cottonmetadata = {"otherkey":"othervalue"} -->';
    const value = 'value';
    const newBody = setMetadata(body, 'key', value);
    const expectedBody =
      'Body\n\ncottonmetadata\n\n<!-- cottonmetadata = {"otherkey":"othervalue","key":"value"} -->';
    expect(newBody).toEqual(expectedBody);
  });

  test('should replace and update values in existing metadata object if present', () => {
    const body = 'Body\n\ncottonmetadata\n\n<!-- cottonmetadata = {"key":"oldvalue"} -->';
    const value = 'value';
    const newBody = setMetadata(body, 'key', value);
    expect(newBody).toEqual(standardExpectedBody);
  });

  test('should replace all invalid metadata comments', () => {
    const body = 'Body\n\ncottonmetadata\n\n<!-- cottonmetadata = {"key":"value" -->';
    const value = 'value';
    const newBody = setMetadata(body, 'key', value);
    expect(newBody).toEqual(standardExpectedBody);
  });

  test('should also remove all other metadata comments', () => {
    const body =
      'Body\n\ncottonmetadata\n\n<!-- cottonmetadata = {"key": "oldvalue"} -->\n\n<!-- cottonmetadata = {"anotherkey": "value"} -->';
    const value = 'value';
    const newBody = setMetadata(body, 'key', value);
    expect(newBody).toEqual(standardExpectedBody);
  });
});
