# UI direction

Trip planning is the entire home screen, not a marketing landing page. Opal's compact journey panel and large map are the reference; branding, spacing and illustration are original.

- Palette: lake green `#123f39`, transit blue `#176fbd`, water `#9ccbd4`, paper white `#ffffff`, map ground `#e4e9e1`, text `#183a37`. A small lime `#cceba0` origin accent belongs to the route, not decorative gradients.
- Typeface: self-hosted Be Vietnam Pro (Vietnamese diacritics), regular/medium/semibold/bold. Left-aligned labels; tabular timing numbers. No external font request.
- Desktop: 68px header; 468px journey panel plus flexible map; results scroll inside the panel. Search and route steps stay in place, no page navigation.
- Mobile: compact header, map above scrollable journey sheet. All controls remain keyboard-operable; no hidden desktop-only task.
- Identity: a two-stop H route mark and quiet lake palette. The map is the large visual anchor. No unrelated hero, stats cards or decorative dashboard.
- Demo: real Hanoi vector cartography from OpenFreeMap/OpenStreetMap, rendered with MapLibre and the Positron style. Pan is bounded to the existing Hanoi service area, with pointer/touch/keyboard navigation, zoom, A/B markers and endpoint selection. Map attribution stays visible, including on mobile. Routes and schedules remain fictional: dashed lines with an explicit demo label. Google mode renders provider polylines only on Google Maps.
- Map loading and retry: keep the planner usable while tiles load; show an explicit retry action if tiles or WebGL fail. Resize the canvas with its container, and destroy the map/workers on unmount. The map bundle is lazy-loaded separately from the planner.
- States: initial guidance, searching, route alternatives, expanded steps, no transit routes, provider/network error, save feedback and shared-sandbox favorites. Changing endpoints clears obsolete results.
- Initial v1 address input: a curated Hanoi landmark list, or explicit latitude/longitude pasted into the field. Live map clicks can select arbitrary points inside the service area. No private geocoding APIs.

Review against brief: favor a useful map-first planner over a generic landing page. Route cards differ only in real journey data; no custom 'best' sorting or artificial recommendation badges.
