import {
  Camera,
  Check,
  ChevronDown,
  ImagePlus,
  Music2,
  Pause,
  Play,
  TrendingUp,
  Radio,
  Upload,
  Video,
  Sparkles,
  Save,
  Send,
  Languages,
  Mic2,
  Lightbulb,
  LoaderCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useBackgroundUpload } from "../components/BackgroundUpload";
import usePageMeta from "../hooks/usePageMeta";
import { startLiveSession, type ZivoLiveSession } from "../lib/live";
import { createPost } from "../lib/posts";
import { profileKey, readStoredProfile, profileUpdatedEvent, type StoredProfile } from "../lib/profiles";
import { loadCreatorAiDraft, saveCreatorAiDraft, type ZivoShortIdea } from "../lib/creatorAiDrafts";
import { loadSmartShortPlan, type ZivoSmartShortPlan } from "../lib/smartShorts";
import { zivoLanguages, type ZivoContentTranslation } from "../lib/contentLanguages";
import { createStory } from "../lib/stories";
import { cn } from "../lib/utils";
import { validateHashtags, validateText } from "../lib/textSafety";

type MediaType = "photo" | "short" | "video" | "story" | "live";

type LocalMediaPreview = {
  kind: "image" | "video";
  url: string;
  revoke: () => void;
};

type SelectedMedia = {
  file: File;
  preview: LocalMediaPreview;
  durationSeconds?: number;
};

type VideoDraft = {
  file: File;
  objectUrl: string;
  title: string;
  description: string;
  visibility: "Public" | "Followers" | "Private";
};

type UploadedMedia = { filename: string; url: string; size: number; contentType: string };

type VideoUploadDiagnostic = {
  stage: "idle" | "selecting" | "uploading" | "complete" | "error";
  pipelineStage:
    | "IDLE"
    | "SELECTED"
    | "UPLOADING"
    | "UPLOAD_COMPLETE"
    | "PROCESSING"
    | "MEDIA_READY"
    | "DATABASE_SAVE"
    | "PUBLISHED"
    | "FAILED";
  fileName?: string;
  fileSize?: number;
  contentType?: string;
  progress?: number;
  errorMessage?: string;
  updatedAt: number;
};

function formatFileSize(size?: number) {
  return typeof size === "number" ? `${(size / (1024 * 1024)).toFixed(2)} MB` : "Unknown size";
}

function normalizeUploadedVideo(candidate: unknown, sourceFile: File | null): UploadedMedia | null {
  if (!candidate || typeof candidate !== "object") return null;
  const value = candidate as Record<string, unknown>;
  if (typeof value.url !== "string" || !value.url.trim()) return null;
  return {
    filename: typeof value.filename === "string" ? value.filename : sourceFile?.name || "zivo-video",
    url: value.url,
    size: typeof value.size === "number" ? value.size : sourceFile?.size || 0,
    contentType: typeof value.contentType === "string" ? value.contentType : sourceFile?.type || "video/mp4",
  };
}

function completedVideoFromUploadEvent(detail: unknown, sourceFile: File | null) {
  const value = detail as { files?: unknown[] } | null;
  return normalizeUploadedVideo(value?.files?.[0] ?? detail, sourceFile);
}

function uploadEventErrorMessage(detail: unknown) {
  return detail && typeof detail === "object" && "message" in detail && typeof detail.message === "string"
    ? detail.message
    : null;
}

function isRetryableStorageError(error: unknown) {
  return /network|fetch|connection|socket|offline|gateway|service/i.test(
    error instanceof Error ? error.message : String(error),
  );
}

function videoUploadErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function localMediaFromFile(file: File) {
  const uploaded = await window.genmb.storage.upload(file, { folder: "zivo-media" });
  return { filename: uploaded.filename, url: uploaded.url, size: uploaded.size, contentType: uploaded.contentType };
}

function readVideoDuration(objectUrl: string, onDuration: (duration: number) => void) {
  const metadataVideo = document.createElement("video");
  metadataVideo.preload = "metadata";
  metadataVideo.onloadedmetadata = () => {
    if (Number.isFinite(metadataVideo.duration) && metadataVideo.duration >= 0) onDuration(metadataVideo.duration);
    metadataVideo.removeAttribute("src");
    metadataVideo.load();
  };
  metadataVideo.onerror = () => {
    metadataVideo.removeAttribute("src");
    metadataVideo.load();
  };
  metadataVideo.src = objectUrl;
}

function makeLocalPreview(file: File): LocalMediaPreview {
  const objectUrl = URL.createObjectURL(file);
  return {
    kind: file.type.startsWith("image/") ? "image" : "video",
    url: objectUrl,
    revoke: () => URL.revokeObjectURL(objectUrl),
  };
}

function toVideoVisibility(value: string): "Public" | "Followers" | "Private" {
  return value === "Followers" || value === "Private" ? value : "Public";
}

function toSuggestionList(text: string, limit = 5) {
  const suggestions = text
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
        .replace(/^['\"]|['\"]$/g, "")
        .trim(),
    )
    .filter(Boolean);
  return [...new Set(suggestions)].slice(0, limit);
}

function toHashtagList(text: string) {
  const matches = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return [...new Set(matches.map((tag) => tag.toLowerCase()))].slice(0, 8);
}

function parseShortIdeas(text: string): ZivoShortIdea[] {
  const json = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error("The AI response did not include Short ideas in the expected format.");
  const ideas = parsed
    .flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const idea = item as Record<string, unknown>;
      if (
        typeof idea.hook !== "string" ||
        typeof idea.title !== "string" ||
        typeof idea.concept !== "string" ||
        typeof idea.duration !== "string" ||
        typeof idea.keyMoment !== "string"
      )
        return [];
      return [
        {
          hook: idea.hook.trim(),
          title: idea.title.trim(),
          concept: idea.concept.trim(),
          duration: idea.duration.trim(),
          keyMoment: idea.keyMoment.trim(),
        },
      ];
    })
    .filter((idea) => idea.hook && idea.title && idea.concept && idea.duration && idea.keyMoment);
  if (!ideas.length) throw new Error("The AI response did not include usable Short ideas. Try again.");
  return ideas.slice(0, 4);
}

