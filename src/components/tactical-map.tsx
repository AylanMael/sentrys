"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix for default marker icons in Next.js
const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

interface TacticalMapProps {
  sites: any[];
  incidents: any[];
  activePatrols: any[];
}

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}

export default function TacticalMap({ sites, incidents, activePatrols }: TacticalMapProps) {
  const [center, setCenter] = useState<[number, number]>([48.8566, 2.3522]); // Paris default

  useEffect(() => {
    const firstSite = sites.find(s => s.latitude || s.location?.latitude);
    if (firstSite) {
      const lat = firstSite.latitude || firstSite.location?.latitude;
      const lng = firstSite.longitude || firstSite.location?.longitude;
      if (lat && lng) setCenter([lat, lng]);
    }
  }, [sites]);

  return (
    <div className="h-full w-full rounded-xl overflow-hidden border border-white/10 shadow-2xl relative">
      {/* Overlay tactile effect */}
      <div className="absolute inset-0 pointer-events-none z-[1000] border-[20px] border-black/20 mix-blend-overlay"></div>

      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={true}
        className="h-full w-full bg-[#0a0a1a]"
      >
        <ChangeView center={center} />

        {/* Dark Mode Map Layer using CSS filters */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="map-tiles-dark"
        />

        {/* Site Markers with Geofencing visual */}
        {sites.map((site) => {
          const lat = site.latitude || site.location?.latitude;
          const lng = site.longitude || site.location?.longitude;
          if (!lat || !lng) return null;

          return (
            <div key={site.id}>
              <Marker position={[lat, lng]} icon={icon}>
                <Popup>
                  <div className="p-2">
                    <h3 className="font-bold text-blue-600">{site.name}</h3>
                    <p className="text-xs text-gray-500">{site.address}</p>
                  </div>
                </Popup>
              </Marker>
              <Circle
                center={[lat, lng]}
                radius={500}
                pathOptions={{
                  color: '#3b82f6',
                  fillColor: '#3b82f6',
                  fillOpacity: 0.1,
                  dashArray: '5, 10'
                }}
              />
            </div>
          );
        })}

        {/* Incident Pulses */}
        {incidents.map((incident) => {
          const lat = incident.latitude || incident.reportedLat || incident.location?.latitude;
          const lng = incident.longitude || incident.reportedLng || incident.location?.longitude;
          if (!lat || !lng) return null;

          return (
            <Circle
              key={incident.id}
              center={[lat, lng]}
              radius={200}
              pathOptions={{
                color: incident.priority === 'high' ? '#ef4444' : '#f59e0b',
                fillColor: incident.priority === 'high' ? '#ef4444' : '#f59e0b',
                fillOpacity: 0.4,
                weight: 2
              }}
            >
              <Popup>
                <div className="p-2">
                  <span className="text-xs font-bold uppercase text-red-500">Alerte : {incident.type}</span>
                  <p className="text-sm">{incident.description}</p>
                </div>
              </Popup>
            </Circle>
          );
        })}
      </MapContainer>

      <style jsx global>{`
        .map-tiles-dark {
          filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%);
        }
        .leaflet-container {
          background: #020617 !important;
        }
        .leaflet-bar a {
          background-color: rgba(15, 23, 42, 0.8) !important;
          color: white !important;
          border-color: rgba(255, 255, 255, 0.1) !important;
        }
      `}</style>
    </div>
  );
}
