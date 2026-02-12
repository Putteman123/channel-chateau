import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExternalPlayerOptions } from './ExternalPlayerOptions';

// Mock toast
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

describe('ExternalPlayerOptions', () => {
  const props = {
    streamUrl: 'http://example.com/stream.ts',
    channelName: 'Test Channel',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders heading and description', () => {
    render(<ExternalPlayerOptions {...props} />);
    expect(screen.getByText('Välj uppspelningsmetod')).toBeInTheDocument();
    expect(screen.getByText(/Webbuppspelning blockeras/)).toBeInTheDocument();
  });

  it('renders all three buttons', () => {
    render(<ExternalPlayerOptions {...props} />);
    expect(screen.getByText('Öppna i VLC')).toBeInTheDocument();
    expect(screen.getByText('Ladda ner .m3u')).toBeInTheDocument();
    expect(screen.getByText('Kopiera länk')).toBeInTheDocument();
  });

  it('VLC button sets window.location.href with vlc:// scheme', () => {
    // Mock window.location
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, href: '' },
    });

    render(<ExternalPlayerOptions {...props} />);
    fireEvent.click(screen.getByText('Öppna i VLC'));
    expect(window.location.href).toBe(`vlc://${props.streamUrl}`);

    Object.defineProperty(window, 'location', { writable: true, value: originalLocation });
  });

  it('download button creates and clicks an anchor for .m3u file', () => {
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, writable: true });

    const clickSpy = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        el.click = clickSpy;
      }
      return el;
    });

    render(<ExternalPlayerOptions {...props} />);
    fireEvent.click(screen.getByText('Ladda ner .m3u'));

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('copy button copies URL to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ExternalPlayerOptions {...props} />);
    fireEvent.click(screen.getByText('Kopiera länk'));

    expect(writeText).toHaveBeenCalledWith(props.streamUrl);
  });
});
