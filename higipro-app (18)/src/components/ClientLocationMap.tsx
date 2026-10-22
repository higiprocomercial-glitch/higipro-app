/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Source: Google Maps Platform Code Assist

import React, { useState } from 'react';
import { 
  APIProvider, 
  Map, 
  AdvancedMarker, 
  Pin 
} from '@vis.gl/react-google-maps';
import { 
  MapPin, 
  ExternalLink, 
  Navigation, 
  Copy, 
  Check, 
  Compass, 
  Key 
} from 'lucide-react';
import { 
  getGoogleMapsApiKey, 
  getGoogleMapsSearchUrl, 
  getGoogleMapsDirectionsUrl, 
  GMP_ATTRIBUTION_ID, 
  DEMO_MAP_ID 
} from '../lib/maps';

interface ClientLocationMapProps {
  endereco: string;
  bairro?: string;
  regiao?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  lat?: number;
  lng?: number;
}

export const ClientLocationMap: React.FC<ClientLocationMapProps> = ({
  endereco,
  bairro,
  regiao,
  cidade = 'Passo Fundo',
  estado = 'RS',
  cep,
  lat,
  lng,
}) => {
  const apiKey = getGoogleMapsApiKey();
  const [copied, setCopied] = useState(false);

  const displayRegion = bairro || regiao;
  const fullAddressText = [
    endereco,
    displayRegion ? `Bairro ${displayRegion}` : '',
    `${cidade} - ${estado}`,
    cep ? `CEP ${cep}` : '',
  ].filter(Boolean).join(', ');

  const searchUrl = getGoogleMapsSearchUrl(endereco, cidade, estado);
  const directionsUrl = getGoogleMapsDirectionsUrl(endereco, cidade, estado);

  const handleCopy = () => {
    if (!endereco) return;
    navigator.clipboard.writeText(fullAddressText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasCoords = lat !== undefined && lng !== undefined;
  const mapCenter = hasCoords ? { lat, lng } : { lat: -28.2612, lng: -52.4083 };

  return (
    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl overflow-hidden">
      {/* Header Info */}
      <div className="p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Compass className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Localização & Região do Cliente
              </h4>
              <p className="text-[11px] text-slate-500">
                Atendimento presencial e rotas operacionais
              </p>
            </div>
          </div>

          {displayRegion && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-800 rounded-full border border-blue-200/60">
              <MapPin className="w-3 h-3 text-blue-600" />
              {displayRegion}
            </span>
          )}
        </div>

        {/* Address and Details */}
        <div className="bg-white p-3 rounded-xl border border-slate-100 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800 leading-snug">
              {endereco || 'Endereço não cadastrado'}
            </p>
            {endereco && (
              <button
                type="button"
                onClick={handleCopy}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition"
                title="Copiar endereço"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            {displayRegion && <span>Bairro {displayRegion}</span>}
            {displayRegion && <span>•</span>}
            <span>{cidade} - {estado}</span>
            {cep && (
              <>
                <span>•</span>
                <span>CEP: {cep}</span>
              </>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {endereco && (
          <div className="flex items-center gap-2 pt-1">
            <a
              href={searchUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition shadow-2xs cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              <span>Abrir no Google Maps</span>
            </a>
            <a
              href={directionsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition shadow-2xs cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5 text-amber-300" />
              <span>Traçar Rota</span>
            </a>
          </div>
        )}
      </div>

      {/* Interactive Google Map if coordinates or API key */}
      {apiKey && (
        <div className="border-t border-slate-200">
          <APIProvider apiKey={apiKey}>
            <div style={{ height: '180px', width: '100%' }}>
              <Map
                mapId={DEMO_MAP_ID}
                defaultCenter={mapCenter}
                defaultZoom={hasCoords ? 15 : 13}
                gestureHandling="cooperative"
                disableDefaultUI={false}
                internalUsageAttributionIds={[GMP_ATTRIBUTION_ID]}
              >
                {hasCoords && (
                  <AdvancedMarker position={mapCenter}>
                    <Pin background="#0b2447" borderColor="#f59e0b" glyphColor="#ffffff" />
                  </AdvancedMarker>
                )}
              </Map>
            </div>
          </APIProvider>
        </div>
      )}
    </div>
  );
};
