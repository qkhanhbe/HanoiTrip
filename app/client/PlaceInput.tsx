import { useEffect, useId, useState } from 'react';
import { LoaderCircle, MapPin, X } from 'lucide-react';
import type {
  PlaceResponse,
  PlaceSearchResponse,
  PlaceSuggestion,
  Point,
} from '../shared/contracts';
import { isSupportedPoint } from '../shared/geo';
import { normalizeText, places, toPoint } from '../shared/places';
import { api } from './api';

export function PlaceInput({
  label,
  value,
  onChange,
  kind,
  remoteSearch = false,
}: {
  label: string;
  value: Point | null;
  onChange: (value: Point | null) => void;
  kind: 'origin' | 'destination';
  remoteSearch?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
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
  const localOptions: Point[] =
    coordinate && isSupportedPoint(coordinate)
      ? [coordinate]
      : places
          .filter((place) => normalizeText(place.label).includes(normalizeText(query ?? '')))
          .slice(0, 6);
  const useRemote = remoteSearch && query !== null && query.trim().length >= 2 && !coordinate;
  const options: (Point | PlaceSuggestion)[] = useRemote ? suggestions : localOptions;
  useEffect(() => {
    if (!useRemote) {
      setSuggestions([]);
      setSearching(false);
      setSearchError('');
      return;
    }
    const abort = new AbortController();
    setSearching(true);
    setSearchError('');
    const timer = window.setTimeout(() => {
      void api<PlaceSearchResponse>(`/v1/search?q=${encodeURIComponent(query!.trim())}`, {
        signal: abort.signal,
      })
        .then((response) => {
          setSuggestions(response.suggestions);
          setActive(0);
        })
        .catch((error) => {
          if (error.name !== 'AbortError') {
            setSuggestions([]);
            setSearchError('Chưa tải được gợi ý thật. Bạn vẫn có thể chọn trên bản đồ.');
          }
        })
        .finally(() => {
          if (!abort.signal.aborted) setSearching(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [query, useRemote]);
  const selectPoint = (point: Point) => {
    onChange(toPoint(point));
    setQuery(null);
    setOpen(false);
  };
  const select = async (option: Point | PlaceSuggestion) => {
    if ('latitude' in option) {
      selectPoint(option);
      return;
    }
    setSearching(true);
    setSearchError('');
    try {
      const result = await api<PlaceResponse>('/v1/places/resolve', {
        method: 'POST',
        body: JSON.stringify({ token: option.token }),
      });
      selectPoint(result.place);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Chưa lấy được tọa độ địa điểm.');
    } finally {
      setSearching(false);
    }
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
              if (options[active]) void select(options[active]);
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
              key={'token' in option ? option.token : option.label}
              id={`${id}-${index}`}
              role="option"
              aria-selected={active === index}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void select(option)}
            >
              <MapPin size={16} />
              <span>
                {option.label}
                <small>
                  {'token' in option
                    ? option.address ||
                      (option.distanceMeters === undefined
                        ? 'Kết quả từ VIETMAP'
                        : `Cách tâm tìm kiếm ${Math.round(option.distanceMeters)} m`)
                    : 'area' in option
                      ? String(option.area)
                      : 'Tọa độ trong khu vực hỗ trợ'}
                </small>
              </span>
            </li>
          ))}
          {searching && (
            <li className="no-option place-loading" role="status">
              <LoaderCircle size={15} className="spin" /> Đang tìm địa điểm thật…
            </li>
          )}
          {searchError && (
            <li className="no-option" role="alert">
              {searchError}
            </li>
          )}
          {!searching && !searchError && !options.length && (
            <li className="no-option">
              Chưa có địa danh phù hợp. Nhập vĩ độ, kinh độ hoặc chọn trên bản đồ.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
