import { useEffect, useRef, useState } from "react";
import { LivePhoto } from "./LivePhoto";
import {
  characterAssets,
  findCharacterAsset,
  findRenderFallbackAsset,
  findWarmNeighborAssets,
  parseSequenceSceneId,
  type CharacterAsset,
} from "./avatar-model";
import { transitionKind } from "./avatar-model";
import type { AvatarVisualState } from "./avatar-model";

const url = (asset: CharacterAsset) =>
  /^(?:https?:|file:|data:|blob:|\/|\.\/)/u.test(asset.src)
    ? asset.src
    : `${import.meta.env.BASE_URL}${asset.src}`;

function preloadImage(asset: CharacterAsset, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      signal.removeEventListener("abort", abort);
      error ? reject(error) : resolve();
    };
    const abort = () => finish(new Error("cancelled"));
    const timer = window.setTimeout(() => finish(new Error("image-timeout")), 12000);
    signal.addEventListener("abort", abort, { once: true });
    img.onload = () => {
      // Do not block a scene change on PNG decode. onload already means the
      // bytes are available; keep decode as a best-effort cache warm-up while
      // the previous frame crossfades underneath the new one.
      finish();
      if (typeof img.decode === "function") void img.decode().catch(() => undefined);
    };
    img.onerror = () => finish(new Error("image-load"));
    if (signal.aborted) abort(); else img.src = url(asset);
  });
}

function preloadVideo(asset: CharacterAsset, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      video.onloadeddata = null;
      video.onerror = null;
      signal.removeEventListener("abort", abort);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      error ? reject(error) : resolve();
    };
    const abort = () => {
      video.removeAttribute("src");
      video.load();
      finish(new Error("cancelled"));
    };
    const timer = window.setTimeout(() => finish(new Error("video-timeout")), 25000);
    signal.addEventListener("abort", abort, { once: true });
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => finish();
    video.onerror = () => finish(new Error("video-load"));
    if (signal.aborted) abort();
    else {
      video.src = url(asset);
      video.load();
    }
  });
}

function preload(asset: CharacterAsset, signal: AbortSignal) {
  return asset.mediaType === "video"
    ? preloadVideo(asset, signal)
    : preloadImage(asset, signal);
}

const warmedAssetIds = new Set<string>();
function warmAsset(asset: CharacterAsset | undefined) {
  if (!asset || warmedAssetIds.has(asset.id)) return;
  warmedAssetIds.add(asset.id);
  if (asset.mediaType === "video") {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.src = url(asset);
    video.load();
    return;
  }
  const img = new Image();
  img.decoding = "async";
  img.src = url(asset);
}

function intimacyWarmAssets() {
  const visual = characterAssets.filter((asset) =>
    asset.visualEmotion && ["flirty", "horny", "hornys"].includes(asset.visualEmotion.emotion),
  );
  const firstSx = characterAssets.filter((asset) => {
    const sequence = parseSequenceSceneId(asset.id);
    return sequence?.kind === "sx" && sequence.step === 1;
  });
  return [...visual, ...firstSx].slice(0, 6);
}

function VideoLayer({ asset }: { asset: CharacterAsset }) {
  const backdrop = useRef<HTMLVideoElement>(null);
  const foreground = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const videos = () => [backdrop.current, foreground.current].filter(Boolean) as HTMLVideoElement[];
    const sync = () => {
      const back = backdrop.current;
      const front = foreground.current;
      if (!back || !front) return;
      if (Math.abs(back.currentTime - front.currentTime) > 0.16) back.currentTime = front.currentTime;
    };
    const updatePlayback = () => {
      for (const video of videos()) {
        if (reduced.matches || document.hidden) video.pause();
        else void video.play().catch(() => undefined);
      }
      sync();
    };
    const onVisibility = () => updatePlayback();
    reduced.addEventListener?.("change", updatePlayback);
    document.addEventListener("visibilitychange", onVisibility);
    updatePlayback();
    return () => {
      reduced.removeEventListener?.("change", updatePlayback);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const video of videos()) video.pause();
    };
  }, [asset.id]);

  const position = asset.scenePosition ?? asset.focalPoint;
  const fit = asset.sceneFit ?? "contain";
  const scale = asset.sceneScale ?? 1;
  const foregroundStyle = {
    objectFit: fit,
    objectPosition: `${position[0]}% ${position[1]}%`,
    transform: `translateZ(0) scale(${scale})`,
  } as const;
  const source = url(asset);
  const fallback = findRenderFallbackAsset(asset);
  const poster = fallback.mediaType === "image" && fallback.id !== asset.id
    ? url(fallback)
    : undefined;

  return <>
    <video
      ref={backdrop}
      className="character-asset-backdrop character-asset-video"
      src={source}
      muted
      loop
      playsInline
      autoPlay
      preload="auto"
      poster={poster}
      aria-hidden="true"
      disablePictureInPicture
      tabIndex={-1}
    />
    <video
      ref={foreground}
      className="character-asset-image character-asset-video"
      src={source}
      muted
      loop
      playsInline
      autoPlay
      preload="auto"
      poster={poster}
      style={foregroundStyle}
      title={asset.description}
      disablePictureInPicture
      tabIndex={-1}
      onPlay={() => {
        const back = backdrop.current;
        const front = foreground.current;
        if (back && front && Math.abs(back.currentTime - front.currentTime) > 0.16)
          back.currentTime = front.currentTime;
      }}
      onTimeUpdate={() => {
        const back = backdrop.current;
        const front = foreground.current;
        if (back && front && Math.abs(back.currentTime - front.currentTime) > 0.2)
          back.currentTime = front.currentTime;
      }}
    />
  </>;
}

