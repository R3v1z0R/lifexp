# GPS Tracker — Device Verification (requires EAS dev build)

Background GPS cannot run in Expo Go or a simulator. Build a dev client and test on a real phone outdoors.

## Prerequisites
- [ ] Google Maps Android API key set via the `GOOGLE_MAPS_ANDROID_API_KEY` env var (a local `.env` or an EAS secret); `app.config.js` injects it into the build — do not put it in `app.json`.
- [ ] `EXPO_PUBLIC_API_URL` points at a reachable API; API + Postgres running; user seeded.
- [ ] Dev build: `eas build --profile development --platform android` (and/or iOS), install on device.

## Checklist
- [ ] Launch app, log in. Track tab shows the four activities.
- [ ] Pick Running → Start tracking. Grant foreground, then "Allow always" (background).
- [ ] Android: a foreground-service notification "LifeXP is tracking your activity" appears.
- [ ] Walk ~200m. The map polyline grows; distance + moving time update.
- [ ] Lock the phone, walk further, unlock — distance kept accruing while locked.
- [ ] Pause → distance/time freeze; Resume → continues; moving time excludes the pause.
- [ ] Stop → Review shows a plausible distance (km) and pace; edit if needed.
- [ ] Save & earn XP → XP breakdown card renders; Home recent feed shows the new log.
- [ ] Track tab History lists the activity; tapping it opens the route + stats.
- [ ] Kill the app mid-session, relaunch, open Track → "Resume tracking?" prompt appears.
- [ ] Deny background permission once → clear explainer + Settings path; manual logging still works.
