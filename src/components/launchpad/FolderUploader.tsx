import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, FolderOpen, FileJson, CheckCircle, AlertTriangle, Image as ImageIcon } from "lucide-react";
import { toast } from 'sonner';

interface FolderUploaderProps {
    onAssetsLoaded: (assets: { name: string; uri: string; file: File }[]) => void;
}

export function FolderUploader({ onAssetsLoaded }: FolderUploaderProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [stats, setStats] = useState({ images: 0, jsons: 0, matched: 0 });
    const [files, setFiles] = useState<any[]>([]);

    const processFiles = useCallback(async (fileList: File[]) => {
        setIsLoading(true);
        try {
            const imageMap = new Map<string, File>();
            const jsonMap = new Map<string, File>();

            console.log(`Processing ${fileList.length} files...`);

            // Separate images and JSONs with chunking to prevent UI freeze
            const CHUNK_SIZE = 50;
            for (let i = 0; i < fileList.length; i += CHUNK_SIZE) {
                const chunk = fileList.slice(i, i + CHUNK_SIZE);
                chunk.forEach(file => {
                    // webkitRelativePath example: "my-collection/assets/1.png" or "my-collection/images/0.jpeg"
                    const pathParts = file.webkitRelativePath.split('/');
                    const filename = pathParts[pathParts.length - 1];
                    const cleanName = filename.substring(0, filename.lastIndexOf('.'));

                    // Handle LMNFT structure: images/ and metadata/ subfolders
                    if (file.type.startsWith('image/')) {
                        imageMap.set(cleanName, file);
                    } else if (file.name.endsWith('.json')) {
                        jsonMap.set(cleanName, file);
                    }
                });

                // Yield to main thread every chunk
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            console.log(`Found ${imageMap.size} images and ${jsonMap.size} JSON files`);

            setStats({
                images: imageMap.size,
                jsons: jsonMap.size,
                matched: 0 // calc below
            });

            // Match pairs with chunking
            const matchedAssets: { name: string; uri: string; file: File; jsonFile: File }[] = [];
            const imageNames = Array.from(imageMap.keys());

            for (let i = 0; i < imageNames.length; i += CHUNK_SIZE) {
                const chunk = imageNames.slice(i, i + CHUNK_SIZE);
                chunk.forEach(name => {
                    const imgFile = imageMap.get(name)!;
                    if (jsonMap.has(name)) {
                        matchedAssets.push({
                            name: name,
                            uri: URL.createObjectURL(imgFile),
                            file: imgFile,
                            jsonFile: jsonMap.get(name)!
                        });
                    }
                });

                // Yield to main thread every chunk
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            console.log(`Matched ${matchedAssets.length} asset pairs`);

            setStats(prev => ({ ...prev, matched: matchedAssets.length }));

            if (matchedAssets.length === 0) {
                toast.error("No matching image/json pairs found. Ensure filenames match (e.g. 0.png and 0.json). For LMNFT exports, select the parent folder containing images/ and metadata/ subfolders.");
            } else {
                toast.success(`Found ${matchedAssets.length} valid asset pairs!`);
                onAssetsLoaded(matchedAssets.map(a => ({
                    name: a.name,
                    uri: a.uri,
                    file: a.file,
                    jsonFile: a.jsonFile
                })));
            }

            setFiles(matchedAssets);

        } catch (e) {
            console.error(e);
            toast.error("Failed to process folder.");
        } finally {
            setIsLoading(false);
        }
    }, [onAssetsLoaded]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop: processFiles,
        // Enable directory selection for nested folder structures (LMNFT: images/ + metadata/)
        // @ts-ignore - directory support is non-standard but works in dropzone with custom input attributes
        noClick: false,
        noKeyboard: false,
        // Allow multiple files and directories
        multiple: true
    });

    return (
        <div className="space-y-6">
            <Card className={`border-2 border-dashed transition-colors ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}`}>
                <div {...getRootProps()} className="p-10 text-center cursor-pointer hover:bg-muted/50 transition-colors">
                    <input {...getInputProps({ webkitdirectory: "true" } as any)} />
                    <FolderOpen className="w-16 h-16 mx-auto text-primary mb-4" />
                    <h3 className="text-xl font-semibold mb-2">
                        {isDragActive ? "Drop folder here..." : "Drag & Drop Collection Folder"}
                    </h3>
                    <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                        Upload a folder containing your images and JSON metadata files.
                        We'll automatically match them by filename (e.g., <code>0.png</code> + <code>0.json</code>).
                        <br /><br />
                        <strong>For LMNFT exports:</strong> Select the parent folder (e.g., <code>1741154131487_lmnft_generator_output</code>) that contains the <code>images/</code> and <code>metadata/</code> subfolders.
                    </p>
                    <Button variant="outline">Browse Files</Button>
                </div>
            </Card>

            {/* Stats */}
            {(stats.images > 0 || stats.jsons > 0) && (
                <div className="grid grid-cols-3 gap-4">
                    <Card>
                        <CardContent className="pt-6 text-center">
                            <div className="text-2xl font-bold">{stats.images}</div>
                            <p className="text-xs text-muted-foreground">Images Found</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6 text-center">
                            <div className="text-2xl font-bold">{stats.jsons}</div>
                            <p className="text-xs text-muted-foreground">JSONs Found</p>
                        </CardContent>
                    </Card>
                    <Card className={stats.matched > 0 ? "border-green-500/50 bg-green-500/5" : ""}>
                        <CardContent className="pt-6 text-center">
                            <div className={`text-2xl font-bold ${stats.matched > 0 ? "text-green-500" : ""}`}>
                                {stats.matched}
                            </div>
                            <p className="text-xs text-muted-foreground">Pairs Matched</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Preview */}
            {files.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Asset Preview</CardTitle>
                        <CardDescription>Review matched assets before uploading</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[300px] w-full rounded-md border p-4">
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                {files.slice(0, 20).map((file) => (
                                    <div key={file.name} className="relative group rounded-lg overflow-hidden border">
                                        <img
                                            src={file.uri}
                                            alt={file.name}
                                            className="w-full h-full aspect-square object-cover"
                                        />
                                        <div className="absolute bottom-0 inset-x-0 bg-black/60 p-2 text-white text-xs truncate">
                                            {file.name}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {files.length > 20 && (
                                <p className="text-center text-sm text-muted-foreground mt-4">
                                    + {files.length - 20} more items...
                                </p>
                            )}
                        </ScrollArea>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
