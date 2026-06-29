"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet marker icons in Next.js
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapProps {
  sites: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    status?: string;
  }[];
  height?: string;
}

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
}

export default function LiveMapClient({ sites, height = "400px" }: MapProps) {
  const defaultCenter: [number, number] = [48.8566, 2.3522]; // Paris default
  const [center, setCenter] = useState<[number, number]>(defaultCenter);

  useEffect(() => {
    if (sites.length > 0) {
      setCenter([sites[0].latitude, sites[0].longitude]);
    }
  }, [sites]);

  return (
    <div className="w-full rounded-[2rem] overflow-hidden border shadow-sm ring-1 ring-black/5" style={{ height }}>
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {sites.map((site) => (
          <Marker key={site.id} position={[site.latitude, site.longitude]}>
            <Popup>
              <div className="p-1">
                <h3 className="font-bold text-sm">{site.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Status: <span className="capitalize">{site.status || "active"}</span>
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
        {sites.length > 0 && <ChangeView center={center} />}
      </MapContainer>
    </div>
  );
}
