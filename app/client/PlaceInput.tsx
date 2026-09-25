import { useEffect, useId, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import type { Point } from '../shared/contracts';
import { isSupportedPoint } from '../shared/geo';
import { normalizeText, places, toPoint } from '../shared/places';

export function PlaceInput({
  label,
  value,
  onChange,
  kind,
}: {
  label: string;
  value: Point | null;
  onChange: (value: Point | null) => void;
  kind: 'origin' | 'destination';
}) {
  const id = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (value) setQuery(null);
  }, [value]);
  const text = query ?? value?.label ?? '';
  const coordinateMatch = text.match(/^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$/);
  const coordinate = coordinateMatch
    ? {
        label: text.trim(),
        latitude: Number(coordinateMatch[1]),
        longitude: Number(coordinateMatch[2]),
      }
    : null;
  const options: Point[] =
    coordinate && isSupportedPoint(coordinate)
      ? [coordinate]
      : places
          .filter((place) => normalizeText(place.label).includes(normalizeText(query ?? '')))
          .slice(0, 6);
  const select = (point: Point) => {
    onChange(toPoint(point));
    setQuery(null);
    setOpen(false);
  };
  return (
    <div
      className={`place-input ${kind}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <span className="place-dot" aria-hidden="true" />
      <div className="place-field">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-activedescendant={
            open && options.length ? `${id}-${Math.min(active, options.length - 1)}` : undefined
          }
          value={text}
          placeholder="Địa danh hoặc vĩ độ, kinh độ"
          onFocus={() => {
            setOpen(true);
            setActive(0);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange(null);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActive((index) => Math.min(index + 1, options.length - 1));
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((index) => Math.max(0, index - 1));
            }
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'Enter' && open) {
              event.preventDefault();
              if (options[active]) select(options[active]);
            }
          }}
        />
      </div>
      {text && (
        <button
          type="button"
          className="clear-input"
          aria-label={`Xóa ${label.toLowerCase()}`}
          onClick={() => {
            setQuery('');
            onChange(null);
          }}
        >
          <X size={15} />
        </button>
      )}
      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label={`Gợi ý ${label.toLowerCase()}`}
          className="place-options"
        >
          {options.map((option, index) => (
            <li
              key={option.label}
              id={`${id}-${index}`}
              role="option"
              aria-selected={active === index}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(option)}
            >
              <MapPin size={16} />
              <span>
                {option.label}
                <small>
                  {'area' in option ? String(option.area) : 'Tọa độ trong khu vực hỗ trợ'}
                </small>
              </span>
            </li>
          ))}
          {!options.length && (
            <li className="no-option">
              Chưa có địa danh này. Nhập vĩ độ, kinh độ hoặc chọn trên bản đồ Google.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
