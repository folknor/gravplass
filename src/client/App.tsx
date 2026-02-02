import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Container,
  CopyButton,
  Group,
  Paper,
  Progress,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import type { ChangeEvent, ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  IconCheck,
  IconCopy,
  IconFile,
  IconLink,
  IconTrash,
  IconUpload,
  IconX,
} from "./icons";

interface UploadResult {
  url: string;
  fileCount: number;
  burn: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = sizes[i] ?? "GB";
  return `${(bytes / k ** i).toFixed(1)} ${size}`;
}

function uploadFiles(
  files: File[],
  password: string,
  burn: boolean,
  onProgress: (loaded: number, total: number) => void,
): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    for (const file of files) {
      formData.append("files", file);
    }

    if (burn) {
      formData.append("burn", "true");
    }

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(e.loaded, e.total);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 200) {
        resolve(JSON.parse(xhr.responseText) as { url: string });
      } else if (xhr.status === 401) {
        reject(new Error("Ugyldig passord"));
      } else {
        reject(new Error(`Opplasting feilet: ${xhr.statusText}`));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Nettverksfeil"));
    });

    xhr.open("POST", "/api/upload");
    xhr.setRequestHeader("X-Password", password);
    xhr.send(formData);
  });
}

interface Quota {
  used: number;
  max: number;
  available: number;
}

