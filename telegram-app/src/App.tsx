import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  IconButton,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Spinner,
  Stack,
  Text,
  Textarea,
  useColorMode,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { applyAppTheme, subscribeToThemeChanges } from './theme';

type Provider = 'GOOGLE' | 'TELEGRAM';
type Project = {
  id: string;
  name: string;
  archivedAt: string | null;
  archived: boolean;
};
type Attachment = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
};
type Task = {
  id: string;
  content: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELED';
  projectId: string | null;
  project: Project | null;
  dueDate: string | null;
  snoozedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: Attachment[];
};
type Bootstrap = {
  identity: {
    provider: Provider;
    displayName: string | null;
    linked: boolean;
    providers: Provider[];
  };
  projects: Project[];
  currentTask: Task | null;
  counts: { available: number; active: number };
  nextWakeAt: string | null;
};
type TaskEvent = {
  id: string;
  type: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};
type TaskDetails = Task & {
  events: TaskEvent[];
  stats: { snoozed: number; rotated: number };
};

const initData = window.Telegram?.WebApp?.initData || '';

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (initData) headers.set('x-telegram-init-data', initData);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(`/gtd-api${path}`, {
    ...options,
    headers,
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(data?.message || `Ошибка ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function fetchAttachmentBlob(attachment: Attachment) {
  const headers = new Headers();
  if (initData) headers.set('x-telegram-init-data', initData);
  const response = await fetch(`/gtd-api/attachments/${attachment.id}`, {
    headers,
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('Не удалось загрузить файл');
  return response.blob();
}

async function downloadAttachment(attachment: Attachment) {
  const blob = await fetchAttachmentBlob(attachment);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = attachment.originalName;
  anchor.target = '_blank';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function isImageAttachment(attachment: Attachment) {
  return attachment.mimeType.startsWith('image/');
}

function isVideoAttachment(attachment: Attachment) {
  return attachment.mimeType.startsWith('video/');
}

function formatDate(value: string) {
  return (
    new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(value)) + ' UTC'
  );
}

function dueDateInputValue(value: string | null | undefined) {
  if (!value) return '';
  return value.slice(0, 10);
}

function formatDueDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function isDueOverdue(value: string, now = new Date()) {
  const endOfToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return new Date(value).getTime() < endOfToday - 86_400_000;
}

function isDueToday(value: string, now = new Date()) {
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const end = start + 86_400_000;
  const time = new Date(value).getTime();
  return time >= start && time < end;
}

function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

const ATTACH_ACCEPT =
  'image/*,video/*,.pdf,.txt,.md,.doc,.docx,.xls,.xlsx,.ppt,.pptx';

function Icon({
  children,
  size = 18,
}: {
  children: React.ReactNode;
  size?: number;
}) {
  return (
    <Box
      as="span"
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      w={`${size}px`}
      h={`${size}px`}
      flexShrink={0}
      lineHeight={0}
      aria-hidden
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </Box>
  );
}

const IconCheck = () => (
  <Icon>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);
const IconSkip = () => (
  <Icon>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </Icon>
);
const IconClock = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);
const IconX = () => (
  <Icon>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Icon>
);
const IconFolder = () => (
  <Icon>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </Icon>
);
const IconPlus = () => (
  <Icon>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Icon>
);
const IconArchive = () => (
  <Icon>
    <path d="M3 7h18v4H3z" />
    <path d="M5 11v8h14v-8" />
    <path d="M10 15h4" />
  </Icon>
);
const IconMore = () => (
  <Icon>
    <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
  </Icon>
);
const IconEdit = () => (
  <Icon size={16}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Icon>
);
const IconHistory = () => (
  <Icon size={16}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
    <path d="M12 7v5l3 2" />
  </Icon>
);
const IconPaperclip = () => (
  <Icon size={16}>
    <path d="m21.4 11.6-8.8 8.8a5 5 0 0 1-7.1-7.1l9.2-9.2a3.2 3.2 0 0 1 4.5 4.5l-9.2 9.2a1.4 1.4 0 0 1-2-2l8.2-8.2" />
  </Icon>
);

/** Auth'd blob URL — Telegram Mini App can't put initData on <img src>. */
function useAttachmentObjectUrl(attachment: Attachment) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    void fetchAttachmentBlob(attachment)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id]);

  return { url, failed };
}

function AttachmentPreview({
  attachment,
  compact = false,
}: {
  attachment: Attachment;
  compact?: boolean;
}) {
  const toast = useToast();
  const media = isImageAttachment(attachment) || isVideoAttachment(attachment);
  const { url, failed } = useAttachmentObjectUrl(attachment);

  if (!media) {
    return (
      <Button
        variant="outline"
        justifyContent="space-between"
        fontWeight="normal"
        width="100%"
        onClick={() =>
          void downloadAttachment(attachment).catch((reason: unknown) =>
            toast({ status: 'error', title: String(reason) }),
          )
        }
      >
        <Text noOfLines={1}>{attachment.originalName}</Text>
        <Text color="shadcn.mutedForeground" fontSize="xs">
          {fileSize(attachment.size)}
        </Text>
      </Button>
    );
  }

  return (
    <Box
      borderWidth="1px"
      borderColor="shadcn.border"
      borderRadius="md"
      overflow="hidden"
      bg="shadcn.muted"
    >
      {failed && (
        <Button
          variant="ghost"
          width="100%"
          borderRadius={0}
          onClick={() =>
            void downloadAttachment(attachment).catch((reason: unknown) =>
              toast({ status: 'error', title: String(reason) }),
            )
          }
        >
          Не удалось показать · скачать
        </Button>
      )}
      {!failed && !url && (
        <Flex align="center" justify="center" minH={compact ? '96px' : '160px'}>
          <Spinner size="sm" />
        </Flex>
      )}
      {url && isImageAttachment(attachment) && (
        <Box
          as="a"
          href={url}
          target="_blank"
          rel="noreferrer"
          display="block"
          cursor="zoom-in"
        >
          <Box
            as="img"
            src={url}
            alt={attachment.originalName}
            maxH={compact ? '160px' : '360px'}
            w="100%"
            objectFit="contain"
            display="block"
            bg="blackAlpha.50"
          />
        </Box>
      )}
      {url && isVideoAttachment(attachment) && (
        <Box
          as="video"
          src={url}
          controls
          playsInline
          preload="metadata"
          maxH={compact ? '200px' : '420px'}
          w="100%"
          display="block"
          bg="black"
        />
      )}
      <Flex
        px={3}
        py={2}
        justify="space-between"
        gap={2}
        align="center"
        borderTopWidth="1px"
        borderColor="shadcn.border"
        bg="shadcn.card"
      >
        <Text fontSize="xs" noOfLines={1} title={attachment.originalName}>
          {attachment.originalName}
        </Text>
        <Button
          size="xs"
          variant="ghost"
          flexShrink={0}
          onClick={() =>
            void downloadAttachment(attachment).catch((reason: unknown) =>
              toast({ status: 'error', title: String(reason) }),
            )
          }
        >
          Скачать
        </Button>
      </Flex>
    </Box>
  );
}

function AttachmentsList({
  attachments,
  compact = false,
}: {
  attachments: Attachment[];
  compact?: boolean;
}) {
  if (attachments.length === 0) return null;
  return (
    <Stack spacing={3}>
      {attachments.map((attachment) => (
        <AttachmentPreview
          key={attachment.id}
          attachment={attachment}
          compact={compact}
        />
      ))}
    </Stack>
  );
}

export default function App() {
  const isLinkPage = location.pathname === '/gtd/link';
  return (
    <ThemeSync>{isLinkPage ? <LinkConfirmation /> : <GtdApp />}</ThemeSync>
  );
}

function ThemeSync({ children }: { children: React.ReactNode }) {
  const { setColorMode } = useColorMode();
  useEffect(() => {
    setColorMode(applyAppTheme());
    return subscribeToThemeChanges(setColorMode);
  }, [setColorMode]);
  return <>{children}</>;
}

function LinkConfirmation() {
  const token = new URLSearchParams(location.search).get('token') || '';
  const [preview, setPreview] = useState<{
    google: string;
    telegram: string;
    expiresAt: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ google: string; telegram: string; expiresAt: string }>(
      `/link/preview?token=${encodeURIComponent(token)}`,
    )
      .then(setPreview)
      .catch((reason: unknown) =>
        setError(String(reason instanceof Error ? reason.message : reason)),
      );
  }, [token]);

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/link/confirm', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <Box maxW="560px" mx="auto" mt={{ base: 8, md: 20 }}>
        <Heading size="lg" mb={2}>
          Привязка GTD
        </Heading>
        <Text color="shadcn.mutedForeground" mb={6}>
          Подтвердите объединение Google и Telegram.
        </Text>
        <Panel>
          {error && (
            <Alert status="error" mb={4}>
              <AlertIcon />
              {error}
            </Alert>
          )}
          {!preview && !error && (
            <Flex justify="center" py={8}>
              <Spinner />
            </Flex>
          )}
          {preview && !done && (
            <Stack spacing={4}>
              <IdentityRow label="Google" value={preview.google} />
              <IdentityRow label="Telegram" value={preview.telegram} />
              <Text fontSize="sm" color="shadcn.mutedForeground">
                Проекты, задачи, вложения и история с обеих сторон будут
                сохранены.
              </Text>
              <Button variant="primary" onClick={confirm} isLoading={busy}>
                Объединить пространства
              </Button>
            </Stack>
          )}
          {done && (
            <Stack spacing={3}>
              <Heading size="md">Готово</Heading>
              <Text>
                Аккаунты связаны. Вернитесь в Telegram Mini App — данные
                обновятся автоматически.
              </Text>
            </Stack>
          )}
        </Panel>
      </Box>
    </PageShell>
  );
}

function GtdApp() {
  const toast = useToast();
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState('all');
  const create = useDisclosure();
  const projects = useDisclosure();
  const archive = useDisclosure();
  const history = useDisclosure();
  const settings = useDisclosure();
  const edit = useDisclosure();

  const scopeQuery = useMemo(() => {
    if (scope === 'inbox') return '?scope=inbox';
    if (scope === 'today') return '?scope=today';
    if (scope.startsWith('project:'))
      return `?scope=project&projectId=${encodeURIComponent(scope.slice(8))}`;
    return '?scope=all';
  }, [scope]);

  const refresh = useCallback(
    async (quiet = false) => {
      if (!quiet) setBusy(true);
      try {
        const next = await api<Bootstrap>(`/bootstrap${scopeQuery}`);
        setData(next);
        setError('');
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (!quiet) setBusy(false);
      }
    },
    [scopeQuery],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    window.Telegram?.WebApp?.ready?.();
    window.Telegram?.WebApp?.expand?.();
  }, []);
  useEffect(() => {
    if (!data?.nextWakeAt) return;
    const delay = Math.max(
      250,
      new Date(data.nextWakeAt).getTime() - Date.now() + 250,
    );
    const timer = window.setTimeout(
      () => void refresh(true),
      Math.min(delay, 2_147_000_000),
    );
    return () => window.clearTimeout(timer);
  }, [data?.nextWakeAt, refresh]);
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) void refresh(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const action = async (value: string) => {
    if (!data?.currentTask) return;
    setBusy(true);
    try {
      await api(`/tasks/${data.currentTask.id}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action: value }),
      });
      await refresh(true);
    } catch (reason) {
      toast({
        status: 'error',
        title: reason instanceof Error ? reason.message : String(reason),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <Box mb={5}>
        <Heading size="lg">GTD</Heading>
        <Text fontSize="sm" color="shadcn.mutedForeground">
          {data?.identity.displayName || 'Загрузка…'}
        </Text>
      </Box>

      {error && (
        <Alert status="error" mb={4}>
          <AlertIcon />
          {error}
        </Alert>
      )}

      {busy && !data ? (
        <Flex justify="center" py={24}>
          <Spinner />
        </Flex>
      ) : (
        <TaskCard
          task={data?.currentTask || null}
          busy={busy}
          onAction={action}
          onEdit={edit.onOpen}
          onHistory={history.onOpen}
          onRefresh={() => refresh(true)}
        />
      )}

      <Flex gap={2} mt={4} align="center">
        <Select
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          flex="1"
          minW={0}
        >
          <option value="all">Все задачи</option>
          <option value="today">Сегодня</option>
          <option value="inbox">Входящие</option>
          {data?.projects
            .filter((project) => !project.archived)
            .map((project) => (
              <option value={`project:${project.id}`} key={project.id}>
                {project.name}
              </option>
            ))}
        </Select>
        <IconButton
          aria-label="Проекты"
          title="Проекты"
          variant="outline"
          icon={<IconFolder />}
          onClick={projects.onOpen}
        />
        <IconButton
          aria-label="Новая задача"
          title="Новая задача"
          variant="primary"
          icon={<IconPlus />}
          onClick={create.onOpen}
        />
        <IconButton
          aria-label="Архив"
          title="Архив"
          variant="outline"
          icon={<IconArchive />}
          onClick={archive.onOpen}
        />
        <IconButton
          aria-label="Настройки"
          title="Настройки"
          variant="outline"
          icon={<IconMore />}
          onClick={settings.onOpen}
        />
      </Flex>

      <CreateTaskModal
        disclosure={create}
        projects={data?.projects || []}
        onCreated={() => refresh(true)}
      />
      <EditTaskModal
        disclosure={edit}
        task={data?.currentTask || null}
        projects={data?.projects || []}
        onSaved={() => refresh(true)}
      />
      <ProjectsModal
        disclosure={projects}
        projects={data?.projects || []}
        onChanged={() => {
          if (scope === 'all') void refresh(true);
          else setScope('all');
        }}
      />
      <ArchiveModal disclosure={archive} />
      <HistoryModal disclosure={history} task={data?.currentTask || null} />
      <SettingsModal
        disclosure={settings}
        identity={data?.identity || null}
        onLinked={() => refresh(true)}
      />
    </PageShell>
  );
}

function TaskCard(props: {
  task: Task | null;
  busy: boolean;
  onAction: (action: string) => void;
  onEdit: () => void;
  onHistory: () => void;
  onRefresh: () => Promise<void> | void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const task = props.task;

  useEffect(() => {
    setSnoozeOpen(false);
  }, [task?.id]);

  const runAction = (value: string) => {
    setSnoozeOpen(false);
    props.onAction(value);
  };

  const upload = async (files: FileList | null) => {
    if (!files || !task) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        await api(`/tasks/${task.id}/attachments`, {
          method: 'POST',
          body: form,
        });
      }
      await props.onRefresh();
    } catch (reason) {
      toast({
        status: 'error',
        title: reason instanceof Error ? reason.message : String(reason),
      });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  if (!task) {
    return (
      <Panel>
        <Stack
          align="center"
          textAlign="center"
          py={{ base: 12, md: 20 }}
          spacing={3}
        >
          <Text fontSize="3xl">✓</Text>
          <Heading size="md">Сейчас ничего нет</Heading>
          <Text color="shadcn.mutedForeground">
            Все доступные задачи обработаны или отложены.
          </Text>
        </Stack>
      </Panel>
    );
  }

  return (
    <Panel>
      <Box mb={6}>
        <Flex align="center" gap={2} mb={3} wrap="wrap">
          <Badge>{task.project?.name || 'Входящие'}</Badge>
          {task.dueDate && (
            <Text
              fontSize="xs"
              color={
                isDueOverdue(task.dueDate)
                  ? 'shadcn.destructive'
                  : 'shadcn.mutedForeground'
              }
              opacity={isDueOverdue(task.dueDate) ? 0.85 : 0.75}
            >
              {isDueOverdue(task.dueDate)
                ? `просрочено · ${formatDueDate(task.dueDate)}`
                : isDueToday(task.dueDate)
                  ? `сегодня · ${formatDueDate(task.dueDate)}`
                  : `до ${formatDueDate(task.dueDate)}`}
            </Text>
          )}
        </Flex>
        <Text
          fontSize={{ base: '2xl', md: '3xl' }}
          fontWeight="semibold"
          whiteSpace="pre-wrap"
          overflowWrap="anywhere"
          lineHeight="short"
        >
          {task.content}
        </Text>
      </Box>

      {task.attachments.length > 0 && (
        <Box mb={5}>
          <AttachmentsList attachments={task.attachments} />
        </Box>
      )}

      <Flex wrap="wrap" gap={2} mb={5}>
        <IconButton
          aria-label="Редактировать"
          title="Редактировать"
          size="sm"
          variant="ghost"
          icon={<IconEdit />}
          onClick={props.onEdit}
        />
        <IconButton
          aria-label="История"
          title="История"
          size="sm"
          variant="ghost"
          icon={<IconHistory />}
          onClick={props.onHistory}
        />
        <IconButton
          aria-label="Прикрепить"
          title="Прикрепить"
          size="sm"
          variant="ghost"
          icon={<IconPaperclip />}
          onClick={() => fileInput.current?.click()}
          isLoading={uploading}
        />
        <input
          ref={fileInput}
          hidden
          type="file"
          multiple
          accept={ATTACH_ACCEPT}
          onChange={(event) => void upload(event.target.files)}
        />
      </Flex>

      <Divider mb={5} />
      <Stack spacing={2}>
        <Flex gap={2} width="100%">
          <IconButton
            flex="1"
            minW="40px"
            aria-label="Выполнено"
            title="Выполнено"
            variant="success"
            icon={<IconCheck />}
            onClick={() => runAction('COMPLETE')}
            isDisabled={props.busy}
          />
          <IconButton
            flex="1"
            minW="40px"
            aria-label="Не сейчас"
            title="Не сейчас"
            variant="outline"
            icon={<IconSkip />}
            onClick={() => runAction('ROTATE')}
            isDisabled={props.busy}
          />
          <IconButton
            flex="1"
            minW="40px"
            aria-label="Отложить"
            title="Отложить"
            variant="outline"
            bg={snoozeOpen ? 'shadcn.muted' : undefined}
            icon={<IconClock />}
            onClick={() => setSnoozeOpen((open) => !open)}
            isDisabled={props.busy}
            aria-expanded={snoozeOpen}
          />
          <IconButton
            flex="1"
            minW="40px"
            aria-label="Отменить"
            title="Отменить"
            variant="outline"
            color="shadcn.destructive"
            borderColor="shadcn.destructive"
            icon={<IconX />}
            onClick={() => runAction('CANCEL')}
            isDisabled={props.busy}
          />
        </Flex>
        <Box
          overflow="hidden"
          maxH={snoozeOpen ? '220px' : '0'}
          opacity={snoozeOpen ? 1 : 0}
          transition="max-height 0.2s ease, opacity 0.15s ease"
        >
          <Stack
            spacing={2}
            p={2}
            borderWidth="1px"
            borderColor="shadcn.border"
            borderRadius="md"
            bg="shadcn.muted"
          >
            {(
              [
                {
                  label: 'Час',
                  options: [
                    ['SNOOZE_HOUR', '1'],
                    ['SNOOZE_HOURS_2', '2'],
                    ['SNOOZE_HOURS_4', '4'],
                    ['SNOOZE_EVENING', 'Вечер'],
                  ],
                },
                {
                  label: 'День',
                  options: [
                    ['SNOOZE_TOMORROW', 'Завтра'],
                    ['SNOOZE_DAYS_2', '2'],
                    ['SNOOZE_DAYS_7', '7'],
                    ['SNOOZE_DAYS_14', '14'],
                    ['SNOOZE_DAYS_30', '30'],
                  ],
                },
                {
                  label: 'Нед',
                  options: [
                    ['SNOOZE_MONDAY', 'Пн'],
                    ['SNOOZE_TUESDAY', 'Вт'],
                    ['SNOOZE_WEDNESDAY', 'Ср'],
                    ['SNOOZE_THURSDAY', 'Чт'],
                    ['SNOOZE_FRIDAY', 'Пт'],
                    ['SNOOZE_SATURDAY', 'Сб'],
                    ['SNOOZE_SUNDAY', 'Вс'],
                  ],
                },
              ] as const
            ).map((group) => (
              <Flex key={group.label} align="center" gap={1} wrap="wrap">
                <Text
                  fontSize="xs"
                  color="shadcn.mutedForeground"
                  minW="32px"
                  flexShrink={0}
                >
                  {group.label}
                </Text>
                {group.options.map(([action, label]) => (
                  <Button
                    key={action}
                    size="sm"
                    variant="ghost"
                    fontWeight="normal"
                    minW="auto"
                    px={2}
                    onClick={() => runAction(action)}
                    isDisabled={props.busy}
                  >
                    {label}
                  </Button>
                ))}
              </Flex>
            ))}
          </Stack>
        </Box>
      </Stack>
    </Panel>
  );
}

function CreateTaskModal({
  disclosure,
  projects,
  onCreated,
}: {
  disclosure: ReturnType<typeof useDisclosure>;
  projects: Project[];
  onCreated: () => void;
}) {
  const [content, setContent] = useState('');
  const [projectId, setProjectId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const submit = async () => {
    setBusy(true);
    try {
      const task = await api<Task>('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          content,
          projectId: projectId || null,
          dueDate: dueDate || null,
        }),
      });
      for (const file of files.slice(0, 10)) {
        const form = new FormData();
        form.append('file', file);
        await api(`/tasks/${task.id}/attachments`, {
          method: 'POST',
          body: form,
        });
      }
      setContent('');
      setProjectId('');
      setDueDate('');
      setFiles([]);
      if (fileInput.current) fileInput.current.value = '';
      disclosure.onClose();
      onCreated();
    } catch (reason) {
      toast({
        status: 'error',
        title: reason instanceof Error ? reason.message : String(reason),
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen={disclosure.isOpen} onClose={disclosure.onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Новая задача</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={4}>
            <FormControl>
              <FormLabel>Что нужно сделать?</FormLabel>
              <Textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                autoFocus
              />
            </FormControl>
            <FormControl>
              <FormLabel>Проект</FormLabel>
              <Select
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                <option value="">Входящие</option>
                {projects
                  .filter((project) => !project.archived)
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>Дедлайн</FormLabel>
              <Input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Вложения</FormLabel>
              <Stack spacing={2}>
                <Flex gap={2} align="center" wrap="wrap">
                  <Button
                    variant="outline"
                    onClick={() => fileInput.current?.click()}
                  >
                    Выбрать файлы
                  </Button>
                  {files.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFiles([]);
                        if (fileInput.current) fileInput.current.value = '';
                      }}
                    >
                      Очистить
                    </Button>
                  )}
                </Flex>
                <input
                  ref={fileInput}
                  hidden
                  type="file"
                  multiple
                  accept={ATTACH_ACCEPT}
                  onChange={(event) =>
                    setFiles(Array.from(event.target.files || []).slice(0, 10))
                  }
                />
                <Text fontSize="sm" color="shadcn.mutedForeground">
                  {files.length === 0
                    ? 'Файлы не выбраны'
                    : files.length === 1
                      ? files[0]?.name || '1 файл'
                      : `Выбрано файлов: ${files.length}`}
                </Text>
              </Stack>
            </FormControl>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={2} onClick={disclosure.onClose}>
            Закрыть
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            isLoading={busy}
            isDisabled={!content.trim()}
          >
            Создать
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function EditTaskModal({
  disclosure,
  task,
  projects,
  onSaved,
}: {
  disclosure: ReturnType<typeof useDisclosure>;
  task: Task | null;
  projects: Project[];
  onSaved: () => void;
}) {
  const [content, setContent] = useState('');
  const [projectId, setProjectId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const toast = useToast();
  useEffect(() => {
    if (disclosure.isOpen && task) {
      setContent(task.content);
      setProjectId(task.projectId || '');
      setDueDate(dueDateInputValue(task.dueDate));
    }
  }, [disclosure.isOpen, task]);
  const save = async () => {
    if (!task) return;
    try {
      await api(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          content,
          projectId: projectId || null,
          dueDate: dueDate || null,
        }),
      });
      disclosure.onClose();
      onSaved();
    } catch (reason) {
      toast({
        status: 'error',
        title: reason instanceof Error ? reason.message : String(reason),
      });
    }
  };
  return (
    <Modal isOpen={disclosure.isOpen} onClose={disclosure.onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Редактировать задачу</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={4}>
            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
            <Select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">Входящие</option>
              {projects
                .filter(
                  (project) =>
                    !project.archived || project.id === task?.projectId,
                )
                .map((project) => (
                  <option
                    key={project.id}
                    value={project.id}
                    disabled={project.archived}
                  >
                    {project.name}
                    {project.archived ? ' — архив' : ''}
                  </option>
                ))}
            </Select>
            <FormControl>
              <FormLabel>Дедлайн</FormLabel>
              <Flex gap={2}>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
                {dueDate && (
                  <Button
                    variant="ghost"
                    onClick={() => setDueDate('')}
                    flexShrink={0}
                  >
                    Сбросить
                  </Button>
                )}
              </Flex>
            </FormControl>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button onClick={save} variant="primary">
            Сохранить
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function ProjectsModal({
  disclosure,
  projects,
  onChanged,
}: {
  disclosure: ReturnType<typeof useDisclosure>;
  projects: Project[];
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [renameTarget, setRenameTarget] = useState<Project | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const toast = useToast();
  const create = async () => {
    try {
      await api('/projects', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setName('');
      onChanged();
    } catch (reason) {
      toast({
        status: 'error',
        title: reason instanceof Error ? reason.message : String(reason),
      });
    }
  };
  const update = async (project: Project, patch: Record<string, unknown>) => {
    try {
      await api(`/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      onChanged();
    } catch (reason) {
      toast({
        status: 'error',
        title: reason instanceof Error ? reason.message : String(reason),
      });
    }
  };
  const openRename = (project: Project) => {
    setRenameTarget(project);
    setRenameValue(project.name);
  };
  const closeRename = () => {
    setRenameTarget(null);
    setRenameValue('');
  };
  const saveRename = async () => {
    if (!renameTarget) return;
    const next = renameValue.trim();
    if (!next || next === renameTarget.name) {
      closeRename();
      return;
    }
    await update(renameTarget, { name: next });
    closeRename();
  };
  return (
    <>
      <Modal isOpen={disclosure.isOpen} onClose={disclosure.onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Проекты</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={3}>
              <Flex gap={2}>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Новый проект"
                />
                <Button onClick={create} isDisabled={!name.trim()}>
                  Создать
                </Button>
              </Flex>
              <Divider />
              {projects.map((project) => (
                <Flex key={project.id} align="center" gap={2}>
                  <Text
                    flex="1"
                    color={
                      project.archived ? 'shadcn.mutedForeground' : undefined
                    }
                  >
                    {project.name}
                  </Text>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => openRename(project)}
                  >
                    Переименовать
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      void update(project, { archived: !project.archived })
                    }
                  >
                    {project.archived ? 'Вернуть' : 'В архив'}
                  </Button>
                </Flex>
              ))}
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button onClick={disclosure.onClose}>Готово</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Modal isOpen={Boolean(renameTarget)} onClose={closeRename}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Название проекта</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void saveRename();
                }
              }}
              autoFocus
            />
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={closeRename}>
              Отмена
            </Button>
            <Button
              variant="primary"
              onClick={() => void saveRename()}
              isDisabled={!renameValue.trim()}
            >
              OK
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

function ArchiveModal({
  disclosure,
}: {
  disclosure: ReturnType<typeof useDisclosure>;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailsById, setDetailsById] = useState<
    Record<string, TaskDetails>
  >({});
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!disclosure.isOpen) {
      setExpandedId(null);
      return;
    }
    setLoading(true);
    setExpandedId(null);
    api<{ tasks: Task[] }>(
      `/archive${status === 'all' ? '' : `?status=${status}`}`,
    )
      .then((result) => setTasks(result.tasks))
      .finally(() => setLoading(false));
  }, [disclosure.isOpen, status]);

  const loadHistory = (taskId: string) => {
    if (detailsById[taskId] || historyLoadingId === taskId) return;
    setHistoryLoadingId(taskId);
    void api<TaskDetails>(`/tasks/${taskId}`)
      .then((details) =>
        setDetailsById((prev) => ({ ...prev, [taskId]: details })),
      )
      .finally(() =>
        setHistoryLoadingId((current) => (current === taskId ? null : current)),
      );
  };

  const expandedIndex = expandedId
    ? tasks.findIndex((task) => task.id === expandedId)
    : -1;

  return (
    <Modal isOpen={disclosure.isOpen} onClose={disclosure.onClose} size="xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Архив</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            mb={4}
          >
            <option value="all">Все</option>
            <option value="COMPLETED">Выполненные</option>
            <option value="CANCELED">Отменённые</option>
          </Select>
          {loading ? (
            <Spinner />
          ) : tasks.length === 0 ? (
            <Text color="shadcn.mutedForeground">Архив пуст</Text>
          ) : (
            <Accordion
              allowToggle
              index={expandedIndex}
              onChange={(index) => {
                const nextIndex = typeof index === 'number' ? index : -1;
                if (nextIndex < 0) {
                  setExpandedId(null);
                  return;
                }
                const task = tasks[nextIndex];
                if (!task) {
                  setExpandedId(null);
                  return;
                }
                setExpandedId(task.id);
                loadHistory(task.id);
              }}
            >
              {tasks.map((task) => {
                const details = detailsById[task.id];
                const isExpanded = expandedId === task.id;
                const historyLoading = historyLoadingId === task.id;
                let historyContent: React.ReactNode = null;
                if (isExpanded) {
                  if (historyLoading && !details) {
                    historyContent = <Spinner size="sm" />;
                  } else if (details) {
                    historyContent = <TaskHistoryPanel details={details} />;
                  } else {
                    historyContent = (
                      <Text fontSize="sm" color="shadcn.mutedForeground">
                        Не удалось загрузить историю
                      </Text>
                    );
                  }
                }
                return (
                  <AccordionItem key={task.id} borderColor="shadcn.border">
                    <AccordionButton
                      px={0}
                      py={3}
                      _hover={{ bg: 'transparent' }}
                      alignItems="flex-start"
                    >
                      <Box flex="1" textAlign="left" minW={0} pr={2}>
                        <Badge
                          mb={1}
                          variant={
                            task.status === 'COMPLETED'
                              ? 'success'
                              : 'destructive'
                          }
                        >
                          {task.status === 'COMPLETED'
                            ? 'Выполнено'
                            : 'Отменено'}
                        </Badge>
                        <Text whiteSpace="pre-wrap">{task.content}</Text>
                        <Text
                          fontSize="xs"
                          color="shadcn.mutedForeground"
                          mt={2}
                        >
                          {formatDate(task.updatedAt)}
                        </Text>
                      </Box>
                      <AccordionIcon mt={1} flexShrink={0} />
                    </AccordionButton>
                    {task.attachments.length > 0 && (
                      <Box px={0} pb={3}>
                        <AttachmentsList
                          attachments={task.attachments}
                          compact
                        />
                      </Box>
                    )}
                    <AccordionPanel px={0} pb={4} pt={0}>
                      {historyContent}
                    </AccordionPanel>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </ModalBody>
        <ModalFooter>
          <Button onClick={disclosure.onClose}>Закрыть</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function TaskHistoryPanel({ details }: { details: TaskDetails }) {
  return (
    <Stack spacing={4}>
      <Flex gap={2} wrap="wrap">
        <Badge>Отложено: {details.stats.snoozed}</Badge>
        <Badge>Не сейчас: {details.stats.rotated}</Badge>
      </Flex>
      {details.events.map((event) => (
        <Box
          key={event.id}
          borderLeft="2px solid"
          borderColor="shadcn.border"
          pl={3}
        >
          <Text fontWeight="semibold">{eventName(event.type)}</Text>
          <Text fontSize="sm" color="shadcn.mutedForeground">
            {formatDate(event.createdAt)}
          </Text>
        </Box>
      ))}
    </Stack>
  );
}

function HistoryModal({
  disclosure,
  task,
}: {
  disclosure: ReturnType<typeof useDisclosure>;
  task: Task | null;
}) {
  const [details, setDetails] = useState<TaskDetails | null>(null);
  useEffect(() => {
    if (disclosure.isOpen && task)
      void api<TaskDetails>(`/tasks/${task.id}`).then(setDetails);
    else setDetails(null);
  }, [disclosure.isOpen, task]);
  return (
    <Modal isOpen={disclosure.isOpen} onClose={disclosure.onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>История задачи</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {!details ? <Spinner /> : <TaskHistoryPanel details={details} />}
        </ModalBody>
        <ModalFooter>
          <Button onClick={disclosure.onClose}>Закрыть</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function SettingsModal({
  disclosure,
  identity,
  onLinked,
}: {
  disclosure: ReturnType<typeof useDisclosure>;
  identity: Bootstrap['identity'] | null;
  onLinked: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const link = async () => {
    setBusy(true);
    try {
      const result = await api<{ linked: boolean; authUrl: string | null }>(
        '/link/start',
        { method: 'POST' },
      );
      if (result.linked) {
        onLinked();
        return;
      }
      if (result.authUrl) {
        if (window.Telegram?.WebApp?.openLink)
          window.Telegram.WebApp.openLink(result.authUrl);
        else window.open(result.authUrl, '_blank', 'noopener');
      }
    } catch (reason) {
      toast({
        status: 'error',
        title: reason instanceof Error ? reason.message : String(reason),
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen={disclosure.isOpen} onClose={disclosure.onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Настройки</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={4}>
            <IdentityRow
              label="Текущий вход"
              value={identity?.provider === 'TELEGRAM' ? 'Telegram' : 'Google'}
            />
            <IdentityRow label="Аккаунт" value={identity?.displayName || '—'} />
            <IdentityRow
              label="Связь"
              value={
                identity?.linked
                  ? 'Google и Telegram связаны'
                  : 'Независимое пространство'
              }
            />
            {identity?.provider === 'TELEGRAM' && !identity.linked && (
              <Button onClick={link} isLoading={busy} variant="primary">
                Привязать Google
              </Button>
            )}
            <Text fontSize="sm" color="shadcn.mutedForeground">
              Привязка опциональна. Без неё приложение продолжает работать
              самостоятельно.
            </Text>
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button onClick={disclosure.onClose}>Закрыть</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <Flex justify="space-between" gap={4}>
      <Text color="shadcn.mutedForeground">{label}</Text>
      <Text fontWeight="semibold" textAlign="right">
        {value}
      </Text>
    </Flex>
  );
}

function eventName(type: string) {
  return (
    (
      {
        CREATED: 'Задача создана',
        UPDATED: 'Текст изменён',
        PROJECT_CHANGED: 'Проект изменён',
        SNOOZED: 'Задача отложена',
        ROTATED: 'Перемещена в конец',
        COMPLETED: 'Выполнена',
        CANCELED: 'Отменена',
        ATTACHMENT_ADDED: 'Добавлено вложение',
      } as Record<string, string>
    )[type] || type
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <Box
      minH="100vh"
      bg="shadcn.background"
      color="shadcn.foreground"
      px={{ base: 4, md: 8 }}
      pt={{ base: 'max(20px, env(safe-area-inset-top))', md: 8 }}
      pb={{ base: 'max(24px, env(safe-area-inset-bottom))', md: 8 }}
    >
      <Box maxW="760px" mx="auto">
        {children}
      </Box>
    </Box>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <Box
      border="1px solid"
      borderColor="shadcn.border"
      borderRadius="lg"
      bg="shadcn.card"
      color="shadcn.cardForeground"
      p={{ base: 5, md: 7 }}
      shadow="sm"
    >
      {children}
    </Box>
  );
}
