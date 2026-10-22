/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { Camera, Upload, Trash2, Image as ImageIcon, Plus, X, Eye, Tag } from 'lucide-react';
import { PhotoItemCategory, ClientPhoto } from '../types';
import { generateId } from '../lib/database';

interface PhotoUploaderProps {
  clientId: string;
  quoteId?: string;
  osId?: string;
  photos: ClientPhoto[];
  onChange: (photos: ClientPhoto[]) => void;
  maxPhotos?: number;
  readOnly?: boolean;
}

const CATEGORIES: PhotoItemCategory[] = ['Sofá', 'Colchão', 'Cadeira', 'Poltrona', 'Tapete', 'Outros'];

export const PhotoUploader: React.FC<PhotoUploaderProps> = ({
  clientId,
  quoteId,
  osId,
  photos,
  onChange,
  maxPhotos = 12,
  readOnly = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedCategory, setSelectedCategory] = useState<PhotoItemCategory>('Sofá');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [previewPhoto, setPreviewPhoto] = useState<ClientPhoto | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newPhotos: ClientPhoto[] = [];
    const nowStr = new Date().toISOString().split('T')[0];

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Url = event.target?.result as string;
        if (base64Url) {
          const photo: ClientPhoto = {
            id: generateId(),
            client_id: clientId,
            quote_id: quoteId,
            os_id: osId,
            url: base64Url,
            categoria: selectedCategory,
            descricao: descriptionInput.trim() || undefined,
            created_at: nowStr,
          };
          newPhotos.push(photo);

          if (newPhotos.length === files.length) {
            onChange([...photos, ...newPhotos]);
            setDescriptionInput('');
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemovePhoto = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(photos.filter((p) => p.id !== id));
  };

  const handleCategoryChange = (id: string, newCategory: PhotoItemCategory, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(photos.map((p) => (p.id === id ? { ...p, categoria: newCategory } : p)));
  };

  return (
    <div className="space-y-4">
      {/* Upload Controls - only if not read only */}
      {!readOnly && (
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-blue-600" />
                <span>Fotos dos Itens do Cliente</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Anexe fotos dos estofados, colchões, cadeiras e tapetes para o cadastro.
              </p>
            </div>

            {/* Category Selector for upload */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Item:</span>
              <div className="flex gap-1 overflow-x-auto pb-1 max-w-full">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={descriptionInput}
              onChange={(e) => setDescriptionInput(e.target.value)}
              placeholder={`Detalhes do item (ex: Sofá retrátil cinza 3 lugares manchado)...`}
              className="flex-1 text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              multiple
              className="hidden"
            />
            <button
              type="button"
              disabled={isUploading || photos.length >= maxPhotos}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isUploading ? 'Carregando...' : 'Selecionar Fotos'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Photos Grid */}
      {photos.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((photo) => (
            <div
              key={photo.id}
              onClick={() => setPreviewPhoto(photo)}
              className="group relative bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs hover:shadow-md transition cursor-pointer flex flex-col"
            >
              {/* Image Container */}
              <div className="aspect-4/3 w-full bg-slate-100 relative overflow-hidden">
                <img
                  src={photo.url}
                  alt={photo.descricao || photo.categoria}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/30 transition-colors flex items-center justify-center">
                  <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-sm" />
                </div>

                {/* Category Badge */}
                <span className="absolute top-2 left-2 px-2 py-0.5 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-bold rounded-md shadow-xs">
                  {photo.categoria}
                </span>

                {/* Remove button */}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={(e) => handleRemovePhoto(photo.id, e)}
                    className="absolute top-2 right-2 p-1.5 bg-rose-600/90 hover:bg-rose-700 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-xs cursor-pointer"
                    title="Remover foto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Photo description / caption */}
              <div className="p-2 bg-white">
                <p className="text-[11px] font-medium text-slate-700 truncate">
                  {photo.descricao || `${photo.categoria} do cliente`}
                </p>
                <span className="text-[9px] text-slate-400">{photo.created_at}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl text-center bg-slate-50/50">
          <ImageIcon className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
          <p className="text-xs font-semibold text-slate-600">Nenhuma foto adicionada</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Adicione fotos dos itens para manter o histórico visual no cadastro do cliente.
          </p>
        </div>
      )}

      {/* Full-Screen Preview Modal */}
      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 text-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl border border-slate-800 flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-blue-600/20 text-blue-300 text-xs font-bold rounded-lg border border-blue-600/30">
                  {previewPhoto.categoria}
                </span>
                <span className="text-xs text-slate-300 font-medium truncate">
                  {previewPhoto.descricao || 'Foto do item'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Image display */}
            <div className="flex-1 overflow-auto bg-black flex items-center justify-center p-2 min-h-[300px]">
              <img
                src={previewPhoto.url}
                alt={previewPhoto.descricao || previewPhoto.categoria}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Registrado em {previewPhoto.created_at}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
