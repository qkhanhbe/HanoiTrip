import { Bike, Bookmark, CarFront, ChevronDown } from 'lucide-react';
import type { RoadRoute } from '../shared/contracts';
import { meters } from './JourneyCard';

export function RoadRouteCard({
  route,
  index,
  selected,
  expanded,
  onSelect,
  onToggle,
  onSave,
  saving,
}: {
  route: RoadRoute;
  index: number;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const Icon = route.mode === 'car' ? CarFront : Bike;
  const modeLabel = route.mode === 'car' ? 'Ô tô' : 'Xe máy';
  return (
    <article
      className={`journey-card road-card ${selected ? 'selected' : ''}`}
      aria-label={`Phương án đường bộ ${index + 1}`}
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
          <span className="road-mode-badge">
            <Icon size={16} /> {modeLabel}
          </span>
        </div>
        <div className="road-summary-line">
          <span>{meters(route.distanceMeters)}</span>
          <span>{route.geometry.coordinates.length} điểm geometry</span>
        </div>
      </button>
      <div className="journey-actions">
        <button type="button" aria-expanded={expanded} onClick={onToggle}>
          Chỉ dẫn cơ bản <ChevronDown size={15} className={expanded ? 'rotate' : ''} />
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
          {route.steps.length ? (
            <ol className="step-list road-steps">
              {route.steps.map((step, stepIndex) => (
                <li key={`${stepIndex}-${step.streetName}`}>
                  <span className="step-icon road">
                    <Icon size={14} />
                  </span>
                  <div>
                    <strong>{step.streetName || modeLabel}</strong>
                    <span className="step-duration">
                      {Math.ceil(step.durationSeconds / 60)} phút
                    </span>
                    <p>{step.instruction}</p>
                    <small>{meters(step.distanceMeters)}</small>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="route-warning">Provider chưa trả chỉ dẫn từng chặng.</p>
          )}
        </div>
      )}
    </article>
  );
}
