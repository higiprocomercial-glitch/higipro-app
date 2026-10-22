/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Source: Google Maps Platform Code Assist

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  APIProvider, 
  Map, 
  AdvancedMarker, 
  Pin,
  useMapsLibrary, 
  useMap 
} from '@vis.gl/react-google-maps';
import { 
  MapPin, 
  Search, 
  ExternalLink, 
  Navigation, 
  Key, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Compass,
  X
} from 'lucide-react';
import { 
  getGoogleMapsApiKey, 
  setGoogleMapsApiKey, 
  extractAddressInfoFromPlace, 
  parseBrazilianAddressFallback,
  getGoogleMapsSearchUrl,
  getGoogleMapsDirectionsUrl,
  GMP_ATTRIBUTION_ID,
  DEMO_MAP_ID,
  ExtractedLocationInfo
} from '../lib/maps';

interface GoogleMapsAddressInputProps {
  initialAddress: string;
  initialBairro?: string;
  initialCidade?: string;
  initialEstado?: string;
  initialCep?: string;
  initialLat?: number;
  initialLng?: number;
  onLocationChange: (info: {
    endereco: string;
    bairro: string;
    regiao: string;
    cidade: string;
    estado: string;
    cep: string;
    lat?: number;
    lng?: number;
  }) => void;
}

