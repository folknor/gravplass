import {
  ActionIcon,
  Alert,
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
import { useCallback, useState } from "react";
import {
  IconCheck,
  IconCopy,
  IconFile,
  IconLink,
  IconUpload,
  IconX,
} from "./icons";

interface UploadedFile {
  name: string;
  url: string;
}

export default function App(): ReactElement {
  const [password, setPassword] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = useCallback(
    async (files: File[]): Promise<void> => {
      if (!password) {
        setError("Please enter a password first");
        return;
      }

      setUploading(true);
      setError(null);
      setProgress(0);

      const newUploaded: UploadedFile[] = [];
      const total = files.length;

      for (const [i, file] of files.entries()) {
        const formData = new FormData();
        formData.append("file", file);

        try {
          const res = await fetch("/api/upload", {
            method: "POST",
            headers: { "X-Password": password },
            body: formData,
          });

          if (!res.ok) {
            if (res.status === 401) {
              setError("Invalid password");
              break;
            }
            throw new Error(`Upload failed: ${res.statusText}`);
          }

          const data = (await res.json()) as { url: string };
          newUploaded.push({
            name: file.name,
            url: window.location.origin + data.url,
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Upload failed");
          break;
        }

        setProgress(((i + 1) / total) * 100);
      }

      setUploadedFiles((prev) => [...newUploaded, ...prev]);
      setUploading(false);
    },
    [password],
  );

  const handlePasswordChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      setPassword(e.currentTarget.value);
    },
    [],
  );

  const handleCloseError = useCallback((): void => {
    setError(null);
  }, []);

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={1} ta="center">
          Upload Files
        </Title>

        <TextInput
          label="Password"
          type="password"
          placeholder="Enter upload password"
          value={password}
          onChange={handlePasswordChange}
        />

        {error ? (
          <Alert color="red" onClose={handleCloseError} withCloseButton>
            {error}
          </Alert>
        ) : null}

        <Dropzone
          onDrop={handleDrop}
          loading={uploading}
          disabled={!password}
          multiple
        >
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
                Drag files here or click to select
              </Text>
              <Text size="sm" c="dimmed" inline mt={7}>
                {password ? "Drop files to upload" : "Enter password first"}
              </Text>
            </div>
          </Group>
        </Dropzone>

        {uploading ? <Progress value={progress} animated /> : null}

        {uploadedFiles.length > 0 ? (
          <Paper withBorder p="md">
            <Title order={4} mb="sm">
              Uploaded Files
            </Title>
            <Stack gap="xs">
              {uploadedFiles.map((file) => (
                <Group key={file.url} justify="space-between">
                  <Group gap="xs">
                    <IconLink size={16} />
                    <Text size="sm" truncate style={{ maxWidth: 300 }}>
                      {file.name}
                    </Text>
                  </Group>
                  <CopyButton value={file.url}>
                    {({
                      copied,
                      copy,
                    }: {
                      copied: boolean;
                      copy: () => void;
                    }): ReactElement => (
                      <Tooltip label={copied ? "Copied!" : "Copy link"}>
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
      </Stack>
    </Container>
  );
}
