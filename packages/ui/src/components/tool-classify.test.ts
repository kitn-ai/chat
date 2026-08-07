import { describe, expect, it } from 'vitest';
import { classifyTool } from './tool-classify';

describe('classifyTool', () => {
  it('classifies shell-ish tools as command', () => {
    expect(classifyTool('bash')).toBe('command');
    expect(classifyTool('run_terminal_command')).toBe('command');
    expect(classifyTool('Shell')).toBe('command');
  });

  it('classifies mutation tools as file-change', () => {
    expect(classifyTool('str_replace_editor')).toBe('file-change');
    expect(classifyTool('write_file')).toBe('file-change');
  });

  it('classifies search before fetch so web_search is a search', () => {
    expect(classifyTool('web_search')).toBe('search');
    expect(classifyTool('grep')).toBe('search');
  });

  it('classifies fetch-ish tools as fetch', () => {
    expect(classifyTool('fetch_url')).toBe('fetch');
  });

  it('classifies image tools as image', () => {
    expect(classifyTool('view_image')).toBe('image');
  });

  it('always terminates in generic for unknown names', () => {
    expect(classifyTool('propose_action')).toBe('generic');
    expect(classifyTool('')).toBe('generic');
    expect(classifyTool('zzzz')).toBe('generic');
  });

  it('is deterministic and case-insensitive', () => {
    expect(classifyTool('BASH')).toBe(classifyTool('bash'));
  });
});