// Inner autocomplete control when inside APIProvider
const AutocompleteSearchInput: React.FC<{
  value: string;
  onChange: (val: string) => void;
  onSelectPlace: (place: google.maps.places.Place) => void;
  placeholder?: string;
}> = ({ value, onChange, onSelectPlace, placeholder }) => {
  const placesLib = useMapsLibrary('places');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch suggestions with session token
  useEffect(() => {
    if (!placesLib || !value || value.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    const timer = setTimeout(() => {
      setIsLoading(true);
      AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: value,
        sessionToken: sessionTokenRef.current,
        includedRegionCodes: ['br'],
      })
        .then((res: { suggestions?: google.maps.places.AutocompleteSuggestion[] }) => {
          setSuggestions(res.suggestions || []);
          setIsOpen(true);
          setIsLoading(false);
        })
        .catch((err: unknown) => {
          console.error('Erro ao buscar sugestões do Google Maps:', err);
          setIsLoading(false);
        });
    }, 200);

    return () => clearTimeout(timer);
  }, [placesLib, value]);

  const handleSelect = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    if (!placesLib || !suggestion.placePrediction) return;
    try {
      setIsLoading(true);
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location', 'addressComponents']
      });
      onSelectPlace(place);
      // Reset session token after selection
      sessionTokenRef.current = null;
      setSuggestions([]);
      setIsOpen(false);
    } catch (err) {
      console.error('Erro ao buscar detalhes do local:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder || "Digite rua, número, bairro ou pesquise pelo Google Maps..."}
          className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
        />
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        {isLoading && (
          <Loader2 className="w-4 h-4 text-blue-600 animate-spin absolute right-2.5 top-2.5" />
        )}
        {!isLoading && value && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setSuggestions([]);
              setIsOpen(false);
            }}
            className="text-slate-400 hover:text-slate-600 absolute right-2.5 top-2.5"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100 text-xs">
          {suggestions.map((sug, idx) => (
            <li
              key={idx}
              onClick={() => handleSelect(sug)}
              className="p-2.5 hover:bg-blue-50/70 cursor-pointer flex items-start gap-2.5 transition"
            >
              <MapPin className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 truncate">
                  {sug.placePrediction?.mainText?.toString() || sug.placePrediction?.text?.toString()}
                </p>
                {sug.placePrediction?.secondaryText && (
                  <p className="text-[11px] text-slate-500 truncate">
                    {sug.placePrediction.secondaryText.toString()}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// Map controller to adjust center dynamically
const MapPanTo: React.FC<{ center: { lat: number; lng: number } }> = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (map && center) {
      map.panTo(center);
      map.setZoom(15);
    }
  }, [map, center]);
  return null;
};

export const GoogleMapsAddressInput: React.FC<GoogleMapsAddressInputProps> = ({
  initialAddress,
  initialBairro,
  initialCidade,
  initialEstado,
  initialCep,
  initialLat,
  initialLng,
  onLocationChange,
}) => {
  const [apiKey, setApiKey] = useState<string>(getGoogleMapsApiKey());
  const [isSettingKey, setIsSettingKey] = useState(false);
  const [tempKey, setTempKey] = useState('');

  const [address, setAddress] = useState(initialAddress || '');
  const [bairro, setBairro] = useState(initialBairro || '');
  const [cidade, setCidade] = useState(initialCidade || 'Passo Fundo');
  const [estado, setEstado] = useState(initialEstado || 'RS');
  const [cep, setCep] = useState(initialCep || '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null
  );

  // Default coordinate center (Passo Fundo, RS, or user coordinates)
  const defaultCenter = coords || { lat: -28.2612, lng: -52.4083 };

  // Sync with initial props if they change
  useEffect(() => {
    if (initialAddress !== undefined) setAddress(initialAddress);
    if (initialBairro !== undefined) setBairro(initialBairro);
    if (initialCidade !== undefined) setCidade(initialCidade);
    if (initialEstado !== undefined) setEstado(initialEstado);
    if (initialCep !== undefined) setCep(initialCep);
    if (initialLat && initialLng) {
      setCoords({ lat: initialLat, lng: initialLng });
    }
  }, [initialAddress, initialBairro, initialCidade, initialEstado, initialCep, initialLat, initialLng]);

  // Handle place selected from Google Autocomplete
  const handlePlaceSelect = (place: google.maps.places.Place) => {
    const info = extractAddressInfoFromPlace(place);
    setAddress(info.endereco);
    setBairro(info.bairro);
    setCidade(info.cidade);
    setEstado(info.estado);
    setCep(info.cep);
    if (info.lat && info.lng) {
      setCoords({ lat: info.lat, lng: info.lng });
    }

    onLocationChange({
      endereco: info.endereco,
      bairro: info.bairro,
      regiao: info.bairro,
      cidade: info.cidade,
      estado: info.estado,
      cep: info.cep,
      lat: info.lat,
      lng: info.lng,
    });
  };

  // Handle manual address text editing
  const handleManualAddressChange = (newAddress: string) => {
    setAddress(newAddress);
    // Parse fallback if no Google Maps API or for instant local feedback
    const parsed = parseBrazilianAddressFallback(newAddress, cidade, estado);
    const newBairro = parsed.bairro || bairro;
    const newCidade = parsed.cidade || cidade;
    const newEstado = parsed.estado || estado;
    const newCep = parsed.cep || cep;

    if (parsed.bairro) setBairro(parsed.bairro);
    if (parsed.cidade) setCidade(parsed.cidade);
    if (parsed.estado) setEstado(parsed.estado);
    if (parsed.cep) setCep(parsed.cep);

    onLocationChange({
      endereco: newAddress,
      bairro: newBairro,
      regiao: newBairro,
      cidade: newCidade,
      estado: newEstado,
      cep: newCep,
      lat: coords?.lat,
      lng: coords?.lng,
    });
  };

  // Save manual API key
  const handleSaveApiKey = () => {
    setGoogleMapsApiKey(tempKey);
    setApiKey(tempKey.trim());
    setIsSettingKey(false);
  };

  const hasApiKey = Boolean(apiKey && apiKey.trim());
  const mapsSearchUrl = getGoogleMapsSearchUrl(address, cidade, estado);
  const mapsDirectionsUrl = getGoogleMapsDirectionsUrl(address, cidade, estado);

  return (
    <div className="space-y-3 bg-slate-50/60 border border-slate-200/80 p-3.5 rounded-2xl">
      {/* Header & API Key Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Endereço & Localização (Google Maps)
            </h4>
            <p className="text-[11px] text-slate-500">
              Identificação automática da localidade, bairro e região do cliente
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setTempKey(apiKey);
            setIsSettingKey(!isSettingKey);
          }}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-blue-700 bg-white border border-slate-200 px-2 py-1 rounded-lg transition"
          title="Configurar Chave Google Maps"
        >
          <Key className="w-3 h-3 text-amber-500" />
          <span>{hasApiKey ? 'Chave Ativa' : 'Configurar Chave'}</span>
        </button>
      </div>

      {/* API Key configuration prompt */}
      {isSettingKey && (
        <div className="p-3 bg-white border border-amber-200 rounded-xl space-y-2 text-xs">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-slate-800">
                Chave da API do Google Maps (ou Chave Demo)
              </p>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                Para busca com preenchimento automático e mapa interativo integrado, insira sua chave. Você pode gerar uma Chave Demo gratuita (sem necessidade de cartão de crédito) em:
              </p>
              <a
                href="https://mapsplatform.google.com/maps-demo-key?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline font-semibold"
              >
                mapsplatform.google.com/maps-demo-key
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
              placeholder="Cole sua chave AIzaSy..."
              className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono"
            />
            <button
              type="button"
              onClick={handleSaveApiKey}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-xs"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setIsSettingKey(false)}
              className="px-2 py-1.5 text-slate-500 hover:bg-slate-100 rounded-lg text-xs"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Autocomplete or Manual Input */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">
          Endereço de Atendimento / Pesquisa no Google Maps *
        </label>
        {hasApiKey ? (
          <APIProvider apiKey={apiKey}>
            <AutocompleteSearchInput
              value={address}
              onChange={handleManualAddressChange}
              onSelectPlace={handlePlaceSelect}
              placeholder="Digite rua, número ou busque no Google Maps..."
            />
          </APIProvider>
        ) : (
          <div className="relative">
            <input
              type="text"
              value={address}
              onChange={(e) => handleManualAddressChange(e.target.value)}
              placeholder="Ex: Rua Morom, 1234 - Centro, Passo Fundo - RS"
              className="w-full pl-9 pr-3.5 py-2 text-sm border border-slate-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
            />
            <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>
        )}
      </div>

      {/* Region & Locality Highlight Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="bg-white border border-slate-200/80 p-2.5 rounded-xl">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">
            Bairro / Região
          </span>
          <input
            type="text"
            value={bairro}
            onChange={(e) => {
              setBairro(e.target.value);
              onLocationChange({
                endereco: address,
                bairro: e.target.value,
                regiao: e.target.value,
                cidade,
                estado,
                cep,
                lat: coords?.lat,
                lng: coords?.lng,
              });
            }}
            placeholder="Ex: Centro / Vila Rodrigues"
            className="w-full mt-0.5 text-xs font-semibold text-slate-800 bg-transparent focus:outline-none border-b border-transparent focus:border-blue-600"
          />
        </div>

        <div className="bg-white border border-slate-200/80 p-2.5 rounded-xl">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
            Cidade / Estado
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <input
              type="text"
              value={cidade}
              onChange={(e) => {
                setCidade(e.target.value);
                onLocationChange({
                  endereco: address,
                  bairro,
                  regiao: bairro,
                  cidade: e.target.value,
                  estado,
                  cep,
                  lat: coords?.lat,
                  lng: coords?.lng,
                });
              }}
              placeholder="Passo Fundo"
              className="w-full text-xs font-semibold text-slate-800 bg-transparent focus:outline-none border-b border-transparent focus:border-blue-600"
            />
            <span className="text-slate-400 text-xs">-</span>
            <input
              type="text"
              value={estado}
              maxLength={2}
              onChange={(e) => {
                setEstado(e.target.value.toUpperCase());
                onLocationChange({
                  endereco: address,
                  bairro,
                  regiao: bairro,
                  cidade,
                  estado: e.target.value.toUpperCase(),
                  cep,
                  lat: coords?.lat,
                  lng: coords?.lng,
                });
              }}
              className="w-8 text-xs font-bold text-slate-800 uppercase bg-transparent focus:outline-none text-center"
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 p-2.5 rounded-xl">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
            CEP
          </span>
          <input
            type="text"
            value={cep}
            onChange={(e) => {
              setCep(e.target.value);
              onLocationChange({
                endereco: address,
                bairro,
                regiao: bairro,
                cidade,
                estado,
                cep: e.target.value,
                lat: coords?.lat,
                lng: coords?.lng,
              });
            }}
            placeholder="00000-000"
            className="w-full mt-0.5 text-xs font-semibold text-slate-800 bg-transparent focus:outline-none border-b border-transparent focus:border-blue-600"
          />
        </div>
      </div>

      {/* Interactive Map Preview (when API key available and/or address entered) */}
      {hasApiKey ? (
        <APIProvider apiKey={apiKey}>
          <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-2xs">
            <div style={{ height: '220px', width: '100%' }}>
              <Map
                mapId={DEMO_MAP_ID}
                defaultCenter={defaultCenter}
                defaultZoom={coords ? 15 : 13}
                gestureHandling="cooperative"
                disableDefaultUI={false}
                internalUsageAttributionIds={[GMP_ATTRIBUTION_ID]}
              >
                {coords && (
                  <>
                    <MapPanTo center={coords} />
                    <AdvancedMarker position={coords}>
                      <Pin background="#1e40af" borderColor="#115e59" glyphColor="#ffffff" />
                    </AdvancedMarker>
                  </>
                )}
              </Map>
            </div>

            {/* Floating location indicator badge on map */}
            <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-xs px-2.5 py-1.5 rounded-lg border border-slate-200/80 text-[11px] shadow-xs flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              <span className="font-semibold text-slate-800">
                {bairro ? `Região: ${bairro}` : cidade}
              </span>
              {coords && (
                <span className="text-slate-400 font-mono text-[10px]">
                  ({coords.lat.toFixed(4)}, {coords.lng.toFixed(4)})
                </span>
              )}
            </div>
          </div>
        </APIProvider>
      ) : (
        /* Fallback map card when no key is set yet */
        <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">
                {bairro ? `Região / Bairro: ${bairro}` : 'Localidade de Atendimento'}
              </p>
              <p className="text-[11px] text-slate-500">
                {cidade} - {estado} {cep ? `• CEP: ${cep}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={mapsSearchUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-xs transition"
              title="Abrir no Google Maps"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Ver no Maps</span>
            </a>
            <a
              href={mapsDirectionsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-xs transition shadow-2xs"
              title="Traçar Rota no Google Maps"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Rota</span>
            </a>
          </div>
        </div>
      )}

      {/* Action shortcuts */}
      {address && (
        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
          <span className="truncate max-w-xs">
            📍 {address} {bairro ? `(${bairro})` : ''}
          </span>
          <div className="flex items-center gap-3 shrink-0 font-medium">
            <a
              href={mapsSearchUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-700 hover:underline flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              Google Maps
            </a>
            <a
              href={mapsDirectionsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-700 hover:underline flex items-center gap-1"
            >
              <Navigation className="w-3 h-3" />
              Traçar Rota
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
