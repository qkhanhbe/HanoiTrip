// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../app/client/App';
import { demoProvider } from '../../app/server/routes-provider';
import { places, toPoint } from '../../app/shared/places';
// jsdom has no WebGL. Real tiles, pan/zoom and clicks are checked by browser-smoke.mjs.
vi.mock('../../app/client/OpenMap', () => ({
  default: ({
    onPick,
    pickTarget,
  }: {
    onPick: (point: ReturnType<typeof toPoint>) => void;
    pickTarget: 'origin' | 'destination';
  }) => (
    <button
      onClick={() =>
        onPick({ label: 'Điểm trên bản đồ (21.04, 105.825)', latitude: 21.04, longitude: 105.825 })
      }
    >
      Chọn tâm bản đồ làm {pickTarget === 'origin' ? 'điểm đi' : 'điểm đến'}
    </button>
  ),
}));
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  HTMLDialogElement.prototype.close = vi.fn();
  HTMLDialogElement.prototype.showModal = vi.fn();
  fetchMock = vi.fn<typeof fetch>();
  fetchMock.mockImplementation(async (url, options) => {
    if (url === '/config')
      return Response.json({ routesMode: 'demo', mapsBrowserKey: '', storage: 'memory' });
    if (url === '/routes')
      return Response.json(await demoProvider(JSON.parse(String(options?.body))));
    if (url === '/items') return Response.json({ id: 'saved' }, { status: 201 });
    return Response.json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('searches, shows detail, saves endpoint-only data and clears stale results on swap', async () => {
  const user = userEvent.setup();
  render(<App />);
  const search = await screen.findByRole('button', { name: 'Tìm hành trình' });
  await waitFor(() => expect(search).toBeEnabled());
  await user.click(search);
  expect(await screen.findByText('3 phương án')).toBeInTheDocument();
  const first = screen.getByRole('article', { name: 'Phương án 1' });
  await user.click(within(first).getByRole('button', { name: 'Chi tiết hành trình' }));
  expect(within(first).getByRole('list')).toBeInTheDocument();
  await user.click(within(first).getByRole('button', { name: 'Lưu hành trình phương án 1' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Đã lưu');
  const saved = fetchMock.mock.calls.find(([url]) => url === '/items');
  expect(Object.keys(JSON.parse(String(saved?.[1]?.body))).sort()).toEqual([
    'destination',
    'label',
    'origin',
  ]);
  await user.click(screen.getByRole('button', { name: 'Đảo điểm đi và điểm đến' }));
  expect(screen.queryByText('3 phương án')).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Điểm đi' })).toHaveValue(places[2].label);
});
it('keeps input focused while typing and supports keyboard landmark selection', async () => {
  const user = userEvent.setup();
  render(<App />);
  const input = screen.getByRole('combobox', { name: 'Điểm đi' });
  await user.clear(input);
  await user.type(input, 'van mieu');
  expect(input).toHaveValue('van mieu');
  expect(input).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(input).toHaveValue(places[1].label);
});
it('lets users choose an endpoint from the interactive demo map', async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText('Chế độ trải nghiệm · Dữ liệu minh họa');
  await user.click(screen.getByRole('button', { name: 'Điểm đi' }));
  await user.click(screen.getByRole('button', { name: 'Chọn tâm bản đồ làm điểm đi' }));
  expect((screen.getByRole('combobox', { name: 'Điểm đi' }) as HTMLInputElement).value).toContain(
    'Điểm trên bản đồ',
  );
  expect(await screen.findByRole('status')).toHaveTextContent('Đã chọn điểm đi');
});
it('shows real request errors and allows retry rather than inventing routes', async () => {
  fetchMock.mockImplementation(async (url) =>
    url === '/config'
      ? Response.json({ routesMode: 'demo', mapsBrowserKey: '', storage: 'memory' })
      : Response.json(
          { error: { message: 'Nguồn tạm dừng', requestId: 'test-id' } },
          { status: 502 },
        ),
  );
  const user = userEvent.setup();
  render(<App />);
  const search = screen.getByRole('button', { name: 'Tìm hành trình' });
  await waitFor(() => expect(search).toBeEnabled());
  await user.click(search);
  expect(await screen.findByRole('alert')).toHaveTextContent('Nguồn tạm dừng');
  expect(screen.queryByText('3 phương án')).not.toBeInTheDocument();
});
it('reopens saved endpoints without reusing obsolete route data', async () => {
  fetchMock.mockImplementation(async (url) =>
    url === '/config'
      ? Response.json({ routesMode: 'demo', mapsBrowserKey: '', storage: 'mysql' })
      : Response.json([
          {
            id: 'one',
            label: 'test',
            origin: toPoint(places[3]),
            destination: toPoint(places[1]),
            createdAt: new Date().toISOString(),
          },
        ]),
  );
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Đã lưu' }));
  await user.click(await screen.findByRole('button', { name: /Ga Cát Linh/ }));
  expect(screen.getByRole('combobox', { name: 'Điểm đi' })).toHaveValue(places[3].label);
  expect(screen.queryByText('3 phương án')).not.toBeInTheDocument();
});
