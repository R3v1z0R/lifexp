// Dynamic Expo config layered on top of the static app.json. Its only job is to
// inject secrets from the environment so they never live in version control.
// The Google Maps Android key is read from GOOGLE_MAPS_ANDROID_API_KEY (e.g. an EAS
// secret or a local .env); without it, maps simply don't render at runtime — bundling
// and `expo export` still work, since the key only matters on a device.
module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  if (mapsKey) {
    config.android = config.android ?? {};
    config.android.config = config.android.config ?? {};
    config.android.config.googleMaps = { apiKey: mapsKey };
  }
  return config;
};
