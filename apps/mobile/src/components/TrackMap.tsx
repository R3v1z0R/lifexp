import type { JSX } from "react";
import { StyleSheet, View, Text } from "react-native";
import MapView, { Polyline, type Region } from "react-native-maps";
import { colors, fonts, radii } from "../theme";

export interface LatLng {
  lat: number;
  lng: number;
}

// Isolates the map library. If swapping to expo-maps, reimplement ONLY this file.
export function TrackMap({ points, height = 280 }: { points: LatLng[]; height?: number }): JSX.Element {
  if (points.length === 0) {
    return (
      <View style={[styles.placeholder, { height }]}>
        <Text style={styles.placeholderText}>Waiting for GPS…</Text>
      </View>
    );
  }
  const last = points[points.length - 1];
  const region: Region = {
    latitude: last.lat,
    longitude: last.lng,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };
  const coords = points.map((p) => ({ latitude: p.lat, longitude: p.lng }));
  return (
    <View style={[styles.wrap, { height }]}>
      <MapView style={StyleSheet.absoluteFill} region={region} showsUserLocation>
        <Polyline coordinates={coords} strokeColor={colors.arcane} strokeWidth={5} />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radii.lg, overflow: "hidden" },
  placeholder: {
    borderRadius: radii.lg,
    backgroundColor: colors.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: { color: colors.muted, fontFamily: fonts.body },
});