export default function App(): ReactElement {
  const [password, setPassword] = useState("");
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [burn, setBurn] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [results, setResults] = useState<UploadResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [quotaRefresh, setQuotaRefresh] = useState(0);

  const totalSize = queuedFiles.reduce((sum, f) => sum + f.size, 0);
  const exceedsQuota = quota !== null && totalSize > quota.available;

  // Fetch quota when password changes or after upload (debounced)
  useEffect(() => {
    if (!password) {
      setQuota(null);
      return;
    }

    // quotaRefresh is used to trigger refetch after upload
    void quotaRefresh;

    const controller = new AbortController();

    // Debounce: wait 500ms after user stops typing
    const timeoutId = setTimeout(() => {
      fetch("/api/quota", {
        headers: { "X-Password": password },
        signal: controller.signal,
      })
        .then((res) => {
          if (res.ok) {
            return res.json() as Promise<Quota>;
          }
          setQuota(null);
          return null;
        })
        .then((data) => {
          if (data) {
            setQuota(data);
          }
        })
        .catch(() => {
          // Ignore abort errors
        });
    }, 500);

    return (): void => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [password, quotaRefresh]);

  const handleDrop = useCallback((files: File[]): void => {
    setQueuedFiles((prev) => [...prev, ...files]);
    setError(null);
  }, []);

  const handleRemoveFile = useCallback((index: number): void => {
    setQueuedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleClearQueue = useCallback((): void => {
    setQueuedFiles([]);
  }, []);

  const handlePasswordChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      setPassword(e.currentTarget.value);
    },
    [],
  );

  const handleCloseError = useCallback((): void => {
    setError(null);
  }, []);

  const handleBurnChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      setBurn(e.currentTarget.checked);
    },
    [],
  );

  const handleUpload = useCallback(async (): Promise<void> => {
    if (!password) {
      setError("Vennligst skriv inn et passord");
      return;
    }
    if (queuedFiles.length === 0) {
      setError("Ingen filer å laste opp");
      return;
    }

    setUploading(true);
    setError(null);
    setProgress({ loaded: 0, total: totalSize });

    try {
      const result = await uploadFiles(
        queuedFiles,
        password,
        burn,
        (loaded, total) => {
          setProgress({ loaded, total });
        },
      );

      setResults((prev) => [
        {
          url: window.location.origin + result.url,
          fileCount: queuedFiles.length,
          burn,
        },
        ...prev,
      ]);
      setQueuedFiles([]);
      setBurn(false);
      setQuotaRefresh((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opplasting feilet");
    } finally {
      setUploading(false);
      setProgress({ loaded: 0, total: 0 });
    }
  }, [password, queuedFiles, burn, totalSize]);

  const progressPercent =
    progress.total > 0 ? (progress.loaded / progress.total) * 100 : 0;

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={1} ta="center">
          gravplass
        </Title>

        <TextInput
          label="Passord"
          type="password"
          placeholder="Skriv inn passord"
          value={password}
          onChange={handlePasswordChange}
        />

        {error ? (
          <Alert color="red" onClose={handleCloseError} withCloseButton>
            {error}
          </Alert>
        ) : null}

        {quota === null ? null : (
          <>
            <Dropzone onDrop={handleDrop} disabled={uploading} multiple>
              <Group
                justify="center"
                gap="xl"
                style={{ minHeight: 120, pointerEvents: "none" }}
              >
                <Dropzone.Accept>
                  <IconUpload size={50} stroke={1.5} />
                </Dropzone.Accept>
                <Dropzone.Reject>
                  <IconX size={50} stroke={1.5} />
                </Dropzone.Reject>
                <Dropzone.Idle>
                  <IconFile size={50} stroke={1.5} />
                </Dropzone.Idle>

                <div>
                  <Text size="lg" inline>
                    Dra filer hit eller klikk for å velge
                  </Text>
                  <Text size="sm" c="dimmed" inline mt={7}>
                    Legg til filer i delingen
                  </Text>
                </div>
              </Group>
            </Dropzone>

            {queuedFiles.length > 0 ? (
              <Paper withBorder p="md">
                <Group justify="space-between" mb="sm">
                  <Title order={4}>
                    {queuedFiles.length} fil{queuedFiles.length > 1 ? "er" : ""}{" "}
                    ({formatBytes(totalSize)})
                  </Title>
                  <Button
                    variant="subtle"
                    color="red"
                    size="xs"
                    onClick={handleClearQueue}
                    disabled={uploading}
                  >
                    Fjern alle
                  </Button>
                </Group>
                <Stack gap="xs">
                  {queuedFiles.map((file, index) => (
                    <Group
                      key={`${file.name}-${file.size}-${file.lastModified}`}
                      justify="space-between"
                    >
                      <Group gap="xs">
                        <IconFile size={16} />
                        <Text size="sm" truncate style={{ maxWidth: 250 }}>
                          {file.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {formatBytes(file.size)}
                        </Text>
                      </Group>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={(): void => handleRemoveFile(index)}
                        disabled={uploading}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  ))}
                </Stack>
              </Paper>
            ) : null}

            {uploading ? (
              <Stack gap="xs">
                <Progress value={progressPercent} animated />
                <Text size="sm" c="dimmed" ta="center">
                  {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
                </Text>
              </Stack>
            ) : null}

            <Checkbox
              label="Slett etter første nedlasting"
              checked={burn}
              onChange={handleBurnChange}
              disabled={uploading}
            />

            {exceedsQuota ? (
              <Alert color="orange">
                Filene overskrider tilgjengelig plass (
                {formatBytes(quota?.available ?? 0)} ledig)
              </Alert>
            ) : null}

            <Button
              size="lg"
              onClick={handleUpload}
              disabled={queuedFiles.length === 0 || !password || exceedsQuota}
              loading={uploading}
              leftSection={<IconUpload size={20} />}
            >
              Opprett deling
            </Button>

            {results.length > 0 ? (
              <Paper withBorder p="md">
                <Title order={4} mb="sm">
                  Dine delinger
                </Title>
                <Stack gap="xs">
                  {results.map((result) => (
                    <Group key={result.url} justify="space-between">
                      <Group gap="xs">
                        <IconLink size={16} />
                        <Text size="sm">
                          {result.fileCount} fil
                          {result.fileCount > 1 ? "er" : ""}
                          {result.burn ? " (engangs)" : ""}
                        </Text>
                      </Group>
                      <CopyButton value={result.url}>
                        {({
                          copied,
                          copy,
                        }: {
                          copied: boolean;
                          copy: () => void;
                        }): ReactElement => (
                          <Tooltip label={copied ? "Kopiert!" : "Kopier lenke"}>
                            <ActionIcon
                              color={copied ? "teal" : "gray"}
                              variant="subtle"
                              onClick={copy}
                            >
                              {copied ? (
                                <IconCheck size={16} />
                              ) : (
                                <IconCopy size={16} />
                              )}
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </CopyButton>
                    </Group>
                  ))}
                </Stack>
              </Paper>
            ) : null}
          </>
        )}
      </Stack>
    </Container>
  );
}