function formatUploadDiagnostic(diagnostic: VideoUploadDiagnostic) {
  const parts = [
    `Stage: ${diagnostic.pipelineStage}`,
    diagnostic.fileName ? `File: ${diagnostic.fileName}` : "",
    diagnostic.fileSize !== undefined ? `Size: ${formatFileSize(diagnostic.fileSize)}` : "",
    diagnostic.contentType ? `Type: ${diagnostic.contentType}` : "",
    diagnostic.progress !== undefined ? `Progress: ${diagnostic.progress}%` : "",
    diagnostic.errorMessage ? `Message: ${diagnostic.errorMessage}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

const creationOptions: Array<{
  id: MediaType;
  label: string;
  detail: string;
  icon: typeof ImagePlus;
}> = [
  { id: "photo", label: "Photo", detail: "Share a single moment", icon: ImagePlus },
  { id: "short", label: "Short Video", detail: "Vertical video for quick moments", icon: Play },
  { id: "video", label: "Long Video", detail: "Stories with more to say", icon: Video },
  { id: "story", label: "Story", detail: "A quick update for followers", icon: Camera },
  { id: "live", label: "Go Live", detail: "Start a live session", icon: Radio },
];

type TrendingSound = {
  id: string;
  title: string;
  artist: string;
  uses: string;
  artwork: string;
  artworkSubject: string;
};

const trendingSounds: TrendingSound[] = [
  {
    id: "neon-tide",
    title: "Neon Tide",
    artist: "Luna Vale",
    uses: "18.4K creations",
    artwork: "https://picsum.photos/seed/zivo-neon-tide/128/128",
    artworkSubject: "Neon Tide abstract album artwork",
  },
  {
    id: "slow-bloom",
    title: "Slow Bloom",
    artist: "Arden Gray",
    uses: "12.8K creations",
    artwork: "https://picsum.photos/seed/zivo-slow-bloom/128/128",
    artworkSubject: "Slow Bloom floral album artwork",
  },
  {
    id: "afterglow-drive",
    title: "Afterglow Drive",
    artist: "Milo North",
    uses: "9.6K creations",
    artwork: "https://picsum.photos/seed/zivo-afterglow-drive/128/128",
    artworkSubject: "Afterglow Drive sunset album artwork",
  },
  {
    id: "weekend-spark",
    title: "Weekend Spark",
    artist: "The Daybreaks",
    uses: "7.2K creations",
    artwork: "https://picsum.photos/seed/zivo-weekend-spark/128/128",
    artworkSubject: "Weekend Spark colorful album artwork",
  },
];

export default function CreatePage() {
  const [mediaType, setMediaType] = useState<MediaType>("short");
  const [visibility, setVisibility] = useState("Public");
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(null);
  const [videoThumbnail, setVideoThumbnail] = useState("");
  const thumbnailAttemptRef = useRef(0);
  const [videoDraft, setVideoDraft] = useState<VideoDraft | null>(null);
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [videoDurationSeconds, setVideoDurationSeconds] = useState<number | undefined>(undefined);
  const [uploadedVideo, setUploadedVideo] = useState<{
    filename: string;
    url: string;
    size: number;
    contentType: string;
  } | null>(null);
  const [isVideoUploading, setIsVideoUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoUploadDiagnostic, setVideoUploadDiagnostic] = useState<VideoUploadDiagnostic>({
    stage: "idle",
    pipelineStage: "IDLE",
    updatedAt: Date.now(),
  });
  const [title, setTitle] = useState("");
  const [contentTitle, setContentTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creatorTopic, setCreatorTopic] = useState("");
  const [captionSuggestions, setCaptionSuggestions] = useState<string[]>([]);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [descriptionSuggestions, setDescriptionSuggestions] = useState<string[]>([]);
  const [hashtagSuggestions, setHashtagSuggestions] = useState<string[]>([]);
  const [shortIdeas, setShortIdeas] = useState<ZivoShortIdea[]>([]);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantResponse, setAssistantResponse] = useState("");
  const [primaryLanguageCode, setPrimaryLanguageCode] = useState("en");
  const [translationTargetCode, setTranslationTargetCode] = useState("hi");
  const [translationDraft, setTranslationDraft] = useState<ZivoContentTranslation | null>(null);
  const [dubbingTargetCode, setDubbingTargetCode] = useState("hi");
  const [aiLoadingTask, setAiLoadingTask] = useState<
    "caption" | "title" | "description" | "hashtags" | "shorts" | "assistant" | "translation" | "save" | null
  >(null);
  const [aiError, setAiError] = useState("");
  const [aiStatus, setAiStatus] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [selectedSoundId, setSelectedSoundId] = useState<string | null>(null);
  const [previewingSoundId, setPreviewingSoundId] = useState<string | null>(null);
  const [isPublishingStory, setIsPublishingStory] = useState(false);
  const [storyStatus, setStoryStatus] = useState("");
  const [storyError, setStoryError] = useState("");
  const [isPublishingPost, setIsPublishingPost] = useState(false);
  const [isPrivacyConfirmOpen, setIsPrivacyConfirmOpen] = useState(false);
  const [postStatus, setPostStatus] = useState("");
  const [postError, setPostError] = useState("");
  const [publishingProfile, setPublishingProfile] = useState<StoredProfile | null>(null);
  const [channelLoading, setChannelLoading] = useState(false);
  const [channelError, setChannelError] = useState("");
  const [publishAsChannel, setPublishAsChannel] = useState(false);
  const [liveCategory, setLiveCategory] = useState("");
  const [liveSession, setLiveSession] = useState<ZivoLiveSession | null>(null);
  const [isStartingLive, setIsStartingLive] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [smartShortPlan, setSmartShortPlan] = useState<ZivoSmartShortPlan | null>(null);
  const [smartShortNotice, setSmartShortNotice] = useState("");
  const postSubmissionRef = useRef<string | null>(null);
  const postIdempotencyKeyRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploaderRef = useRef<HTMLElement>(null);
  const selectedVideoFileRef = useRef<File | null>(null);
  const videoUploadFileRef = useRef<File | null>(null);
  const uploadProgressRef = useRef(0);
  const videoUploadAttemptRef = useRef(0);
  const isSdkVideoUploadActiveRef = useRef(false);
  const uploaderRecoveryFileRef = useRef<File | null>(null);
  const { user, loading: isAuthLoading } = useAuth();
  const backgroundUpload = useBackgroundUpload();
  const navigate = useNavigate();
  const location = useLocation();

  usePageMeta(
    "Create on ZIVO — Social Video Foundation",
    "Draft your next ZIVO post with the creator upload interface.",
  );

  const selectedOption = creationOptions.find((option) => option.id === mediaType) ?? creationOptions[1];
  const selectedSound = trendingSounds.find((sound) => sound.id === selectedSoundId) ?? null;
  const isVideo = mediaType === "short" || mediaType === "video";
  const isStory = mediaType === "story";
  const isLive = mediaType === "live";
  const acceptedMedia = mediaType === "photo" || mediaType === "story" ? "image/*" : "video/*";

  useEffect(() => () => selectedMedia?.preview.revoke(), [selectedMedia?.preview]);

  useEffect(() => {
    let active = true;
    const loadChannel = async () => {
      if (!user) {
        setPublishingProfile(null);
        setPublishAsChannel(false);
        return;
      }
      setChannelLoading(true);
      setChannelError("");
      try {
        const profile = readStoredProfile(await window.genmb.kv.get(profileKey(user.id)));
        if (active) {
          setPublishingProfile(profile);
          setPublishAsChannel((current) => current && Boolean(profile?.channelName));
        }
      } catch (error) {
        if (active) setChannelError(error instanceof Error ? error.message : "Could not load your channel.");
      } finally {
        if (active) setChannelLoading(false);
      }
    };
    void loadChannel();
    window.addEventListener(profileUpdatedEvent, loadChannel);
    return () => {
      active = false;
      window.removeEventListener(profileUpdatedEvent, loadChannel);
    };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    const planId = (location.state as { smartShortPlanId?: string } | null)?.smartShortPlanId;
    if (!user || !planId)
      return () => {
        active = false;
      };
    void (async () => {
      try {
        const plan = await loadSmartShortPlan(user.id, planId);
        if (!active) return;
        if (!plan || plan.status !== "ready-for-publish") {
          setSmartShortNotice("This Short plan is unavailable. You can still create a Short normally.");
          return;
        }
        setSmartShortPlan(plan);
        setMediaType("short");
        setContentTitle(plan.title);
        setTitle(plan.caption);
        setHashtags(plan.hashtags.join(" "));
        setCreatorTopic(plan.suggestedClip);
        setSmartShortNotice("Your editable Short plan is ready. Upload the clip you want to publish.");
      } catch (error) {
        if (active) setSmartShortNotice(error instanceof Error ? error.message : "Unable to open this Short plan.");
      }
    })();
    return () => {
      active = false;
    };
  }, [location.state, user]);

  useEffect(() => {
    let mounted = true;
    const hasSmartShortPlan = Boolean((location.state as { smartShortPlanId?: string } | null)?.smartShortPlanId);
    if (!user || hasSmartShortPlan)
      return () => {
        mounted = false;
      };
    void (async () => {
      try {
        const draft = await loadCreatorAiDraft(user.id);
        if (!draft || !mounted) return;
        setCreatorTopic(draft.topic);
        setContentTitle(draft.title);
        setTitle(draft.caption);
        setDescription(draft.description);
        setHashtags(draft.hashtags);
        setCaptionSuggestions(draft.captionSuggestions);
        setTitleSuggestions(draft.titleSuggestions);
        setDescriptionSuggestions(draft.descriptionSuggestions);
        setHashtagSuggestions(draft.hashtagSuggestions);
        setShortIdeas(draft.shortIdeas);
        setAssistantQuestion(draft.assistantQuestion);
        setAssistantResponse(draft.assistantResponse);
        setPrimaryLanguageCode(draft.translationFoundation.primaryLanguageCode || "en");
        setTranslationDraft(
          draft.translationFoundation.translations[0]
            ? { ...draft.translationFoundation.translations[0], status: "translated" }
            : null,
        );
        setAiStatus("Your private AI draft was restored.");
      } catch (error) {
        if (mounted) setAiError(error instanceof Error ? error.message : "Unable to load your saved AI draft.");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [location.state, user?.id]);

  const clearSelectedMedia = () => {
    thumbnailAttemptRef.current += 1;
    setVideoThumbnail("");
    setSelectedMedia((current) => {
      current?.preview.revoke();
      return null;
    });
    setVideoDraft(null);
    setSelectedVideoFile(null);
    setVideoDurationSeconds(undefined);
    postIdempotencyKeyRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  useEffect(() => {
    const uploader = uploaderRef.current;
    if (!uploader || !user || !isVideo) return;

    const updateLocalVideo = (file: File) => {
      if (selectedVideoFileRef.current === file) return;
      const objectUrl = URL.createObjectURL(file);
      const preview: LocalMediaPreview = {
        kind: "video",
        url: objectUrl,
        revoke: () => URL.revokeObjectURL(objectUrl),
      };
      selectedVideoFileRef.current = file;
      uploaderRecoveryFileRef.current = null;
      setSelectedVideoFile(file);
      setSelectedMedia({ file, preview });
      setUploadedVideo(null);
      setPostError("");
      setUploadProgress(0);
      uploadProgressRef.current = 0;
      setVideoUploadDiagnostic({
        stage: "selecting",
        pipelineStage: "SELECTED",
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type || "video/mp4",
        progress: 0,
        updatedAt: Date.now(),
      });
      if (preview.kind !== "video" || !preview.url) return;
      const metadataVideo = document.createElement("video");
      metadataVideo.preload = "metadata";
      metadataVideo.onloadedmetadata = () => {
        const durationSeconds = metadataVideo.duration;
        if (Number.isFinite(durationSeconds) && durationSeconds >= 0) {
          setVideoDurationSeconds(durationSeconds);
          setSelectedMedia((current) => (current?.file === file ? { ...current, durationSeconds } : current));
        }
        metadataVideo.removeAttribute("src");
        metadataVideo.load();
      };
      metadataVideo.onerror = () => {
        metadataVideo.removeAttribute("src");
        metadataVideo.load();
      };
      metadataVideo.src = preview.url;
    };

    const onProgress = (event: Event) => {
      if (isSdkVideoUploadActiveRef.current) return;
      const detail = (event as Event & { detail?: { percent?: unknown; file?: unknown } }).detail;
      const file = detail?.file;
      if (file instanceof File) updateLocalVideo(file);
      const percent = typeof detail?.percent === "number" ? detail.percent : 0;
      const progress = Math.min(100, Math.max(0, Math.round(percent)));
      uploadProgressRef.current = progress;
      setIsVideoUploading(progress < 100);
      setUploadProgress(progress);
      setVideoUploadDiagnostic((current) => ({
        ...current,
        stage: "uploading",
        pipelineStage: "UPLOADING",
        progress,
        updatedAt: Date.now(),
      }));
    };
    const onComplete = (event: Event) => {
      if (isSdkVideoUploadActiveRef.current) return;
      const detail = (event as Event & { detail?: unknown }).detail;
      const sourceFile = selectedVideoFileRef.current;
      // The native widget contract is `{ files: [...] }`. This also supports
      // the successful storage-route envelope used by some mobile runtimes:
      // `{ success: true, url: "..." }` (including `data` / `result` wrappers).
      const uploaded = completedVideoFromUploadEvent(detail, sourceFile);
      // GenMB Storage can return an absolute URL, a same-origin proxy path such
      // as /api/apps/..., or a relative stored-asset path. All are valid finalized
      // assets; only temporary blob/data URLs and missing results are rejected.
      if (!uploaded) {
        const responseMessage = uploadEventErrorMessage(detail);
        const message = responseMessage
          ? `Video upload failed: ${responseMessage}`
          : "Video upload failed: GenMB Storage did not return a usable stored-video URL.";
        setIsVideoUploading(false);
        setVideoUploadDiagnostic({
          stage: "error",
          pipelineStage: "FAILED",
          fileName: sourceFile?.name,
          fileSize: sourceFile?.size,
          contentType: sourceFile?.type || "video/mp4",
          progress: uploadProgressRef.current,
          errorMessage: responseMessage ?? "GenMB Storage did not return a usable video URL.",
          updatedAt: Date.now(),
        });
        setPostError(message);
        return;
      }
      setPostError("");
      setUploadedVideo(uploaded);
      setIsVideoUploading(false);
      uploadProgressRef.current = 100;
      setUploadProgress(100);
      setVideoUploadDiagnostic({
        stage: "complete",
        pipelineStage: "MEDIA_READY",
        fileName: uploaded.filename,
        fileSize: uploaded.size,
        contentType: uploaded.contentType,
        progress: 100,
        updatedAt: Date.now(),
      });
    };
    const onError = (event: Event) => {
      if (isSdkVideoUploadActiveRef.current) return;
      const detail = (event as Event & { detail?: { message?: unknown; reason?: unknown; file?: unknown } }).detail;
      const file = detail?.file instanceof File ? detail.file : selectedVideoFileRef.current;
      // Some mobile webviews emit an error before a progress event. Capture the
      // File from the error event too, so the direct SDK retry remains available.
      if (file instanceof File) updateLocalVideo(file);
      const reason = typeof detail?.reason === "string" ? detail.reason : "upload";
      const message =
        typeof detail?.message === "string" ? detail.message : "GenMB Storage could not complete the upload.";
      const canRecoverWithSdk =
        file instanceof File &&
        reason === "upload" &&
        isRetryableStorageError(message) &&
        uploaderRecoveryFileRef.current !== file;

      if (canRecoverWithSdk) {
        // The widget owns its transfer route. If that route reports a transient
        // network failure, retry once through the supported Storage SDK rather
        // than issuing a custom request or changing CORS/header behavior.
        uploaderRecoveryFileRef.current = file;
        setPostError("");
        setIsVideoUploading(false);
        setVideoUploadDiagnostic({
          stage: "uploading",
          pipelineStage: "UPLOADING",
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type || "video/mp4",
          progress: uploadProgressRef.current,
          errorMessage: "The upload connection was interrupted. Retrying securely…",
          updatedAt: Date.now(),
        });
        void uploadSelectedVideo(file);
        return;
      }

      setUploadedVideo(null);
      setIsVideoUploading(false);
      setVideoUploadDiagnostic({
        stage: "error",
        pipelineStage: "FAILED",
        fileName: file?.name,
        fileSize: file?.size,
        contentType: file?.type || "video/mp4",
        progress: uploadProgressRef.current,
        errorMessage: `${reason}: ${message}`,
        updatedAt: Date.now(),
      });
      setPostError(`Video upload failed (${reason}): ${videoUploadErrorMessage(message)}`);
    };
    const onRemoved = () => clearSelectedMedia();

    uploader.addEventListener("genmb-upload-progress", onProgress);
    uploader.addEventListener("genmb-upload-complete", onComplete);
    uploader.addEventListener("genmb-upload-error", onError);
    uploader.addEventListener("genmb-upload-removed", onRemoved);
    return () => {
      uploader.removeEventListener("genmb-upload-progress", onProgress);
      uploader.removeEventListener("genmb-upload-complete", onComplete);
      uploader.removeEventListener("genmb-upload-error", onError);
      uploader.removeEventListener("genmb-upload-removed", onRemoved);
    };
  }, [isVideo, user]);

  const uploadSelectedVideo = async (file: File): Promise<UploadedMedia | null> => {
    if (isSdkVideoUploadActiveRef.current) return null;
    if (!user) {
      setPostError("Sign in to upload a video.");
      return null;
    }

    await window.genmb.auth.ready();
    if (!window.genmb.auth.isAuthenticated() || window.genmb.auth.getUser()?.id !== user.id) {
      setPostError("Your sign-in session expired before the upload started. Sign in again and retry.");
      return null;
    }

    const uploadAttempt = ++videoUploadAttemptRef.current;
    isSdkVideoUploadActiveRef.current = true;
    setPostError("");
    setUploadedVideo(null);
    setIsVideoUploading(true);
    setUploadProgress(0);
    uploadProgressRef.current = 0;
    setVideoUploadDiagnostic({
      stage: "uploading",
      pipelineStage: "UPLOADING",
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type || "video/mp4",
      progress: 0,
      updatedAt: Date.now(),
    });
    console.info("[ZIVO video upload] UPLOADING", { name: file.name, size: file.size, type: file.type || "video/mp4" });

    try {
      // GenMB Storage owns the authenticated, resumable transfer protocol for
      // large files. Do not impose an app-level deadline: uploads over 8 MB are
      // chunked and resumed by the Storage SDK, and only a transient transport
      // failure receives one supported retry.
      let uploaded: UploadedMedia | null = null;
      for (let requestAttempt = 0; requestAttempt < 2; requestAttempt += 1) {
        try {
          uploaded = await window.genmb.storage.upload(file, {
            folder: "zivo-posts",
            onProgress: (percent) => {
              if (selectedVideoFileRef.current !== file || videoUploadAttemptRef.current !== uploadAttempt) return null;
              const progress = Math.min(100, Math.max(0, Math.round(percent)));
              uploadProgressRef.current = progress;
              setUploadProgress(progress);
              setVideoUploadDiagnostic((current) => ({
                ...current,
                stage: "uploading",
                pipelineStage: "UPLOADING",
                progress,
                updatedAt: Date.now(),
              }));
            },
          });
          break;
        } catch (error) {
          if (requestAttempt === 1 || !isRetryableStorageError(error)) throw error;
          setVideoUploadDiagnostic((current) => ({
            ...current,
            stage: "uploading",
            pipelineStage: "UPLOADING",
            errorMessage: "Connection interrupted. Retrying the supported storage upload route…",
            updatedAt: Date.now(),
          }));
        }
      }
      if (!uploaded) throw new Error("GenMB Storage did not return an upload result.");
      if (selectedVideoFileRef.current !== file || videoUploadAttemptRef.current !== uploadAttempt) return null;
      const normalizedUpload = normalizeUploadedVideo(uploaded, file);
      if (!normalizedUpload) {
        throw new Error("GenMB Storage completed without an absolute URL or stored-asset path.");
      }

      console.info("[ZIVO video upload] UPLOAD_COMPLETE", {
        filename: normalizedUpload.filename,
        url: normalizedUpload.url,
      });
      setVideoUploadDiagnostic({
        stage: "complete",
        pipelineStage: "UPLOAD_COMPLETE",
        fileName: normalizedUpload.filename,
        fileSize: normalizedUpload.size,
        contentType: normalizedUpload.contentType,
        progress: 100,
        updatedAt: Date.now(),
      });
      // The Storage result is the finalized remote asset; ZIVO does not persist the temporary blob preview URL.
      setUploadedVideo(normalizedUpload);
      setIsVideoUploading(false);
      uploadProgressRef.current = 100;
      setUploadProgress(100);
      setVideoUploadDiagnostic({
        stage: "complete",
        pipelineStage: "MEDIA_READY",
        fileName: normalizedUpload.filename,
        fileSize: normalizedUpload.size,
        contentType: normalizedUpload.contentType,
        progress: 100,
        updatedAt: Date.now(),
      });
      console.info("[ZIVO video upload] MEDIA_READY", {
        filename: normalizedUpload.filename,
        url: normalizedUpload.url,
      });
      return normalizedUpload;
    } catch (error) {
      if (selectedVideoFileRef.current !== file || videoUploadAttemptRef.current !== uploadAttempt) return null;
      const message = videoUploadErrorMessage(error);
      console.error("[ZIVO video upload] FAILED", {
        name: file.name,
        size: file.size,
        type: file.type || "video/mp4",
        error,
      });
      setUploadedVideo(null);
      setIsVideoUploading(false);
      setVideoUploadDiagnostic({
        stage: "error",
        pipelineStage: "FAILED",
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type || "video/mp4",
        progress: uploadProgressRef.current,
        errorMessage: message,
        updatedAt: Date.now(),
      });
      setPostError(`Video upload failed: ${message}`);
      return null;
    } finally {
      if (videoUploadAttemptRef.current === uploadAttempt) isSdkVideoUploadActiveRef.current = false;
    }
    return null;
  };

  const selectMedia = (file: File | undefined) => {
    if (!file) return;
    clearSelectedMedia();
    const preview = makeLocalPreview(file);
    setSelectedMedia({ file, preview });
    if (isVideo) {
      const attempt = ++thumbnailAttemptRef.current;
      const frame = document.createElement("video");
      frame.preload = "auto";
      frame.muted = true;
      frame.playsInline = true;
      frame.onloadeddata = () => {
        try {
          frame.currentTime = Number.isFinite(frame.duration) ? Math.min(0.1, frame.duration / 2) : 0;
        } catch {
          /* A first-frame preview may still be available. */
        }
      };
      frame.onseeked = () => {
        if (attempt !== thumbnailAttemptRef.current) return;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 240;
          canvas.height = Math.round((240 * frame.videoHeight) / frame.videoWidth);
          if (!canvas.height) return;
          canvas.getContext("2d")?.drawImage(frame, 0, 0, canvas.width, canvas.height);
          setVideoThumbnail(canvas.toDataURL("image/jpeg", 0.8));
        } catch {
          /* The video element remains the fallback preview. */
        }
        frame.removeAttribute("src");
        frame.load();
      };
      frame.src = preview.url;
    }
    if (isVideo) {
      // A selected video is a browser-local draft only. Its File reference and
      // stable object URL remain together until the creator explicitly publishes.
      setSelectedVideoFile(file);
      setVideoDraft({
        file,
        objectUrl: preview.url,
        title: contentTitle,
        description,
        visibility: toVideoVisibility(visibility),
      });
      readVideoDuration(preview.url, (durationSeconds) => {
        setVideoDurationSeconds(durationSeconds);
        setSelectedMedia((current) => (current?.file === file ? { ...current, durationSeconds } : current));
      });
    }
    setPostError("");
    setStoryError("");
    setPostStatus("");
    setStoryStatus("");
  };

  const selectVideoWithSystemPicker = (file: File | undefined) => {
    if (!file || isPublishingPost) return;
    selectMedia(file);
  };

  const publishPost = () => {
    if (isPublishingPost || postSubmissionRef.current) return;
    if (!user) {
      navigate("/sign-in", { state: { from: "/create" } });
      return;
    }
    try {
      validateText(contentTitle, "Video title", 120);
      validateText(title, "Caption", 500);
      validateText(description, "Description", 2000);
      validateHashtags(hashtags.split(/\s+/).filter(Boolean));
    } catch (caught) {
      setPostError(caught instanceof Error ? caught.message : "Invalid post details.");
      return;
    }
    if (isVideo) {
      if (!selectedMedia) {
        setPostError("Choose a video before saving a draft.");
        return;
      }
      backgroundUpload.start({
        file: selectedMedia.file,
        format: mediaType === "short" ? "short" : "video",
        title: contentTitle.trim(),
        caption: title.trim(),
        description,
        hashtags: hashtags.split(/\s+/).filter(Boolean),
        duration: videoDurationSeconds,
        channelId: publishAsChannel ? user.id : undefined,
        post_type: publishAsChannel ? "channel" : "personal",
      });
      clearSelectedMedia();
      setPostError("");
      setPostStatus(
        "Upload started. Track its percentage below; your private draft will appear in your profile when saved.",
      );
      return;
    }
    if (!selectedMedia || !title.trim()) {
      setPostError("Choose media and add a caption before publishing.");
      return;
    }
    setPostError("");
    setIsPrivacyConfirmOpen(true);
  };

  const confirmPublishPost = async () => {
    if (isPublishingPost || postSubmissionRef.current || !user || !selectedMedia) return;
    const submissionId = crypto.randomUUID();
    postSubmissionRef.current = submissionId;
    setIsPublishingPost(true);
    setPostError("");

    try {
      await window.genmb.auth.ready();
      if (!window.genmb.auth.isAuthenticated() || window.genmb.auth.getUser()?.id !== user.id) {
        throw new Error("Your sign-in session expired. Sign in again and retry.");
      }
      // Object URLs are preview-only. Persist the finalized Storage URL so the
      // published post remains playable after the current browser session ends.
      validateText(contentTitle, "Video title", 120);
      validateText(title, "Caption", 500, true);
      validateText(description, "Description", 2000);
      validateHashtags(hashtags.split(/\s+/).filter(Boolean));
      const media = await localMediaFromFile(isVideo && videoDraft ? videoDraft.file : selectedMedia.file);
      const post = await createPost({
        user,
        mediaType: selectedMedia.file.type.startsWith("image/") ? "photo" : "video",
        format: mediaType === "photo" ? "photo" : mediaType === "video" ? "video" : "short",
        title: contentTitle,
        caption: title,
        description,
        hashtags: hashtags.split(/\s+/).filter(Boolean),
        sound: selectedSound ? `${selectedSound.title} · ${selectedSound.artist}` : undefined,
        visibility: visibility as "Public" | "Followers" | "Private",
        media: { ...media, alt: `${title.trim()} — ${selectedMedia.file.name}` },
        videoDurationSeconds,
        idempotencyKey: postIdempotencyKeyRef.current ?? crypto.randomUUID(),
        channelId: publishAsChannel ? user.id : undefined,
        post_type: publishAsChannel ? "channel" : "personal",
      });
      postIdempotencyKeyRef.current = post.id;
      setPostStatus("Post published to Home and your profile.");
      setIsPrivacyConfirmOpen(false);
      navigate("/", { replace: true, state: { postPublished: true, publishedPostId: post.id } });
    } catch (error) {
      setPostError(error instanceof Error ? error.message : "Unable to publish your post.");
      postSubmissionRef.current = null;
    } finally {
      setIsPublishingPost(false);
    }
  };

  const startLive = async () => {
    if (isStartingLive) return;
    if (!user) {
      navigate("/sign-in", { state: { from: "/create" } });
      return;
    }
    if (!title.trim()) {
      setLiveError("Add a title before going live.");
      return;
    }
    setIsStartingLive(true);
    setLiveError("");
    try {
      const session = await startLiveSession({ user, title, category: liveCategory });
      setLiveSession(session);
      navigate(`/live/${encodeURIComponent(session.liveSessionId)}`, { state: { liveStarted: true } });
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "Unable to start your Live.");
    } finally {
      setIsStartingLive(false);
    }
  };

  const generateCreatorAi = async (task: "caption" | "title" | "description" | "hashtags" | "shorts") => {
    if (aiLoadingTask) return;
    if (!user) {
      navigate("/sign-in", { state: { from: "/create" } });
      return;
    }
    const source = creatorTopic.trim() || description.trim() || title.trim() || contentTitle.trim();
    if (!source) {
      setAiError("Add a topic or a little content context before generating creator ideas.");
      return;
    }
    setAiLoadingTask(task);
    setAiError("");
    setAiStatus("");
    const formatContext =
      mediaType === "short" ? "a vertical Short" : mediaType === "video" ? "a long-form video" : "a social post";
    const prompts = {
      caption: `You are ZIVO's creator writing assistant. For ${formatContext} about: "${source}". Return exactly 4 concise, social-friendly caption suggestions, one per line. Vary the tone across confident, playful, cinematic, and conversational. No numbering, no hashtags, no commentary.`,
      title: `You are ZIVO's creator writing assistant. For ${formatContext} about: "${source}". Return exactly 5 compelling, accurate title suggestions, one per line. Keep each under 65 characters. No numbering or commentary.`,
      description: `You are ZIVO's creator writing assistant. Write one polished, creator-controlled description for ${formatContext} about: "${source}". Keep it under 90 words, accurate, engaging, and without hashtags or invented claims. Return only the description.`,
      hashtags: `You are ZIVO's creator writing assistant. Suggest 5 to 8 highly relevant, non-spammy social hashtags for ${formatContext} about: "${source}". Use only hashtags separated by spaces. Do not include irrelevant trending tags.`,
      shorts: `You are ZIVO's creator strategist. Based only on this long-form video topic or metadata: "${source}", propose 3 possible Shorts concepts. Do not claim to identify or extract real video moments. Return ONLY a JSON array with objects containing string keys hook, title, concept, duration, keyMoment. Duration should be a practical estimate such as "20–30 sec" and keyMoment should be a topic or suggested segment to create, not a claimed timestamp.`,
    };
    try {
      const response = await window.genmb.ai.complete(prompts[task], { maxTokens: task === "shorts" ? 700 : 400 });
      if (task === "caption") {
        const suggestions = toSuggestionList(response, 4);
        if (!suggestions.length) throw new Error("The AI did not return caption suggestions. Please try again.");
        setCaptionSuggestions(suggestions);
      } else if (task === "title") {
        const suggestions = toSuggestionList(response, 5);
        if (!suggestions.length) throw new Error("The AI did not return title suggestions. Please try again.");
        setTitleSuggestions(suggestions);
      } else if (task === "description") {
        const suggestion = response.trim();
        if (!suggestion) throw new Error("The AI did not return a description. Please try again.");
        setDescriptionSuggestions([suggestion]);
      } else if (task === "hashtags") {
        const suggestions = toHashtagList(response);
        if (!suggestions.length) throw new Error("The AI did not return usable hashtags. Please try again.");
        setHashtagSuggestions(suggestions);
      } else {
        setShortIdeas(parseShortIdeas(response));
      }
      setAiStatus(
        `${task === "shorts" ? "Short ideas" : `${task[0].toUpperCase()}${task.slice(1)} suggestions`} are ready to review.`,
      );
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI generation could not be completed.");
    } finally {
      setAiLoadingTask(null);
    }
  };

  const askCreatorAssistant = async () => {
    if (aiLoadingTask) return;
    if (!user) {
      navigate("/sign-in", { state: { from: "/create" } });
      return;
    }
    if (!assistantQuestion.trim()) {
      setAiError("Ask the assistant about your hook, title, caption, description, hashtags, or Short ideas.");
      return;
    }
    setAiLoadingTask("assistant");
    setAiError("");
    setAiStatus("");
    try {
      const context =
        creatorTopic.trim() ||
        description.trim() ||
        title.trim() ||
        contentTitle.trim() ||
        "No additional content context yet";
      const response = await window.genmb.ai.complete(
        `You are ZIVO's creator assistant. Content context: "${context}". Creator request: "${assistantQuestion.trim()}". Help with hooks, titles, captions, descriptions, hashtags, or Shorts ideas. Return practical, editable text only. Never claim you analyzed video or extracted actual footage.`,
        { maxTokens: 500 },
      );
      if (!response.trim()) throw new Error("The assistant did not return a response. Please try again.");
      setAssistantResponse(response.trim());
      setAiStatus("Creator assistant response is ready to edit or use.");
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "The creator assistant could not respond.");
    } finally {
      setAiLoadingTask(null);
    }
  };

  const generateTranslationDraft = async () => {
    if (aiLoadingTask) return;
    if (!user) {
      navigate("/sign-in", { state: { from: "/create" } });
      return;
    }
    if (translationTargetCode === primaryLanguageCode) {
      setAiError("Choose a different target language for this translation.");
      return;
    }
    const source = { title: contentTitle.trim(), caption: title.trim(), description: description.trim() };
    if (!source.title && !source.caption && !source.description) {
      setAiError("Add a title, caption, or description before translating.");
      return;
    }
    setAiLoadingTask("translation");
    setAiError("");
    setAiStatus("");
    try {
      const translate = async (text: string) =>
        text
          ? (await window.genmb.translate.text(text, translationTargetCode, primaryLanguageCode)).translated.trim()
          : "";
      const [translatedTitle, translatedCaption, translatedDescription] = await Promise.all([
        translate(source.title),
        translate(source.caption),
        translate(source.description),
      ]);
      if (!translatedTitle && !translatedCaption && !translatedDescription)
        throw new Error("Translation returned no editable text. Please try again.");
      setTranslationDraft({
        languageCode: translationTargetCode,
        title: translatedTitle,
        caption: translatedCaption,
        description: translatedDescription,
        status: "translated",
        createdAt: Date.now(),
      });
      setAiStatus("Translation is ready to review. Your original content remains unchanged.");
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Translation could not be completed.");
    } finally {
      setAiLoadingTask(null);
    }
  };

  const saveAiDraft = async () => {
    if (aiLoadingTask) return;
    if (!user) {
      navigate("/sign-in", { state: { from: "/create" } });
      return;
    }
    setAiLoadingTask("save");
    setAiError("");
    setAiStatus("");
    try {
      await saveCreatorAiDraft({
        version: 1,
        creatorId: user.id,
        topic: creatorTopic,
        title: contentTitle,
        caption: title,
        description,
        hashtags,
        captionSuggestions,
        titleSuggestions,
        descriptionSuggestions,
        hashtagSuggestions,
        shortIdeas,
        assistantQuestion,
        assistantResponse,
        translationFoundation: {
          primaryLanguageCode,
          translations: translationDraft
            ? [
                {
                  languageCode: translationDraft.languageCode,
                  title: translationDraft.title,
                  caption: translationDraft.caption,
                  description: translationDraft.description,
                  createdAt: translationDraft.createdAt,
                },
              ]
            : [],
          dubbingVersions: [{ targetLanguageCode: dubbingTargetCode, status: "unavailable", updatedAt: Date.now() }],
        },
        updatedAt: Date.now(),
      });
      setAiStatus("Private AI draft saved to your ZIVO account.");
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Unable to save your private AI draft.");
    } finally {
      setAiLoadingTask(null);
    }
  };

  const publishStory = async () => {
    if (isPublishingStory) return;
    if (!user) {
      navigate("/sign-in", { state: { from: "/create" } });
      return;
    }
    if (!selectedMedia || !title.trim()) return;

    await window.genmb.auth.ready();
    if (!window.genmb.auth.isAuthenticated() || window.genmb.auth.getUser()?.id !== user.id) {
      navigate("/sign-in", { state: { from: "/create" } });
      return;
    }

    setIsPublishingStory(true);
    setStoryError("");
    setStoryStatus("");
    setUploadProgress(0);
    try {
      const uploadedMedia = await localMediaFromFile(selectedMedia.file);
      await createStory({
        user,
        content: `${title.trim()}${hashtags.trim() ? ` ${hashtags.trim()}` : ""}`,
        media: { ...uploadedMedia, alt: `${title.trim()} — ${selectedMedia.file.name}` },
      });
      setStoryStatus("Your story is live for the next 24 hours.");
      setTitle("");
      setHashtags("");
      clearSelectedMedia();
      navigate("/", { replace: true, state: { storyPublished: true } });
    } catch (error) {
      setStoryError(error instanceof Error ? error.message : "Unable to publish your story.");
    } finally {
      setIsPublishingStory(false);
    }
  };

  return (
    <section aria-labelledby="create-heading" className="zivo-screen flex flex-col gap-6 pb-8">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary">Creator studio</p>
        <h1 id="create-heading" className="mt-2 text-2xl font-extrabold tracking-tight text-foreground">
          Create a post
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Choose your video first, add the details, then publish a private draft.
        </p>
      </div>

      {false && (
        <section
          aria-labelledby="trending-music-heading"
          className="-mx-5 overflow-hidden border-y border-border/70 bg-card/55 py-4"
        >
          <div className="flex items-end justify-between gap-4 px-5">
            <div>
              <div className="flex items-center gap-1.5 text-primary">
                <TrendingUp size={15} aria-hidden="true" />
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em]">For your next short</p>
              </div>
              <h2 id="trending-music-heading" className="mt-1 text-lg font-extrabold tracking-tight text-foreground">
                Trending Music
              </h2>
            </div>
            {selectedSoundId && (
              <p className="shrink-0 text-xs font-bold text-primary" role="status">
                Sound selected
              </p>
            )}
          </div>

          <div
            className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]"
            aria-label="Trending sample sounds"
          >
            {trendingSounds.map((sound) => {
              const isSelected = selectedSoundId === sound.id;
              const isPreviewing = previewingSoundId === sound.id;

              return (
                <article
                  key={sound.id}
                  className={cn(
                    "w-48 shrink-0 snap-start rounded-2xl border p-3 transition",
                    isSelected ? "border-primary bg-accent shadow-premium" : "border-border bg-card",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <img
                      data-genmb-img={sound.artworkSubject}
                      src={sound.artwork}
                      alt={`${sound.title} album artwork`}
                      className="size-12 shrink-0 rounded-xl object-cover"
                      onError={(event) => {
                        event.currentTarget.style.opacity = "0";
                      }}
                    />
                    <div className="min-w-0 pt-0.5">
                      <p className="truncate text-sm font-extrabold text-card-foreground">{sound.title}</p>
                      <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">{sound.artist}</p>
                      <div className="mt-1 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-primary">
                        <TrendingUp size={11} aria-hidden="true" />
                        <span>Trending</span>
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-xs font-semibold text-muted-foreground">{sound.uses}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewingSoundId((current) => (current === sound.id ? null : sound.id))}
                      aria-label={`${isPreviewing ? "Pause" : "Preview"} ${sound.title}`}
                      aria-pressed={isPreviewing}
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-xl border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        isPreviewing
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground hover:bg-muted",
                      )}
                    >
                      {isPreviewing ? (
                        <Pause size={17} fill="currentColor" aria-hidden="true" />
                      ) : (
                        <Play size={17} fill="currentColor" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSoundId(sound.id);
                        setPreviewingSoundId(null);
                      }}
                      aria-pressed={isSelected}
                      className={cn(
                        "min-h-10 flex-1 rounded-xl px-2 text-xs font-extrabold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.98]",
                        isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent",
                      )}
                    >
                      {isSelected ? (
                        <span className="inline-flex items-center justify-center gap-1">
                          <Check size={14} aria-hidden="true" /> Selected
                        </span>
                      ) : (
                        "Use this sound"
                      )}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="mt-3 px-5 text-xs text-muted-foreground">
            Sample sounds only — previews are visual UI states and no audio is played.
          </p>
        </section>
      )}

      {smartShortPlan && (
        <section
          aria-label="Smart Short plan"
          className="order-4 rounded-2xl border border-primary/35 bg-accent/55 p-4"
        >
          <p className="text-sm font-extrabold text-card-foreground">Smart Short plan</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Suggested {smartShortPlan.suggestedDuration} clip: {smartShortPlan.suggestedClip}. Video trimming is not
            available in this ZIVO environment, so upload the clip you choose before publishing. Your source video stays
            unchanged.
          </p>
        </section>
      )}
      {smartShortNotice && (
        <p
          role="status"
          className="order-4 rounded-xl border border-primary/35 bg-card px-3 py-2 text-xs font-semibold text-card-foreground"
        >
          {smartShortNotice}
        </p>
      )}

      <form
        className="order-2 flex flex-col gap-5 rounded-2xl border border-border bg-card p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (isLive) void startLive();
          else if (isStory) void publishStory();
          else void publishPost();
        }}
      >
        {!isLive && !isStory && user && (
          <div className="order-1 rounded-xl border border-border bg-background p-4">
            <label htmlFor="publish-identity" className="block text-sm font-extrabold text-card-foreground">
              Publish as
            </label>
            <select
              id="publish-identity"
              value={publishAsChannel ? "channel" : "personal"}
              disabled={channelLoading || isPublishingPost}
              onChange={(event) => {
                setPublishAsChannel(event.target.value === "channel");
                postIdempotencyKeyRef.current = null;
              }}
              className="mt-2 min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-card-foreground focus:border-primary focus:ring-2 focus:ring-ring"
            >
              <option value="personal">
                Post as Personal — {publishingProfile?.displayName || user.name || "Personal profile"}
              </option>
              {publishingProfile?.channelName && (
                <option value="channel">Post as Channel — {publishingProfile.channelName}</option>
              )}
            </select>
            <p className="mt-2 text-xs text-muted-foreground">
              {channelLoading
                ? "Loading channel…"
                : publishingProfile?.channelName
                  ? "Channel posts show only your channel name and logo. Set a separate channel logo in Profile."
                  : "Add a Channel Name in Profile to publish as your channel."}
            </p>
            {channelError && (
              <p role="alert" className="mt-2 text-xs text-primary">
                {channelError}
              </p>
            )}
          </div>
        )}
        {!isLive && (
          <section
            aria-label="Media upload area"
            className="order-1 rounded-3xl border border-dashed border-border bg-background p-4 shadow-premium"
          >
            <input
              ref={fileInputRef}
              type="file"
              aria-label="Choose media from your device"
              accept={acceptedMedia}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (isVideo) selectVideoWithSystemPicker(file);
                else selectMedia(file);
              }}
            />
            <div className="flex min-h-52 flex-col items-center justify-center overflow-hidden rounded-2xl border border-border bg-background px-5 py-5 text-center">
              {isVideo ? (
                uploadedVideo ? (
                  <div className="w-full max-w-56 overflow-hidden rounded-2xl border border-border bg-muted">
                    <video
                      src={uploadedVideo.url}
                      poster={videoThumbnail || undefined}
                      controls
                      playsInline
                      preload="metadata"
                      className={cn(
                        "block w-full bg-background",
                        mediaType === "video" ? "aspect-video" : "aspect-[4/5]",
                      )}
                      aria-label="Selected video preview"
                    >
                      Your browser does not support this video preview.
                    </video>
                  </div>
                ) : selectedMedia?.preview.url ? (
                  <div className="w-full max-w-56 overflow-hidden rounded-2xl border border-border bg-muted">
                    <video
                      src={selectedMedia.preview.url}
                      poster={videoThumbnail || undefined}
                      controls
                      playsInline
                      preload="metadata"
                      className={cn(
                        "block w-full bg-background",
                        mediaType === "video" ? "aspect-video" : "aspect-[4/5]",
                      )}
                      aria-label="Selected video preview"
                    >
                      Your browser does not support this video preview.
                    </video>
                  </div>
                ) : (
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
                    <Upload size={26} aria-hidden="true" />
                  </span>
                )
              ) : selectedMedia?.preview.url ? (
                <div className="relative w-full max-w-56 overflow-hidden rounded-2xl border border-border bg-muted">
                  <img
                    data-genmb-img="Selected ZIVO upload preview"
                    src={selectedMedia.preview.url}
                    alt="Selected upload preview"
                    className="aspect-[4/5] w-full object-cover"
                  />
                </div>
              ) : (
                <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
                  <Upload size={26} aria-hidden="true" />
                </span>
              )}
              <h2 className="mt-4 text-base font-extrabold text-card-foreground">
                {isVideo
                  ? videoDraft?.file.name || `Add your ${selectedOption.label.toLowerCase()}`
                  : selectedMedia
                    ? selectedMedia.file.name
                    : `Add your ${selectedOption.label.toLowerCase()}`}
              </h2>
              <p className="mt-2 max-w-60 text-xs leading-5 text-muted-foreground">
                {isVideo
                  ? videoDraft
                    ? "Video selected. Review the preview, add details below, then save it as a private draft."
                    : "Select a video from your device to begin. It stays on your device until you save the draft."
                  : selectedMedia
                    ? "Photo is prepared locally as an unpublished draft."
                    : "Select a photo from your device. Files stay local until you publish."}
              </p>
              {isVideo ? (
                <div className="mt-5 w-full max-w-sm text-left">
                  <button
                    type="button"
                    disabled={isPublishingPost}
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {videoDraft ? "Change video" : "Choose video"}
                  </button>
                  {videoDraft && !isPublishingPost && (
                    <button
                      type="button"
                      onClick={clearSelectedMedia}
                      className="mt-2 min-h-11 w-full rounded-xl border border-border px-4 text-sm font-extrabold text-muted-foreground transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      Clear selected video
                    </button>
                  )}
                  {videoDraft && (
                    <p role="status" className="mt-3 text-xs font-semibold text-muted-foreground">
                      {videoDraft.file.name} · {formatFileSize(videoDraft.file.size)} selected
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    disabled={isPublishingPost || isPublishingStory}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Upload size={17} aria-hidden="true" />
                    {selectedMedia ? "Choose another file" : `Choose ${selectedOption.label}`}
                  </button>
                  {selectedMedia && (
                    <button
                      type="button"
                      disabled={isPublishingPost || isPublishingStory}
                      onClick={clearSelectedMedia}
                      className="min-h-11 rounded-xl border border-border px-4 text-sm font-extrabold text-muted-foreground transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {false && !isLive && (
          <section
            aria-labelledby="ai-creator-tools-heading"
            className="rounded-2xl border border-primary/35 bg-accent/35 p-4"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Sparkles size={19} aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Creator control</p>
                <h2 id="ai-creator-tools-heading" className="mt-1 text-base font-extrabold text-card-foreground">
                  AI Creator Tools
                </h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Generate ideas, then review and choose every word yourself. Nothing here publishes automatically.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="ai-topic" className="text-sm font-extrabold text-card-foreground">
                Topic or content context
              </label>
              <textarea
                id="ai-topic"
                value={creatorTopic}
                onChange={(event) => setCreatorTopic(event.target.value)}
                placeholder="What is this video or post about? Add the key idea, audience, or angle…"
                rows={3}
                className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
              />
            </div>

            {aiError && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-primary/45 bg-card px-3 py-2 text-xs font-semibold text-card-foreground"
              >
                {aiError}
              </p>
            )}
            {aiStatus && (
              <p
                role="status"
                className="mt-3 rounded-xl border border-primary/45 bg-card px-3 py-2 text-xs font-semibold text-card-foreground"
              >
                {aiStatus}
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              {(
                [
                  ["caption", "Captions"],
                  ["title", "Titles"],
                  ["description", "Description"],
                  ["hashtags", "Hashtags"],
                ] as const
              ).map(([task, label]) => (
                <button
                  key={task}
                  type="button"
                  disabled={Boolean(aiLoadingTask) || !user}
                  onClick={() => void generateCreatorAi(task)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-extrabold text-card-foreground transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {aiLoadingTask === task ? (
                    <LoaderCircle className="zivo-loader" size={15} aria-hidden="true" />
                  ) : (
                    <Sparkles size={15} className="text-primary" aria-hidden="true" />
                  )}
                  {aiLoadingTask === task ? "Generating…" : label}
                </button>
              ))}
            </div>

            {(mediaType === "video" || mediaType === "short") && (
              <button
                type="button"
                disabled={Boolean(aiLoadingTask) || !user}
                onClick={() => void generateCreatorAi("shorts")}
                className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-card px-3 text-sm font-extrabold text-card-foreground transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                {aiLoadingTask === "shorts" ? (
                  <LoaderCircle className="zivo-loader" size={16} aria-hidden="true" />
                ) : (
                  <Lightbulb size={16} className="text-primary" aria-hidden="true" />
                )}
                {aiLoadingTask === "shorts" ? "Planning Shorts…" : "Generate smart Short ideas"}
              </button>
            )}
            {!isAuthLoading && !user && (
              <p className="mt-3 text-xs font-semibold text-primary">
                Sign in to generate or save private AI creator drafts.
              </p>
            )}

            {captionSuggestions.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <h3 className="text-sm font-extrabold text-card-foreground">Caption suggestions</h3>
                <div className="mt-2 space-y-2">
                  {captionSuggestions.map((suggestion, index) => (
                    <button
                      key={`${suggestion}-${index}`}
                      type="button"
                      onClick={() => setTitle(suggestion)}
                      className="w-full rounded-xl border border-border bg-card px-3 py-3 text-left text-xs font-semibold leading-5 text-card-foreground transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {suggestion}
                      <span className="mt-1 block font-extrabold text-primary">Use as caption</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {titleSuggestions.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <h3 className="text-sm font-extrabold text-card-foreground">Title suggestions</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {titleSuggestions.map((suggestion, index) => (
                    <button
                      key={`${suggestion}-${index}`}
                      type="button"
                      onClick={() => setContentTitle(suggestion)}
                      className="rounded-xl border border-border bg-card px-3 py-2 text-left text-xs font-extrabold text-card-foreground transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {descriptionSuggestions.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <h3 className="text-sm font-extrabold text-card-foreground">Description suggestion</h3>
                <button
                  type="button"
                  onClick={() => setDescription(descriptionSuggestions[0])}
                  className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-3 text-left text-xs font-semibold leading-5 text-card-foreground transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {descriptionSuggestions[0]}
                  <span className="mt-1 block font-extrabold text-primary">Use as description</span>
                </button>
              </div>
            )}
            {hashtagSuggestions.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <h3 className="text-sm font-extrabold text-card-foreground">Relevant hashtags</h3>
                <button
                  type="button"
                  onClick={() => setHashtags(hashtagSuggestions.join(" "))}
                  className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-3 text-left text-xs font-semibold text-card-foreground transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {hashtagSuggestions.join(" ")}
                  <span className="mt-1 block font-extrabold text-primary">Use these hashtags</span>
                </button>
              </div>
            )}
            {shortIdeas.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <h3 className="text-sm font-extrabold text-card-foreground">Smart Short ideas</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Concept suggestions only — ZIVO does not analyze footage or extract actual moments.
                </p>
                <div className="mt-3 space-y-2">
                  {shortIdeas.map((idea, index) => (
                    <article key={`${idea.title}-${index}`} className="rounded-xl border border-border bg-card p-3">
                      <p className="text-xs font-extrabold text-primary">
                        {idea.duration} · {idea.keyMoment}
                      </p>
                      <p className="mt-1 text-sm font-extrabold text-card-foreground">{idea.title}</p>
                      <p className="mt-1 text-xs font-semibold text-muted-foreground">Hook: {idea.hook}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{idea.concept}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setContentTitle(idea.title);
                          setTitle(idea.hook);
                        }}
                        className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs font-extrabold text-foreground transition hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        Use hook + title
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 border-t border-border pt-4">
              <label htmlFor="creator-assistant" className="text-sm font-extrabold text-card-foreground">
                Ask your creator assistant
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="creator-assistant"
                  value={assistantQuestion}
                  onChange={(event) => setAssistantQuestion(event.target.value)}
                  placeholder="Improve my hook, caption, title…"
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  disabled={Boolean(aiLoadingTask) || !user}
                  onClick={() => void askCreatorAssistant()}
                  aria-label="Ask creator assistant"
                  className="flex min-h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {aiLoadingTask === "assistant" ? (
                    <LoaderCircle className="zivo-loader" size={17} aria-hidden="true" />
                  ) : (
                    <Send size={17} aria-hidden="true" />
                  )}
                </button>
              </div>
              {assistantResponse && (
                <textarea
                  aria-label="Editable creator assistant response"
                  value={assistantResponse}
                  onChange={(event) => setAssistantResponse(event.target.value)}
                  rows={5}
                  className="mt-3 w-full resize-none rounded-xl border border-border bg-card px-3 py-3 text-xs leading-5 text-card-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                />
              )}
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <div className="flex items-start gap-3">
                <Languages size={18} className="mt-0.5 text-primary" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-extrabold text-card-foreground">Languages & dubbing</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Translate creator-provided text with ZIVO Translation, then review every field before it is saved.
                    Original text is never replaced.
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-xs font-extrabold text-card-foreground">
                  Original language
                  <select
                    value={primaryLanguageCode}
                    onChange={(event) => setPrimaryLanguageCode(event.target.value)}
                    className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                  >
                    {zivoLanguages.map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-extrabold text-card-foreground">
                  Translate to
                  <select
                    value={translationTargetCode}
                    onChange={(event) => setTranslationTargetCode(event.target.value)}
                    className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                  >
                    {zivoLanguages.map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="button"
                disabled={Boolean(aiLoadingTask) || !user}
                onClick={() => void generateTranslationDraft()}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/45 bg-card px-3 text-sm font-extrabold text-card-foreground transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                {aiLoadingTask === "translation" ? (
                  <LoaderCircle className="zivo-loader" size={16} aria-hidden="true" />
                ) : (
                  <Languages size={16} className="text-primary" aria-hidden="true" />
                )}
                {aiLoadingTask === "translation" ? "Translating…" : "Generate translation"}
              </button>
              {translationDraft && (
                <div className="mt-3 space-y-2 rounded-xl border border-border bg-background p-3">
                  <p className="text-xs font-extrabold text-primary">
                    Editable{" "}
                    {zivoLanguages.find((language) => language.code === translationDraft.languageCode)?.label ??
                      translationDraft.languageCode}{" "}
                    version
                  </p>
                  <label className="block text-xs font-bold text-card-foreground">
                    Title
                    <textarea
                      value={translationDraft.title}
                      onChange={(event) =>
                        setTranslationDraft((current) =>
                          current ? { ...current, title: event.target.value } : current,
                        )
                      }
                      rows={2}
                      className="mt-1 w-full resize-none rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-card-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <label className="block text-xs font-bold text-card-foreground">
                    Caption
                    <textarea
                      value={translationDraft.caption}
                      onChange={(event) =>
                        setTranslationDraft((current) =>
                          current ? { ...current, caption: event.target.value } : current,
                        )
                      }
                      rows={2}
                      className="mt-1 w-full resize-none rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-card-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <label className="block text-xs font-bold text-card-foreground">
                    Description
                    <textarea
                      value={translationDraft.description}
                      onChange={(event) =>
                        setTranslationDraft((current) =>
                          current ? { ...current, description: event.target.value } : current,
                        )
                      }
                      rows={3}
                      className="mt-1 w-full resize-none rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-card-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setTranslationDraft(null)}
                    className="min-h-10 rounded-lg border border-border px-3 text-xs font-extrabold text-muted-foreground transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Remove translation version
                  </button>
                </div>
              )}
              <div className="mt-3 rounded-xl border border-border bg-background px-3 py-3">
                <div className="flex items-center gap-2 text-xs font-extrabold text-card-foreground">
                  <Mic2 size={15} className="text-primary" aria-hidden="true" /> AI dubbing status: unavailable
                </div>
                <label className="mt-2 block text-xs font-semibold text-muted-foreground">
                  Target audio language
                  <select
                    value={dubbingTargetCode}
                    onChange={(event) => setDubbingTargetCode(event.target.value)}
                    className="mt-1 min-h-10 w-full rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-card-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                  >
                    {zivoLanguages.map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  No audio is generated here. This deployment has translation but no configured speech-to-text,
                  text-to-speech, or media-muxing service. A future provider such as the ElevenLabs Dubbing API is
                  required for actual dubbing.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={Boolean(aiLoadingTask) || !user}
              onClick={() => void saveAiDraft()}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-premium transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={17} aria-hidden="true" />
              {aiLoadingTask === "save" ? "Saving private draft…" : "Save private AI draft"}
            </button>
          </section>
        )}

        {isVideo && (
          <div className="order-1 space-y-1">
            <label htmlFor="content-title" className="text-sm font-extrabold text-card-foreground">
              Video title <span className="font-medium text-muted-foreground">(optional)</span>
            </label>
            <input
              id="content-title"
              maxLength={120}
              value={contentTitle}
              onChange={(event) => {
                postIdempotencyKeyRef.current = null;
                setContentTitle(event.target.value);
                setVideoDraft((current) => (current ? { ...current, title: event.target.value } : current));
              }}
              placeholder="Give your video a clear title…"
              className="mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>
        )}

        {!isLive && (
          <div className="order-2 space-y-1">
            <label htmlFor="post-description" className="text-sm font-extrabold text-card-foreground">
              Description <span className="font-medium text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="post-description"
              maxLength={2000}
              value={description}
              onChange={(event) => {
                postIdempotencyKeyRef.current = null;
                setDescription(event.target.value);
                setVideoDraft((current) => (current ? { ...current, description: event.target.value } : current));
              }}
              placeholder="Add context for viewers…"
              rows={3}
              className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>
        )}

        <details className="order-4 rounded-xl border border-border bg-background p-4 text-card-foreground [&[open]>div]:mt-4 [&[open]>div+div]:mt-4">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-ring">
            More Options <ChevronDown size={18} aria-hidden="true" />
          </summary>
          <div>
            <label htmlFor="post-title" className="text-sm font-extrabold text-card-foreground">
              {isLive ? "Live title" : isStory ? "Story caption" : "Caption"}
            </label>
            <textarea
              id="post-title"
              maxLength={500}
              value={title}
              onChange={(event) => {
                postIdempotencyKeyRef.current = null;
                setTitle(event.target.value);
              }}
              placeholder={
                isLive
                  ? "Give your Live a clear title…"
                  : isStory
                    ? "Share a moment with your followers…"
                    : "Tell people about this post…"
              }
              rows={3}
              className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
            />
          </div>

          {isLive ? (
            <div>
              <label htmlFor="live-category" className="text-sm font-extrabold text-card-foreground">
                Live category <span className="font-medium text-muted-foreground">(optional)</span>
              </label>
              <input
                id="live-category"
                value={liveCategory}
                onChange={(event) => setLiveCategory(event.target.value)}
                maxLength={64}
                placeholder="Music, gaming, behind the scenes…"
                className="mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
              />
            </div>
          ) : (
            <div>
              <label htmlFor="post-hashtags" className="text-sm font-extrabold text-card-foreground">
                Hashtags
              </label>
              <input
                id="post-hashtags"
                value={hashtags}
                onChange={(event) => {
                  postIdempotencyKeyRef.current = null;
                  setHashtags(event.target.value);
                }}
                placeholder="#zivo #create #yourtopic"
                className="mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}

          {!isLive && !isVideo && (
            <div>
              <label htmlFor="visibility" className="text-sm font-extrabold text-card-foreground">
                Visibility
              </label>
              <div className="relative mt-2">
                <select
                  id="visibility"
                  value={visibility}
                  onChange={(event) => {
                    postIdempotencyKeyRef.current = null;
                    setVisibility(event.target.value);
                    setVideoDraft((current) =>
                      current ? { ...current, visibility: toVideoVisibility(event.target.value) } : current,
                    );
                  }}
                  className="min-h-12 w-full appearance-none rounded-xl border border-border bg-background px-3 pr-10 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring"
                >
                  <option>Public</option>
                  <option>Followers</option>
                  <option>Private</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  size={18}
                  aria-hidden="true"
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Your post will be visible to: {visibility}.</p>
            </div>
          )}
        </details>
        {isLive && (
          <div className="order-6 rounded-2xl border border-primary/35 bg-accent/55 p-4">
            <div className="flex items-center gap-2 text-primary">
              <Radio size={18} aria-hidden="true" />
              <p className="text-sm font-extrabold text-card-foreground">Live session foundation</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Your session and chat are saved to ZIVO. Broadcasting is not started here because no streaming provider is
              connected yet.
            </p>
            {liveError && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-primary/45 bg-card px-3 py-2 text-xs font-semibold text-card-foreground"
              >
                {liveError}
              </p>
            )}
            {liveSession && (
              <p
                role="status"
                className="mt-3 rounded-xl border border-primary/45 bg-card px-3 py-2 text-xs font-semibold text-card-foreground"
              >
                Your Live is active.
              </p>
            )}
            {!isAuthLoading && !user && (
              <p className="mt-3 text-xs font-semibold text-primary">Sign in to start a persistent Live session.</p>
            )}
            <button
              type="submit"
              disabled={isAuthLoading || isStartingLive || (Boolean(user) && !title.trim())}
              className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-premium transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Radio size={17} aria-hidden="true" />
              {isAuthLoading
                ? "Checking account…"
                : isStartingLive
                  ? "Starting Live…"
                  : user
                    ? "Start Live session"
                    : "Sign in to go Live"}
            </button>
          </div>
        )}

        <details className="order-5 rounded-xl border border-border bg-background p-4 text-card-foreground">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-ring">
            Format: {selectedOption.label} <ChevronDown size={18} aria-hidden="true" />
          </summary>
          <section aria-label="Choose what to create" className="mt-3 grid grid-cols-2 gap-3">
            {creationOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = mediaType === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setMediaType(option.id);
                    clearSelectedMedia();
                    setStoryError("");
                    setStoryStatus("");
                    setPostError("");
                    setPostStatus("");
                  }}
                  aria-pressed={isSelected}
                  className={cn(
                    "relative min-h-28 rounded-2xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    isSelected
                      ? "border-primary bg-accent text-card-foreground shadow-premium"
                      : "border-border bg-card text-card-foreground hover:border-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-10 items-center justify-center rounded-xl",
                      isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span className="mt-2 block text-sm font-extrabold">{option.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.detail}</span>
                  {isSelected && (
                    <Check className="absolute right-3 top-3 text-primary" size={18} aria-label="Selected" />
                  )}
                </button>
              );
            })}
          </section>
        </details>

        {!isStory && !isLive && (
          <div className="order-6 rounded-2xl border border-primary/35 bg-accent/55 p-4">
            <p className="text-sm font-extrabold text-card-foreground">Publish post</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {isVideo
                ? "Save your selected video privately to your profile. Edit its details and visibility later in Creator Studio."
                : "Your photo remains local until you confirm publishing. Public posts appear in Home and on your profile."}
            </p>
            {postError && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-primary/45 bg-card px-3 py-2 text-xs font-semibold text-card-foreground"
              >
                {postError}
              </p>
            )}
            {isPublishingPost && (
              <p role="status" className="mt-3 text-xs font-semibold text-muted-foreground">
                Saving your post to ZIVO…
              </p>
            )}
            {postStatus && (
              <p
                role="status"
                className="mt-3 rounded-xl border border-primary/45 bg-card px-3 py-2 text-xs font-semibold text-card-foreground"
              >
                {postStatus}
              </p>
            )}
            {!isAuthLoading && !user && (
              <p className="mt-3 text-xs font-semibold text-primary">Sign in to publish a persistent post.</p>
            )}
            <button
              type="submit"
              disabled={
                isAuthLoading || isPublishingPost || (Boolean(user) && (!selectedMedia || (!isVideo && !title.trim())))
              }
              className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-premium transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send size={17} aria-hidden="true" />
              {isAuthLoading
                ? "Checking account…"
                : isPublishingPost
                  ? "Publishing post…"
                  : user
                    ? isVideo
                      ? "Publish draft"
                      : "Publish post"
                    : "Sign in to publish draft"}
            </button>
            {user && (!selectedMedia || (!isVideo && !title.trim())) && (
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                {isVideo
                  ? "Choose a video above to save a private draft."
                  : "Add media and a caption to publish your post."}
              </p>
            )}
          </div>
        )}

        {isStory && (
          <div className="order-6 rounded-2xl border border-primary/35 bg-accent/55 p-4">
            <p className="text-sm font-extrabold text-card-foreground">Share to your story</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Your story stays active for 24 hours and is saved to your ZIVO account.
            </p>
            {storyError && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-primary/45 bg-card px-3 py-2 text-xs font-semibold text-card-foreground"
              >
                {storyError}
              </p>
            )}
            {isPublishingStory && (
              <p role="status" className="mt-3 text-xs font-semibold text-muted-foreground">
                Uploading media{uploadProgress ? ` · ${uploadProgress}%` : "…"}
              </p>
            )}
            {storyStatus && (
              <p
                role="status"
                className="mt-3 rounded-xl border border-primary/45 bg-card px-3 py-2 text-xs font-semibold text-card-foreground"
              >
                {storyStatus}
              </p>
            )}
            {!isAuthLoading && !user && (
              <p className="mt-3 text-xs font-semibold text-primary">Sign in to publish a persistent story.</p>
            )}
            <button
              type="submit"
              disabled={isAuthLoading || isPublishingStory || (Boolean(user) && (!selectedMedia || !title.trim()))}
              className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-premium transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Camera size={17} aria-hidden="true" />
              {isAuthLoading
                ? "Checking account…"
                : isPublishingStory
                  ? "Publishing story…"
                  : user
                    ? "Publish story"
                    : "Sign in to publish"}
            </button>
            {user && (!selectedMedia || !title.trim()) && (
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                Add media and a caption to publish your story.
              </p>
            )}
          </div>
        )}
      </form>

      {isPrivacyConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-background/80 p-4 backdrop-blur-sm sm:items-center sm:justify-center"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-confirmation-title"
            className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 shadow-float"
          >
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary">Before you publish</p>
            <h2 id="privacy-confirmation-title" className="mt-1 text-xl font-extrabold text-card-foreground">
              Choose who can see this post
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Your video remains an unpublished draft until you confirm. Only Public posts are added to Home.
            </p>
            <div className="mt-4 space-y-2" role="radiogroup" aria-label="Post privacy">
              {(
                [
                  ["Public", "Anyone on ZIVO can find it in Home."],
                  ["Followers", "Only your followers can view it from your profile."],
                  ["Private", "Only you can view it from your profile."],
                ] as const
              ).map(([option, detail]) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={visibility === option}
                  disabled={isPublishingPost}
                  onClick={() => {
                    postIdempotencyKeyRef.current = null;
                    setVisibility(option);
                    setVideoDraft((current) => (current ? { ...current, visibility: option } : current));
                  }}
                  className={cn(
                    "w-full rounded-2xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60",
                    visibility === option ? "border-primary bg-accent" : "border-border bg-background hover:bg-muted",
                  )}
                >
                  <span className="block text-sm font-extrabold text-card-foreground">{option}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span>
                </button>
              ))}
            </div>
            {postError && (
              <p role="alert" className="mt-3 text-xs font-semibold text-primary">
                {postError}
              </p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isPublishingPost}
                onClick={() => setIsPrivacyConfirmOpen(false)}
                className="min-h-11 rounded-xl border border-border px-3 text-sm font-extrabold text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
              >
                Keep editing
              </button>
              <button
                type="button"
                disabled={isPublishingPost}
                onClick={() => void confirmPublishPost()}
                className="min-h-11 rounded-xl bg-primary px-3 text-sm font-extrabold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
              >
                {isPublishingPost ? "Publishing…" : `Publish ${visibility}`}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