function ImageLayer({ asset, visualState, animate }: { asset: CharacterAsset; visualState: AvatarVisualState; animate: boolean }) {
  if (asset.mediaType === "video") return <VideoLayer asset={asset} />;
  const position = asset.scenePosition ?? asset.focalPoint;
  const fit = asset.sceneFit ?? "contain";
  const scale = asset.sceneScale ?? 1;
  const foregroundStyle = {
    objectFit: fit,
    objectPosition: `${position[0]}% ${position[1]}%`,
    transform: `translateZ(0) scale(${scale})`,
  } as const;
  return <>
    <img className="character-asset-backdrop" src={url(asset)} alt="" aria-hidden="true" />
    {animate && asset.motion === "reference_live_photo"
      ? <LivePhoto src={url(asset)} visualState={visualState} />
      : <img className="character-asset-image" src={url(asset)} alt={asset.description} style={foregroundStyle} />}
  </>;
}

export function AssetScene({
  assetId,
  visualState,
  warmIntimacy = false,
}: {
  assetId?: string;
  visualState: AvatarVisualState;
  warmIntimacy?: boolean;
}) {
  const requested = findCharacterAsset(assetId);
  const [scene, setScene] = useState<{ current: CharacterAsset; previous: CharacterAsset | null; kind: "dip" | "dissolve" }>({
    current: findCharacterAsset(), previous: null, kind: "dissolve",
  });
  const displayed = useRef(scene.current);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [renderRevision, setRenderRevision] = useState(0);
  const verified = useRef<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const ticket = ++generation.current;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setFailed(false);
    setScene(s => ({ ...s, previous: null }));
    if (requested.id === displayed.current.id && verified.current === requested.id) {
      setScene(s => ({ ...s, previous: null }));
      return () => controller.abort();
    }
    void preload(requested, controller.signal).then(() => {
      if (controller.signal.aborted || ticket !== generation.current) return;
      const sameAsset = requested.id === displayed.current.id;
      verified.current = requested.id;
      if (sameAsset) {
        setRenderRevision(value => value + 1);
        setFailed(false);
        setScene(s => ({ ...s, previous: null }));
        return;
      }
      const previous = displayed.current;
      displayed.current = requested;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setScene({ current: requested, previous: reduce ? null : previous, kind: transitionKind(previous, requested) });
      timer = setTimeout(() => {
        if (ticket === generation.current) setScene(s => ({ ...s, previous: null }));
      }, 950);
    }).catch(() => {
      if (controller.signal.aborted || ticket !== generation.current) return;
      const fallback = findRenderFallbackAsset(requested);
      if (requested.id !== fallback.id) {
        displayed.current = fallback;
        verified.current = fallback.id;
        setFailed(false);
        setRenderRevision((value) => value + 1);
        setScene({ current: fallback, previous: null, kind: "dissolve" });
        return;
      }
      setFailed(true);
      setScene(s => ({ ...s, previous: null }));
    });
    return () => { controller.abort(); clearTimeout(timer); };
  }, [requested.id, retry]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      findWarmNeighborAssets(requested.id, warmIntimacy, 4).forEach((asset, index) => {
        window.setTimeout(() => warmAsset(asset), index * 140);
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [requested.id, warmIntimacy]);

  useEffect(() => {
    if (!warmIntimacy) return;
    const timer = window.setTimeout(() => {
      intimacyWarmAssets().forEach((asset, index) => {
        window.setTimeout(() => warmAsset(asset), index * 180);
      });
    }, 1_100);
    return () => window.clearTimeout(timer);
  }, [warmIntimacy]);

  useEffect(() => {
    const currentSequence = parseSequenceSceneId(scene.current.id);
    if (currentSequence?.kind !== "sx") return;
    const next = characterAssets
      .filter((asset) => parseSequenceSceneId(asset.id)?.kind === "sx")
      .map((asset) => ({ asset, info: parseSequenceSceneId(asset.id)! }))
      .filter(({ info }) => info.step > currentSequence.step)
      .sort((a, b) => a.info.step - b.info.step || a.asset.id.localeCompare(b.asset.id))[0]?.asset;
    const timer = window.setTimeout(() => warmAsset(next), 250);
    return () => window.clearTimeout(timer);
  }, [scene.current.id]);

  return <>
    <div
      className={`asset-scene ${scene.previous ? `asset-transition ${scene.kind}` : ""}`}
      data-asset-id={scene.current.id}
      data-media-type={scene.current.mediaType}
    >
      <div key={`current-${scene.current.id}-${renderRevision}`} className="asset-layer asset-current">
        <ImageLayer asset={scene.current} visualState={visualState} animate={!scene.previous} />
      </div>
      {scene.previous && <div key={`previous-${scene.previous.id}`} className="asset-layer asset-previous" aria-hidden="true">
        <ImageLayer asset={scene.previous} visualState={visualState} animate={false} />
      </div>}
    </div>
    {failed && <button className="asset-retry" type="button" onClick={() => setRetry(v => v + 1)}>Образ не загрузился · повторить</button>}
  </>;
}
