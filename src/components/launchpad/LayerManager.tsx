import React, { useCallback, useRef } from "react";
import { motion, Reorder } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  FolderPlus,
  GripVertical,
  Trash2,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Layers,
  Sparkles,
  Upload,
  Percent,
} from "lucide-react";
import { toast } from "sonner";
import { checkMedia, LAYER_ACCEPT } from "@/lib/uploadRules";

// Blend mode type for layer compositing
export type BlendMode = GlobalCompositeOperation;

export interface LayerTrait {
  id: string;
  name: string;
  file?: File;
  preview: string;
  rarity: number;
  /** Alias for preview - used by some components */
  imageUrl?: string;
}

// Trait is an alias for LayerTrait (used across components)
export type Trait = LayerTrait;

export interface Layer {
  id: string;
  name: string;
  traits: LayerTrait[];
  visible: boolean;
  collapsed: boolean;
  /** Layer order for compositing (lower = rendered first) */
  order?: number;
  /** Blend mode for compositing */
  blendMode?: BlendMode;
  /** Opacity 0-100 */
  opacity?: number;
  /** Whether this layer can be skipped */
  isOptional?: boolean;
  /** Chance (0-100) this optional layer appears */
  optionalChance?: number;
}

interface LayerManagerProps {
  layers: Layer[];
  onLayersChange: (layers: Layer[]) => void;
}

