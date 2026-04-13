import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, FileText, FileStack, Search, Sparkles, Trash2, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  API_BASE,
  getProcessedDocumentMrn,
  getProcessedDocumentPatientName,
  matchesProcessedDocumentQuery,
  type ProcessedDocument,
  type QueueStatus,
} from "@/lib/processedDocuments";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type QueueTab = "all" | "queued" | "processed" | "failed";

const statusClasses: Record<QueueStatus, string> = {
  queued: "border-transparent bg-emerald-50 text-emerald-700",
  processing: "border-transparent bg-amber-50 text-amber-700",
  processed: "border-transparent bg-blue-50 text-blue-700",
  failed: "border-transparent bg-red-50 text-red-700",
};

const statusLabels: Record<QueueStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  processed: "Processed",
  failed: "Failed",
};

const UploadCenter = () => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<ProcessedDocument[]>([]);
  const [activeTab, setActiveTab] = useState<QueueTab>("all");
  const [searchValue, setSearchValue] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<Record<string, {
    stepNumber: number;
    totalSteps: number;
    tokensUsed: number;
    stepName: string;
  }>>({});

  const loadDocuments = async () => {
    const response = await fetch(`${API_BASE}/documents`);
    if (!response.ok) {
      throw new Error("Unable to load uploaded documents.");
    }
    const payload = await response.json();
    setDocuments(payload.documents ?? []);
  };

  useEffect(() => {
    loadDocuments()
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Unable to load uploaded documents.");
      })
      .finally(() => {
        setIsLoadingDocuments(false);
      });
  }, []);

  const filteredDocuments = useMemo(() => {
    return documents.filter((document) => {
      const matchesTab =
        activeTab === "all" ||
        (activeTab === "queued" && document.status === "queued") ||
        (activeTab === "processed" && document.status === "processed") ||
        (activeTab === "failed" && document.status === "failed");
      return matchesTab && matchesProcessedDocumentQuery(document, searchValue);
    });
  }, [activeTab, documents, searchValue]);

  const stats = useMemo(() => {
    return {
      total: documents.length,
      queued: documents.filter((document) => document.status === "queued").length,
      processing: documents.filter((document) => document.status === "processing").length,
      processed: documents.filter((document) => document.status === "processed").length,
      failed: documents.filter((document) => document.status === "failed").length,
    };
  }, [documents]);

  const queueReady = stats.queued > 0 && stats.processing === 0 && !isProcessingBatch;

  const openFilePicker = () => {
    const input = inputRef.current;
    if (!input) return;
    if ("showPicker" in input && typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.click();
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const pdfFiles = files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));

    if (pdfFiles.length === 0) {
      toast.error("Only PDF files are supported.");
      return;
    }
    if (pdfFiles.length !== files.length) {
      toast.warning("Non-PDF files were skipped.");
    }

    const formData = new FormData();
    pdfFiles.forEach((file) => formData.append("files", file));

    try {
      setIsUploading(true);
      const response = await fetch(`${API_BASE}/documents/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed.");
      }

      const result = await response.json();
      const { documents: uploaded, duplicates = [] } = result;

      await loadDocuments();
      setActiveTab("all");

      // Show results
      if (uploaded.length > 0) {
        toast.success(`${uploaded.length} PDF${uploaded.length > 1 ? "s" : ""} added to the queue.`);
      }

      // Show duplicates info
      if (duplicates.length > 0) {
        const duplicateNames = duplicates.map((d: { name: string }) => d.name).join(", ");
        toast.info(`${duplicates.length} duplicate file${duplicates.length > 1 ? "s were" : " was"} skipped: ${duplicateNames}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    await handleFiles(event.target.files);
    event.target.value = "";
  };

  const handleProcessQueue = async () => {
    const queuedDocuments = documents.filter((document) => document.status === "queued");
    if (queuedDocuments.length === 0) return;

    setIsProcessingBatch(true);
    setProcessingProgress({});

    const MAX_CONCURRENT = 3;
    const chunks = [];
    for (let i = 0; i < queuedDocuments.length; i += MAX_CONCURRENT) {
      chunks.push(queuedDocuments.slice(i, i + MAX_CONCURRENT));
    }

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];

      setDocuments((current) =>
        current.map((document) =>
          chunk.some(d => d.id === document.id)
            ? { ...document, status: "processing" }
            : document
        ),
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      await Promise.all(chunk.map(async (document) => {
        try {
          const eventSource = new EventSource(`${API_BASE}/documents/process/progress?documentId=${document.id}`);

          eventSource.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              switch (data.type) {
                case 'step':
                  setProcessingProgress(prev => ({
                    ...prev,
                    [document.id]: {
                      stepNumber: data.stepNumber,
                      totalSteps: data.totalSteps,
                      tokensUsed: (prev[document.id]?.tokensUsed || 0) + (data.data?.tokens || 0),
                      stepName: formatStepName(data.step)
                    }
                  }));
                  break;
                case 'done':
                  setDocuments((current) =>
                    current.map((doc) =>
                      doc.id === document.id ? { ...data.document } : doc
                    ),
                  );
                  eventSource.close();
                  break;
                case 'error':
                  toast.error(`${document.name}: ${data.error}`);
                  setDocuments((current) =>
                    current.map((doc) =>
                      doc.id === document.id
                        ? { ...doc, status: "failed" as const, error: data.error }
                        : doc
                    ),
                  );
                  eventSource.close();
                  break;
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          };

          eventSource.onerror = () => {
            eventSource.close();
          };

          await new Promise<void>((resolve) => {
            const checkInterval = setInterval(async () => {
              try {
                const response = await fetch(`${API_BASE}/documents`);
                if (response.ok) {
                  const payload = await response.json();
                  const currentDoc = payload.documents?.find((d: any) => d.id === document.id);
                  if (currentDoc && (currentDoc.status === 'processed' || currentDoc.status === 'failed')) {
                    clearInterval(checkInterval);
                    setDocuments((current) =>
                      current.map((doc) =>
                        doc.id === document.id ? currentDoc : doc
                      ),
                    );
                    eventSource.close();
                    resolve();
                  }
                }
              } catch (e) {
                // Ignore polling errors
              }
            }, 2000);

            setTimeout(() => {
              clearInterval(checkInterval);
              eventSource.close();
              resolve();
            }, 300000);
          });

        } catch (error) {
          toast.error(`${document.name}: ${error instanceof Error ? error.message : 'Processing failed'}`);
        }
      }));
    }

    await loadDocuments();
    setIsProcessingBatch(false);
    setProcessingProgress({});
    toast.success(`Batch processing complete.`);
  };

  const formatStepName = (step: string) => {
    return step.split(/[_-]+/).filter(Boolean).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/documents/${id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Unable to delete document.");
      }
      setDocuments((current) => current.filter((document) => document.id !== id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete document.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-4">
            <img src="/manipal-logo.png" alt="Manipal Hospitals" className="h-10" />
          </div>
          <img src="/yavar-logo.png" alt="Powered by Yavar.ai" className="h-5 opacity-60" />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-6">
        <div className="grid gap-6">
          {/* Upload Area */}
          <Card>
            <CardContent className="p-6">
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Upload Zone */}
                <div>
                  <input ref={inputRef} type="file" multiple accept=".pdf,application/pdf" className="hidden" onChange={handleInputChange} />
                  <div
                    role="button"
                    tabIndex={0}
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
                      dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"
                    }`}
                    onClick={openFilePicker}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openFilePicker();
                      }
                    }}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      setDragActive(true);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={(event) => {
                      event.preventDefault();
                      setDragActive(false);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragActive(false);
                      handleFiles(event.dataTransfer.files);
                    }}
                  >
                    <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                    <p className="font-medium">Drop PDF files here or click to upload</p>
                    <p className="text-sm text-muted-foreground mt-1">Multiple files supported</p>
                  </div>
                </div>

                {/* Process Action */}
                <div className="flex flex-col justify-center">
                  <div className="mb-4">
                    <p className="text-sm font-medium">Queue Status</p>
                    <p className="text-2xl font-bold mt-1">{stats.queued} queued · {stats.processed} processed</p>
                  </div>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleProcessQueue}
                    disabled={!queueReady || isUploading}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    {isProcessingBatch ? "Processing..." : "Process Queue"}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    {!queueReady && stats.queued === 0 ? "Upload PDFs to enable processing" : null}
                    {stats.processing > 0 ? "Processing in progress..." : null}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Documents Queue */}
          <Card>
            <div className="p-4 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {["all", "queued", "processed", "failed"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab as QueueTab)}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      activeTab === tab
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Search by PDF, patient, or MRN"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingDocuments ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Loading documents...
                      </TableCell>
                    </TableRow>
                  ) : filteredDocuments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        <FileStack className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                        <p className="text-muted-foreground">No documents found</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredDocuments.map((document) => {
                      const patientName = getProcessedDocumentPatientName(document);
                      const mrn = getProcessedDocumentMrn(document);

                      return (
                        <TableRow key={document.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{document.name}</p>
                                {patientName && (
                                  <p className="text-xs text-muted-foreground">
                                    {patientName}{mrn ? ` · MRN ${mrn}` : ""}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{formatFileSize(document.size)}</TableCell>
                          <TableCell>
                            {document.status === "processing" && processingProgress[document.id] ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                                  <span className="text-xs">{processingProgress[document.id].stepName}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>{processingProgress[document.id].stepNumber}/{processingProgress[document.id].totalSteps}</span>
                                  <span>· {processingProgress[document.id].tokensUsed.toLocaleString()} tokens</span>
                                </div>
                              </div>
                            ) : (
                              <Badge className={statusClasses[document.status]}>{statusLabels[document.status]}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{formatDateTime(document.uploadedAt)}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  document.status === "processed"
                                    ? navigate(`/dashboard?documentId=${document.id}`)
                                    : toast.info("Process this document first.")
                                }
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDelete(document.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
};

const formatFileSize = (size: number) => {
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

export default UploadCenter;
