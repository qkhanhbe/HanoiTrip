import { ArrowRight, Bookmark, BusFront, ChevronDown, Footprints, TrainFront } from 'lucide-react';
import type { Mode, TripRoute } from '../shared/contracts';
export const time = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
export const meters = (value: number) =>
  value >= 1000
    ? `${(value / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} km`
    : `${Math.round(value)} m`;
export function ModeIcon({ mode, size = 16 }: { mode: Mode; size?: number }) {
  return mode === 'WALK' ? (
    <Footprints size={size} />
  ) : mode === 'BUS' ? (
    <BusFront size={size} />
  ) : (
    <TrainFront size={size} />
  );
}
export function JourneyCard({
  route,
  index,
  selected,
  expanded,
  onSelect,
  onToggle,
  onSave,
  saving,
}: {
  route: TripRoute;
  index: number;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <article
      className={`journey-card ${selected ? 'selected' : ''}`}
      aria-label={`Phương án ${index + 1}`}
    >
      <button
        className="journey-summary"
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        aria-label={`Chọn phương án ${index + 1}, ${Math.ceil(route.durationSeconds / 60)} phút`}
      >
        <div className="journey-top">
          <span className="duration">
            <strong>{Math.ceil(route.durationSeconds / 60)}</strong> phút
          </span>
          <span className="journey-clock">
            {time(route.departureTime)} <ArrowRight size={13} /> {time(route.arrivalTime)}
          </span>
        </div>
        <div className="mode-chain">
          {route.steps.map((step, i) => (
            <span className="chain-piece" key={i}>
              <span className={`mode-badge ${step.mode.toLowerCase()}`}>
                <ModeIcon mode={step.mode} />
                {step.mode === 'WALK'
                  ? `${Math.ceil(step.durationSeconds / 60)}′`
                  : (step.line ?? 'Tàu')}
              </span>
              {i < route.steps.length - 1 && <span className="chain-separator">›</span>}
            </span>
          ))}
        </div>
        <div className="journey-meta">
          <span>
            {route.transfers ? `${route.transfers} lần chuyển tuyến` : 'Không chuyển tuyến'}
          </span>
          <span>Đi bộ {meters(route.walkingMeters)}</span>
        </div>
      </button>
      <div className="journey-actions">
        <button type="button" aria-expanded={expanded} onClick={onToggle}>
          Chi tiết hành trình <ChevronDown size={15} className={expanded ? 'rotate' : ''} />
        </button>
        <button
          type="button"
          className="save-route"
          disabled={saving}
          onClick={onSave}
          aria-label={`Lưu hành trình phương án ${index + 1}`}
        >
          <Bookmark size={16} />
          <span>{saving ? 'Đang lưu' : 'Lưu'}</span>
        </button>
      </div>
      {expanded && (
        <div className="journey-detail">
          <ol className="step-list">
            {route.steps.map((step, i) => (
              <li key={i}>
                <span className={`step-icon ${step.mode.toLowerCase()}`}>
                  <ModeIcon mode={step.mode} />
                </span>
                <div>
                  <strong>
                    {step.mode === 'WALK' ? 'Đi bộ' : (step.line ?? 'Phương tiện công cộng')}
                  </strong>
                  <span className="step-duration">{Math.ceil(step.durationSeconds / 60)} phút</span>
                  <p>{step.from && step.to ? `${step.from} → ${step.to}` : step.instruction}</p>
                  {step.stopCount !== undefined && <small>{step.stopCount} điểm dừng</small>}
                  {step.departureTime && <small>Khởi hành {time(step.departureTime)}</small>}
                </div>
              </li>
            ))}
          </ol>
          {route.warnings.map((warning) => (
            <p className="route-warning" key={warning}>
              {warning}
            </p>
          ))}
        </div>
      )}
    </article>
  );
}
