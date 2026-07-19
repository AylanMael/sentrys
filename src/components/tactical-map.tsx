"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type TacticalMapProps = {
  sites: any[];
  incidents: any[];
  activePatrols: any[];
};

type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  kind: "site" | "incident";
  priority?: string | null;
  title: string;
  detail?: string | null;
};

const siteIcon = L.divIcon({
  className: "sentrys-map-marker",
  html: '<span class="sentrys-marker sentrys-marker-site">S</span>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

const incidentIcon = L.divIcon({
  className: "sentrys-map-marker",
  html: '<span class="sentrys-marker sentrys-marker-incident">!</span>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const watchIcon = L.divIcon({
  className: "sentrys-map-marker",
  html: '<span class="sentrys-marker sentrys-marker-watch">!</span>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pointFromSite(site: any): MapPoint | null {
  const lat = toNumber(site.latitude ?? site.location?.latitude);
  const lng = toNumber(site.longitude ?? site.location?.longitude);
  if (lat === null || lng === null) return null;

  return {
    id: String(site.id),
    lat,
    lng,
    kind: "site",
    title: site.name || "Site opérationnel",
    detail: site.address || site.city || null,
  };
}

function pointFromIncident(incident: any): MapPoint | null {
  const lat = toNumber(
    incident.latitude ?? incident.reportedLat ?? incident.location?.latitude
  );
  const lng = toNumber(
    incident.longitude ?? incident.reportedLng ?? incident.location?.longitude
  );
  if (lat === null || lng === null) return null;

  return {
    id: String(incident.id),
    lat,
    lng,
    kind: "incident",
    priority: incident.priority,
    title: incident.type || "Incident terrain",
    detail: incident.description || null,
  };
}

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);

  return null;
}

export default function TacticalMap({
  sites,
  incidents,
  activePatrols,
}: TacticalMapProps) {
  const sitePoints = useMemo(
    () => sites.map(pointFromSite).filter(Boolean) as MapPoint[],
    [sites]
  );
  const incidentPoints = useMemo(
    () => incidents.map(pointFromIncident).filter(Boolean) as MapPoint[],
    [incidents]
  );
  const points = useMemo(
    () => [...sitePoints, ...incidentPoints],
    [incidentPoints, sitePoints]
  );
  const [center, setCenter] = useState<[number, number]>([48.8566, 2.3522]);

  useEffect(() => {
    const first = points[0];
    if (first) setCenter([first.lat, first.lng]);
  }, [points]);

  const criticalIncidentCount = incidentPoints.filter(
    (point) => point.priority === "high"
  ).length;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-inner">
      <div className="absolute left-3 top-3 z-[1000] rounded-2xl border border-white/80 bg-white/95 p-3 text-slate-900 shadow-lg backdrop-blur">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
          Carte opérationnelle
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs font-black">
          <div className="rounded-xl bg-blue-50 px-2 py-1 text-blue-700">
            {sitePoints.length} sites
          </div>
          <div className="rounded-xl bg-red-50 px-2 py-1 text-red-700">
            {criticalIncidentCount} critiques
          </div>
          <div className="rounded-xl bg-cyan-50 px-2 py-1 text-cyan-700">
            {activePatrols.length} rondes
          </div>
        </div>
      </div>

      <div className="absolute bottom-3 left-3 z-[1000] flex flex-wrap gap-2 rounded-2xl border border-white/80 bg-white/95 p-2 text-[11px] font-black text-slate-700 shadow-lg backdrop-blur">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
          Site
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
          Critique
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          A surveiller
        </span>
      </div>

      {points.length === 0 ? (
        <div className="flex h-full min-h-[420px] items-center justify-center p-6 text-center">
          <div className="max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-lg font-black text-slate-900">
              Aucune coordonnée exploitable
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              Ajoutez latitude et longitude sur les fiches sites ou incidents
              pour alimenter la carte terrain.
            </p>
          </div>
        </div>
      ) : (
        <MapContainer
          center={center}
          zoom={13}
          scrollWheelZoom
          className="h-full w-full bg-slate-100"
        >
          <ChangeView center={center} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {sitePoints.map((site) => (
            <div key={site.id}>
              <Marker position={[site.lat, site.lng]} icon={siteIcon}>
                <Popup>
                  <div className="min-w-44 p-1">
                    <p className="text-sm font-black text-slate-900">
                      {site.title}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {site.detail || "Adresse non renseignée"}
                    </p>
                  </div>
                </Popup>
              </Marker>
              <Circle
                center={[site.lat, site.lng]}
                radius={250}
                pathOptions={{
                  color: "#2563eb",
                  fillColor: "#3b82f6",
                  fillOpacity: 0.08,
                  weight: 2,
                }}
              />
            </div>
          ))}

          {incidentPoints.map((incident) => {
            const isCritical = incident.priority === "high";
            return (
              <div key={incident.id}>
                <Marker
                  position={[incident.lat, incident.lng]}
                  icon={isCritical ? incidentIcon : watchIcon}
                >
                  <Popup>
                    <div className="min-w-44 p-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-red-600">
                        {isCritical ? "Incident critique" : "Incident a surveiller"}
                      </p>
                      <p className="mt-1 text-sm font-black text-slate-900">
                        {incident.title}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {incident.detail || "Aucun detail renseigné"}
                      </p>
                    </div>
                  </Popup>
                </Marker>
                <Circle
                  center={[incident.lat, incident.lng]}
                  radius={isCritical ? 300 : 220}
                  pathOptions={{
                    color: isCritical ? "#dc2626" : "#d97706",
                    fillColor: isCritical ? "#ef4444" : "#f59e0b",
                    fillOpacity: isCritical ? 0.18 : 0.14,
                    weight: 3,
                  }}
                />
              </div>
            );
          })}
        </MapContainer>
      )}

      <style jsx global>{`
        .leaflet-container {
          font-family: inherit;
          background: #f8fafc !important;
        }
        .leaflet-control-attribution {
          font-size: 10px !important;
        }
        .leaflet-bar a {
          background-color: rgba(255, 255, 255, 0.96) !important;
          color: #0f172a !important;
          border-color: rgba(148, 163, 184, 0.45) !important;
        }
        .sentrys-map-marker {
          background: transparent;
          border: 0;
        }
        .sentrys-marker {
          display: inline-flex;
          height: 34px;
          width: 34px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 3px solid white;
          color: white;
          font-size: 13px;
          font-weight: 900;
          box-shadow: 0 10px 25px rgba(15, 23, 42, 0.25);
        }
        .sentrys-marker-site {
          background: #2563eb;
        }
        .sentrys-marker-incident {
          background: #dc2626;
          animation: sentrys-pulse 1.4s ease-in-out infinite;
        }
        .sentrys-marker-watch {
          background: #d97706;
        }
        @keyframes sentrys-pulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.12);
          }
        }
      `}</style>
    </div>
  );
}