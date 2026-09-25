import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  ArrowDownUp,
  ArrowRight,
  Bookmark,
  BusFront,
  Check,
  Clock3,
  Compass,
  Info,
  LoaderCircle,
  MapPin,
  Route,
  X,
} from 'lucide-react';
import type { Item, Point, PublicConfig, RoutesResponse, TripInput } from '../shared/contracts';
import { isSupportedPoint } from '../shared/geo';
import { places, toPoint } from '../shared/places';
import { api, ApiError } from './api';
import { PlaceInput } from './PlaceInput';
import { JourneyCard, time } from './JourneyCard';
const OpenMap = lazy(() => import('./OpenMap'));
const GoogleMap = lazy(() => import('./GoogleMap'));
export default function App() {
  const [config, setConfig] = useState<PublicConfig>();
  const [configError, setConfigError] = useState(false);
  const [origin, setOrigin] = useState<Point | null>(toPoint(places[0]));
  const [destination, setDestination] = useState<Point | null>(toPoint(places[2]));
  const [departure, setDeparture] = useState('now');
  const [scheduled, setScheduled] = useState('');
  const [response, setResponse] = useState<RoutesResponse>();
  const [submitted, setSubmitted] = useState<TripInput>();
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'planner' | 'saved'>('planner');
  const [favorites, setFavorites] = useState<Item[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoritesError, setFavoritesError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [about, setAbout] = useState(false);
  const [pickTarget, setPickTarget] = useState<'origin' | 'destination'>('destination');
  const controller = useRef<AbortController | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const abort = new AbortController();
    void api<PublicConfig>('/config', { signal: abort.signal })
      .then(setConfig)
      .catch((error) => {
        if (error.name !== 'AbortError') setConfigError(true);
      });
    return () => {
      abort.abort();
      controller.current?.abort();
      clearTimeout(noticeTimer.current);
    };
  }, []);
  useEffect(() => {
    if (about) dialog.current?.showModal();
    else dialog.current?.close();
  }, [about]);
  const clearResults = () => {
    controller.current?.abort();
    setLoading(false);
    setResponse(undefined);
    setSubmitted(undefined);
    setError('');
    setExpanded(undefined);
  };
  const changePoint = (target: 'origin' | 'destination', point: Point | null) => {
    clearResults();
    if (target === 'origin') setOrigin(point);
    else setDestination(point);
  };
  const showNotice = (text: string) => {
    clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => setNotice(''), 5000);
  };
  async function search(event?: React.SubmitEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!origin || !destination) {
      setError('Chọn điểm đi và điểm đến từ gợi ý, hoặc nhập tọa độ.');
      return;
    }
    if (departure === 'scheduled' && !scheduled) {
      setError('Chọn ngày và giờ khởi hành.');
      return;
    }
    const input: TripInput = {
      origin,
      destination,
      ...(departure === 'scheduled' ? { departureTime: new Date(scheduled).toISOString() } : {}),
    };
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    setError('');
    setResponse(undefined);
    setExpanded(undefined);
    try {
      const result = await api<RoutesResponse>('/routes', {
        method: 'POST',
        body: JSON.stringify(input),
        signal: abort.signal,
      });
      if (!abort.signal.aborted) {
        setResponse(result);
        setSubmitted(input);
        setSelected(0);
      }
    } catch (error) {
      if (!abort.signal.aborted)
        setError(
          error instanceof ApiError
            ? `${error.message}${error.requestId ? ` Mã hỗ trợ: ${error.requestId}` : ''}`
            : 'Tìm đường chưa thành công. Hãy thử lại.',
        );
    } finally {
      if (!abort.signal.aborted) setLoading(false);
    }
  }
  async function loadFavorites() {
    setTab('saved');
    setFavoritesLoading(true);
    setFavoritesError('');
    try {
      setFavorites(await api<Item[]>('/items?limit=100'));
    } catch (error) {
      setFavoritesError(error instanceof Error ? error.message : 'Chưa tải được hành trình.');
    } finally {
      setFavoritesLoading(false);
    }
  }
  async function save() {
    if (!submitted) return;
    setSaving(true);
    try {
      await api<Item>('/items', {
        method: 'POST',
        body: JSON.stringify({
          origin: submitted.origin,
          destination: submitted.destination,
          label: `${submitted.origin.label} → ${submitted.destination.label}`.slice(0, 80),
        }),
      });
      showNotice('Đã lưu điểm đi và điểm đến. Mở lại để tìm lịch trình mới.');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Chưa lưu được. Hãy thử lại.');
    } finally {
      setSaving(false);
    }
  }
  const pickOnMap = (point: Point) => {
    if (!isSupportedPoint(point)) {
      showNotice('Chọn điểm trong khu vực Hà Nội được hỗ trợ.');
      return;
    }
    changePoint(pickTarget, point);
    showNotice(`Đã chọn ${pickTarget === 'origin' ? 'điểm đi' : 'điểm đến'} trên bản đồ.`);
  };
  const route = response?.routes[selected];
  return (
    <div className="app-shell">
      <a href="#planner" className="skip-link">
        Đến phần tìm đường
      </a>
      <header className="header">
        <a className="brand" href="/" aria-label="HanoiTrip trang chủ">
          <span className="brand-mark">
            H<span />
          </span>
          <span>
            Hanoi<span className="brand-light">Trip</span>
          </span>
        </a>
        <div className="header-center">
          <MapPin size={15} /> Hà Nội <span className="header-divider" /> Giao thông công cộng
        </div>
        <button className="about-button" onClick={() => setAbout(true)}>
          <Info size={17} />
          <span>Về HanoiTrip</span>
        </button>
      </header>
      <main className="workspace">
        <section className="planner" id="planner" aria-label="Lập hành trình">
          <nav className="tabs" aria-label="Chức năng">
            <button
              className={tab === 'planner' ? 'active' : ''}
              onClick={() => setTab('planner')}
              aria-current={tab === 'planner' ? 'page' : undefined}
            >
              <Route size={18} /> Tìm đường
            </button>
            <button
              className={tab === 'saved' ? 'active' : ''}
              onClick={() => void loadFavorites()}
              aria-current={tab === 'saved' ? 'page' : undefined}
            >
              <Bookmark size={17} /> Đã lưu
            </button>
          </nav>
          <div className="panel-scroll">
            {tab === 'planner' ? (
              <>
                <div className="search-section">
                  <div className="intro">
                    <h1>Hôm nay, mình đi đâu?</h1>
                    <p>Một hành trình nhỏ, thêm một góc Hà Nội.</p>
                  </div>
                  <form onSubmit={(event) => void search(event)}>
                    <div className="locations">
                      <PlaceInput
                        label="Điểm đi"
                        value={origin}
                        kind="origin"
                        onChange={(point) => changePoint('origin', point)}
                      />
                      <div className="location-divider" />
                      <PlaceInput
                        label="Điểm đến"
                        value={destination}
                        kind="destination"
                        onChange={(point) => changePoint('destination', point)}
                      />
                      <button
                        className="swap-button"
                        type="button"
                        aria-label="Đảo điểm đi và điểm đến"
                        onClick={() => {
                          clearResults();
                          setOrigin(destination);
                          setDestination(origin);
                        }}
                      >
                        <ArrowDownUp size={17} />
                      </button>
                    </div>
                    <div className="search-options">
                      <BusFront size={17} />
                      <span>Xe buýt &amp; tàu điện</span>
                      <span className="options-spacer" />
                      <Clock3 size={15} />
                      <label className="sr-only" htmlFor="departure">
                        Thời điểm đi
                      </label>
                      <select
                        id="departure"
                        value={departure}
                        onChange={(event) => {
                          clearResults();
                          setDeparture(event.target.value);
                        }}
                      >
                        <option value="now">Đi ngay</option>
                        <option value="scheduled">Chọn giờ</option>
                      </select>
                    </div>
                    {departure === 'scheduled' && (
                      <label className="schedule-field">
                        Ngày và giờ khởi hành
                        <input
                          aria-label="Ngày và giờ khởi hành"
                          type="datetime-local"
                          required
                          value={scheduled}
                          onChange={(event) => {
                            clearResults();
                            setScheduled(event.target.value);
                          }}
                        />
                      </label>
                    )}
                    <button className="search-button" type="submit" disabled={loading || !config}>
                      {loading ? <LoaderCircle size={19} className="spin" /> : <Route size={19} />}
                      <span>{loading ? 'Đang tìm hành trình…' : 'Tìm hành trình'}</span>
                      {!loading && <ArrowRight size={19} />}
                    </button>
                  </form>
                  {configError && (
                    <p role="alert" className="inline-error">
                      Chưa tải được cấu hình.{' '}
                      <button onClick={() => window.location.reload()}>Tải lại trang</button>
                    </p>
                  )}
                  {config?.routesMode === 'demo' && (
                    <p className="demo-notice">
                      <span />
                      Chế độ trải nghiệm · Dữ liệu minh họa
                    </p>
                  )}
                </div>
                <div className="results-section" aria-live="polite" aria-busy={loading}>
                  {error ? (
                    <div className="error-state" role="alert">
                      <Info size={23} />
                      <h2>Chưa tìm được hành trình</h2>
                      <p>{error}</p>
                      <button onClick={() => void search()}>Thử lại</button>
                    </div>
                  ) : loading ? (
                    <div className="loading-state">
                      <div className="skeleton" />
                      <div className="skeleton" />
                      <p>Đang kết nối các chặng đi của bạn…</p>
                    </div>
                  ) : response ? (
                    <>
                      <div className="results-heading">
                        <h2>{response.routes.length} phương án</h2>
                        <span>Cập nhật {time(response.generatedAt)}</span>
                      </div>
                      {response.routes.length ? (
                        response.routes.map((item, index) => (
                          <JourneyCard
                            key={item.id}
                            route={item}
                            index={index}
                            selected={index === selected}
                            expanded={expanded === item.id}
                            onSelect={() => setSelected(index)}
                            onToggle={() => {
                              setSelected(index);
                              setExpanded(expanded === item.id ? undefined : item.id);
                            }}
                            onSave={() => void save()}
                            saving={saving}
                          />
                        ))
                      ) : (
                        <div className="empty-state">
                          <Compass size={32} />
                          <h2>Chưa có tuyến phù hợp</h2>
                          <p>
                            Thử đổi điểm đi, điểm đến hoặc thời gian. Nguồn dữ liệu có thể chưa hỗ
                            trợ hành trình này.
                          </p>
                        </div>
                      )}
                      <p className="source-note">
                        {response.source === 'google'
                          ? 'Kết quả từ Google Maps. Lịch trình có thể thay đổi.'
                          : 'Tuyến và thời gian chỉ để trải nghiệm giao diện, không phải lịch vận hành thực tế.'}
                      </p>
                    </>
                  ) : (
                    <div className="start-state">
                      <div className="start-illustration">
                        <MapPin size={24} />
                        <span />
                        <BusFront size={29} />
                        <span />
                        <MapPin size={24} />
                      </div>
                      <h2>Hà Nội gần hơn qua từng chặng</h2>
                      <p>
                        Chọn hai địa điểm để xem các tuyến, thời gian đi và điểm chuyển phương tiện.
                      </p>
                      <button
                        className="suggestion"
                        onClick={() => {
                          clearResults();
                          setOrigin(toPoint(places[3]));
                          setDestination(toPoint(places[1]));
                        }}
                      >
                        <span>
                          <small>Thử một hành trình</small>Ga Cát Linh → Văn Miếu
                        </span>
                        <ArrowRight size={18} />
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="saved-section">
                <h1>Hành trình đã lưu</h1>
                <p className="saved-description">
                  Lưu điểm đi và điểm đến; tìm lại để nhận lịch trình mới.
                </p>
                <p className="sandbox-note">
                  Danh sách dùng chung trong sandbox.{' '}
                  {config?.storage === 'memory'
                    ? 'Bản thử lưu tạm; khởi động lại sẽ mất.'
                    : 'Không nhập thông tin cá nhân.'}
                </p>
                {favoritesLoading ? (
                  <p role="status">Đang tải…</p>
                ) : favoritesError ? (
                  <div role="alert" className="error-state">
                    <p>{favoritesError}</p>
                    <button onClick={() => void loadFavorites()}>Thử lại</button>
                  </div>
                ) : favorites.length ? (
                  favorites.map((item) => (
                    <button
                      className="saved-item"
                      key={item.id}
                      onClick={() => {
                        clearResults();
                        setOrigin(item.origin);
                        setDestination(item.destination);
                        setTab('planner');
                      }}
                    >
                      <Bookmark size={20} />
                      <span>
                        <strong>{item.origin.label}</strong>
                        <small>đến {item.destination.label}</small>
                      </span>
                      <ArrowRight size={17} />
                    </button>
                  ))
                ) : (
                  <div className="empty-state">
                    <Bookmark size={32} />
                    <h2>Chưa có hành trình nào</h2>
                    <p>Tìm đường rồi nhấn Lưu để lần sau chọn nhanh hơn.</p>
                    <button onClick={() => setTab('planner')}>Tìm hành trình</button>
                  </div>
                )}
                {favorites.length === 100 && <p>Đang hiển thị 100 hành trình gần nhất.</p>}
              </div>
            )}
          </div>
          <footer className="panel-footer">
            <span className="footer-dot" />
            Đi cùng nhịp Hà Nội<span>HanoiTrip</span>
          </footer>
        </section>
        <section className="map-section" aria-label="Bản đồ hành trình">
          {!config || config.routesMode === 'demo' ? (
            <Suspense fallback={<p className="map-loading">Đang tải bản đồ Hà Nội…</p>}>
              <OpenMap
                route={route}
                origin={origin}
                destination={destination}
                pickTarget={pickTarget}
                onPick={pickOnMap}
              />
            </Suspense>
          ) : (
            <Suspense fallback={<p className="map-loading">Đang tải bản đồ…</p>}>
              <GoogleMap
                apiKey={config.mapsBrowserKey}
                route={route}
                origin={origin}
                destination={destination}
                onPick={pickOnMap}
              />
            </Suspense>
          )}
          <div className="map-location">
            <span className="location-icon">
              <Compass size={21} />
            </span>
            <div>
              <strong>Hà Nội</strong>
              <span>
                {config?.routesMode === 'google' ? 'Bản đồ Google' : 'OpenFreeMap · Bản đồ Hà Nội'}
              </span>
            </div>
          </div>
          <div className="map-pick">
            <span>Chọn trên bản đồ</span>
            <div role="group" aria-label="Loại điểm cần chọn">
              <button
                className={pickTarget === 'origin' ? 'active' : ''}
                aria-pressed={pickTarget === 'origin'}
                onClick={() => setPickTarget('origin')}
              >
                Điểm đi
              </button>
              <button
                className={pickTarget === 'destination' ? 'active' : ''}
                aria-pressed={pickTarget === 'destination'}
                onClick={() => setPickTarget('destination')}
              >
                Điểm đến
              </button>
            </div>
          </div>
          {submitted && route && (
            <div className="map-trip-label">
              <span className="route-color" />
              <div>
                <strong>{submitted.origin.label}</strong>
                <span>đến {submitted.destination.label}</span>
              </div>
              <span className="map-trip-time">
                {Math.ceil(route.durationSeconds / 60)}
                <small>phút</small>
              </span>
            </div>
          )}
        </section>
      </main>
      {notice && (
        <div role="status" className="toast">
          <Check size={18} />
          <span>{notice}</span>
          <button onClick={() => setNotice('')} aria-label="Đóng thông báo">
            <X size={16} />
          </button>
        </div>
      )}
      <dialog ref={dialog} className="about-dialog" onClose={() => setAbout(false)}>
        <button
          className="dialog-close"
          onClick={() => setAbout(false)}
          aria-label="Đóng giới thiệu"
        >
          <X size={20} />
        </button>
        <h2>Đi cùng HanoiTrip</h2>
        <p>
          Web app thực tập lập hành trình giao thông công cộng trong Hà Nội, lấy cảm hứng từ sự gọn
          gàng của Opal.
        </p>
        <p>
          Chế độ Google dùng Google Routes và Google Maps. Chế độ trải nghiệm dùng bản đồ thật từ
          OpenFreeMap/OpenStreetMap, nhưng tuyến và thời gian là dữ liệu minh họa, không dùng để di
          chuyển thực tế.
        </p>
        <p>
          V1 hỗ trợ một số địa danh gợi ý và tọa độ trong khu vực Hà Nội; danh sách đã lưu dùng
          chung cho sandbox.
        </p>
        <button className="search-button" onClick={() => setAbout(false)}>
          Bắt đầu khám phá
        </button>
      </dialog>
    </div>
  );
}