export function LayerManager({ layers, onLayersChange }: LayerManagerProps) {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Process uploaded files into a layer (works for both folder and file modes)
  const processFilesIntoLayer = useCallback(async (files: FileList, mode: 'folder' | 'files') => {
    if (!files || files.length === 0) return;

    // Determine the layer name
    let layerName: string;
    if (mode === 'folder') {
      const pathParts = files[0].webkitRelativePath.split("/");
      layerName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : pathParts[0] || `Layer ${layers.length + 1}`;
    } else {
      layerName = `Layer ${layers.length + 1}`;
    }

    const candidates = Array.from(files).filter((f) => !f.name.startsWith("."));
    const rejected = candidates.map((f) => checkMedia(f, true)).filter(Boolean) as string[];
    const imageFiles = candidates.filter((f) => !checkMedia(f, true));
    if (rejected.length) toast.error(`${rejected.length} file(s) skipped`, { description: rejected.slice(0, 3).join("\n") });

    if (imageFiles.length === 0) {
      toast.error("No images found — use GIF, JPG, PNG or SVG up to 50 MB");
      return;
    }

    const traits: LayerTrait[] = await Promise.all(
      imageFiles.map(async (file) => {
        const preview = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        return {
          id: crypto.randomUUID(),
          name: file.name.replace(/\.[^/.]+$/, ""),
          file,
          preview,
          rarity: Math.round(100 / imageFiles.length),
        };
      })
    );

    onLayersChange([...layers, {
      id: crypto.randomUUID(),
      name: layerName,
      traits,
      visible: true,
      collapsed: false,
    }]);
    toast.success(`Added "${layerName}" with ${traits.length} traits`);
  }, [layers, onLayersChange]);

  const handleFolderInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFilesIntoLayer(e.target.files, 'folder');
    }
    e.target.value = "";
  }, [processFilesIntoLayer]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFilesIntoLayer(e.target.files, 'files');
    }
    e.target.value = "";
  }, [processFilesIntoLayer]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold gradient-text flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-primary" />
            Trait Layers
          </h3>
          <p className="text-[10px] text-muted-foreground">Import folders for each layer</p>
        </div>

        <div className="flex gap-2">
          {/* Hidden native inputs — triggered via refs for reliability inside Dialog portals */}
          <input
            ref={folderInputRef}
            type="file"
            // @ts-ignore — webkitdirectory is valid but not in TS types
            webkitdirectory=""
            directory=""
            multiple
            className="hidden"
            onChange={handleFolderInput}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={LAYER_ACCEPT}
            multiple
            className="hidden"
            onChange={handleFileInput}
          />
          <Button
            className="bg-gradient-to-r from-primary to-accent text-primary-foreground h-7 text-xs px-3"
            size="sm"
            onClick={() => folderInputRef.current?.click()}
          >
            <FolderPlus className="w-3 h-3 mr-1" /> Add Folder
          </Button>
          <Button
            variant="outline"
            className="h-7 text-xs px-3"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-3 h-3 mr-1" /> Add Files
          </Button>
        </div>
      </div>

      {/* Layers List */}
      {layers.length === 0 ? (
        <div className="glass-card border-dashed border-2 p-6 text-center">
          <ImageIcon className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-xs text-muted-foreground">Click "Add Folder" to import a trait folder, or "Add Files" to select individual images</p>
        </div>
      ) : (
        <Reorder.Group axis="y" values={layers} onReorder={onLayersChange} className="space-y-2">
          {layers.map((layer, index) => (
            <Reorder.Item key={layer.id} value={layer} className="cursor-grab active:cursor-grabbing">
              <motion.div layout className={`rounded-lg glass-card overflow-hidden ${!layer.visible && "opacity-50"}`}>
                {/* Layer Header */}
                <div className="flex items-center gap-2 p-2 bg-muted/30">
                  <GripVertical className="w-3 h-3 text-muted-foreground" />
                  <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] h-5 px-1.5">{index + 1}</Badge>
                  <Input
                    value={layer.name}
                    onChange={(e) => onLayersChange(layers.map((l) => l.id === layer.id ? { ...l, name: e.target.value } : l))}
                    className="flex-1 h-6 text-xs bg-transparent border-transparent hover:border-border focus:border-primary px-1"
                  />
                  <Badge variant="outline" className="text-[10px] h-5">
                    {layer.traits.length} traits
                  </Badge>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onLayersChange(layers.map((l) => l.id === layer.id ? { ...l, visible: !l.visible } : l))}>
                    {layer.visible ? <Eye className="w-3 h-3 text-primary" /> : <EyeOff className="w-3 h-3" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onLayersChange(layers.map((l) => l.id === layer.id ? { ...l, collapsed: !l.collapsed } : l))}>
                    {layer.collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={() => onLayersChange(layers.filter((l) => l.id !== layer.id))}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>

                {/* Traits Preview with Rarity */}
                {!layer.collapsed && (
                  <div className="px-2 pb-2 space-y-1.5">
                    {/* Layer Appearance Probability */}
                    <div className="flex items-center gap-3 py-1.5 px-1 rounded-md bg-muted/20">
                      <div className="flex items-center gap-2 shrink-0">
                        <Percent className="w-3 h-3 text-muted-foreground" />
                        <Label className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
                          Appears
                        </Label>
                      </div>
                      <Slider
                        value={[layer.isOptional ? (layer.optionalChance ?? 100) : 100]}
                        onValueChange={([val]) => {
                          onLayersChange(
                            layers.map((l) =>
                              l.id === layer.id
                                ? {
                                    ...l,
                                    isOptional: val < 100,
                                    optionalChance: val,
                                  }
                                : l
                            )
                          );
                        }}
                        min={1}
                        max={100}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-[10px] font-mono font-bold text-primary w-8 text-right shrink-0">
                        {layer.isOptional ? (layer.optionalChance ?? 100) : 100}%
                      </span>
                    </div>

                    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                      {layer.traits.slice(0, 8).map((trait) => {
                        const total = layer.traits.reduce((sum, t) => sum + t.rarity, 0);
                        const pct = total > 0 ? Math.round((trait.rarity / total) * 100) : 0;
                        return (
                          <div key={trait.id} className="flex-shrink-0 flex flex-col items-center gap-0.5" title={`${trait.name}: ${pct}%`}>
                            <div className="w-10 h-10 rounded border border-border bg-card overflow-hidden">
                              <img src={trait.preview} alt={trait.name} className="w-full h-full object-contain" />
                            </div>
                            <span className={`text-[8px] font-mono font-bold ${pct <= 5 ? 'text-amber-500' : pct <= 15 ? 'text-purple-500' : pct <= 30 ? 'text-blue-500' : 'text-muted-foreground'}`}>
                              {pct}%
                            </span>
                          </div>
                        );
                      })}
                      {layer.traits.length > 8 && (
                        <div className="flex-shrink-0 flex flex-col items-center gap-0.5 justify-center">
                          <div className="w-10 h-10 rounded border-dashed border border-border flex items-center justify-center">
                            <span className="text-[10px] text-muted-foreground">+{layer.traits.length - 8}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Mini distribution bar */}
                    <div className="h-1 rounded-full overflow-hidden flex bg-muted/40">
                      {layer.traits.map((trait, idx) => {
                        const total = layer.traits.reduce((sum, t) => sum + t.rarity, 0);
                        const pct = total > 0 ? (trait.rarity / total) * 100 : 0;
                        return (
                          <div
                            key={trait.id}
                            className={`h-full ${idx > 0 ? 'border-l border-background/60' : ''} ${pct <= 5 ? 'bg-amber-500' : pct <= 15 ? 'bg-purple-500' : pct <= 30 ? 'bg-blue-500' : 'bg-muted-foreground/60'}`}
                            style={{ width: `${pct}%` }}
                            title={`${trait.name}: ${Math.round(pct)}%`}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}

      {/* Info */}
      {layers.length > 0 && (
        <div className="flex items-center gap-2 p-2 glass-card text-xs">
          <Sparkles className="w-3 h-3 text-primary" />
          <span className="text-muted-foreground">
            Combinations: <span className="font-mono text-primary font-bold">{layers.reduce((acc, l) => acc * (l.visible ? l.traits.length : 1), 1).toLocaleString()}</span>
          </span>
        </div>
      )}
    </div>
  );
}
