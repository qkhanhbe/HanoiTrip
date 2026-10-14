// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VietmapMap from '../../app/client/VietmapMap';
import { loadVietmapRenderer, loadVietmapStyle } from '../../app/client/vietmap-sdk';

vi.mock('../../app/client/vietmap-sdk', () => ({
  loadVietmapRenderer: vi.fn(),
  loadVietmapStyle: vi.fn(),
}));
vi.mock('../../app/client/OpenMap', () => ({ default: () => <div>Bản đồ đã tải</div> }));
const props = {
  origin: null,
  destination: null,
  pickTarget: 'destination' as const,
  basemapProvider: 'vietmap' as const,
  onPick: vi.fn(),
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('waits for both SDK and style before showing the map', async () => {
  vi.mocked(loadVietmapRenderer).mockResolvedValue({} as never);
  vi.mocked(loadVietmapStyle).mockResolvedValue({} as never);
  render(<VietmapMap {...props} />);
  expect(screen.getByText('Đang tải bản đồ VIETMAP…')).toBeVisible();
  expect(await screen.findByText('Bản đồ đã tải')).toBeVisible();
});

it('can retry a provider failure and render successfully', async () => {
  vi.mocked(loadVietmapRenderer).mockResolvedValue({} as never);
  vi.mocked(loadVietmapStyle)
    .mockRejectedValueOnce(new Error('Bản đồ tạm thời không khả dụng.'))
    .mockResolvedValueOnce({} as never);
  render(<VietmapMap {...props} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('không khả dụng');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Thử tải lại bản đồ' }));
  expect(await screen.findByText('Bản đồ đã tải')).toBeVisible();
});
