import { useSyncExternalStore, type CSSProperties } from "react"
import {
  Box,
  Button,
  HoverCard,
  Image,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react"
import {
  createPagePreviewKey,
  createPartMaskPreviewKey,
  type PagePreviewAsset,
  type PartMaskPreviewAsset,
  type PreviewAsset,
  type PreviewAssetKey,
  type PreviewAssetState,
  type PreviewAssetStore,
  type RegionPreviewSource,
} from "@/features/steps/preview-assets"

const PREVIEW_ZOOM_PANEL_MAX_W = "min(calc(100vw - 32px), 860px)"
const PREVIEW_ZOOM_IMAGE_MAX_HEIGHT_VH = 62
const PREVIEW_ZOOM_IMAGE_MIN_W = 520
const PREVIEW_ZOOM_IMAGE_MAX_W = 860

export type PreviewImageSize = {
  height: number
  width: number
}

type PreviewImageSizing = "fit" | "original"

export function PreviewCard({
  alt,
  imageSize,
  imageSizing = "fit",
  imageDataUrl,
  maxZoomScale,
  minH,
  pageNumber,
  partMaskItemId,
  pendingLabel,
  previewBackground,
  previewAssetStore,
  regionPreview,
  thumbnailMaxPixels,
  thumbnailMaxW,
  title,
}: {
  alt: string
  imageSize?: PreviewImageSize
  imageSizing?: PreviewImageSizing
  imageDataUrl: string | undefined
  maxZoomScale?: number
  minH: string
  pageNumber?: number
  partMaskItemId?: string
  pendingLabel?: string
  previewBackground?: string
  previewAssetStore?: PreviewAssetStore
  regionPreview?: RegionPreviewSource
  thumbnailMaxPixels?: number
  thumbnailMaxW?: string
  title?: string
}) {
  const shouldShrinkWrap = imageSizing === "original"

  return (
    <Box
      bg="bagging.surface.subtle"
      borderColor="bagging.border"
      borderRadius="panel"
      borderWidth="1px"
      boxShadow="0 1px 2px rgba(21, 26, 20, 0.04)"
      className="preview-card"
      maxW="100%"
      p={shouldShrinkWrap ? 1 : { base: 3, md: 3 }}
      position="relative"
      style={shouldShrinkWrap ? { width: "fit-content" } : undefined}
      transition="border-color 120ms ease, box-shadow 120ms ease"
      w={shouldShrinkWrap ? "fit-content" : undefined}
      zIndex={0}
      _focusWithin={{
        borderColor: "moss.200",
        boxShadow: "0 6px 18px rgba(21, 26, 20, 0.08)",
        zIndex: 30,
      }}
      _hover={{
        borderColor: "moss.200",
        boxShadow: "0 6px 18px rgba(21, 26, 20, 0.08)",
        zIndex: 30,
      }}
    >
      <Stack gap={2}>
        {title ? (
          <Text color="bagging.muted" fontSize="xs" fontWeight="medium">
            {title}
          </Text>
        ) : null}
        <PreviewImage
          alt={alt}
          imageDataUrl={imageDataUrl}
          imageSize={imageSize}
          imageSizing={imageSizing}
          maxZoomScale={maxZoomScale}
          minH={minH}
          pageNumber={pageNumber}
          partMaskItemId={partMaskItemId}
          pendingLabel={pendingLabel}
          previewBackground={previewBackground}
          previewAssetStore={previewAssetStore}
          regionPreview={regionPreview}
          thumbnailMaxPixels={thumbnailMaxPixels}
          thumbnailMaxW={thumbnailMaxW}
        />
      </Stack>
    </Box>
  )
}

function PreviewImage({
  alt,
  imageDataUrl,
  imageSize,
  imageSizing,
  maxZoomScale,
  minH,
  pageNumber,
  partMaskItemId,
  pendingLabel = "Preview pending",
  previewBackground,
  previewAssetStore,
  regionPreview,
  thumbnailMaxPixels,
  thumbnailMaxW,
}: {
  alt: string
  imageDataUrl: string | undefined
  imageSize?: PreviewImageSize
  imageSizing: PreviewImageSizing
  maxZoomScale?: number
  minH: string
  pageNumber?: number
  partMaskItemId?: string
  pendingLabel?: string
  previewBackground?: string
  previewAssetStore?: PreviewAssetStore
  regionPreview?: RegionPreviewSource
  thumbnailMaxPixels?: number
  thumbnailMaxW?: string
}) {
  const pageAssetState = usePreviewAsset(
    previewAssetStore,
    regionPreview
      ? createPagePreviewKey(regionPreview.pageNumber)
      : pageNumber
        ? createPagePreviewKey(pageNumber)
        : null,
  )
  const partMaskState = usePreviewAsset(
    previewAssetStore,
    partMaskItemId ? createPartMaskPreviewKey(partMaskItemId) : null,
  )
  const normalizedImageSize = normalizePreviewImageSize(imageSize)
  const source = resolvePreviewSource({
    fallbackImageDataUrl: imageDataUrl,
    imageSize: normalizedImageSize,
    pageAssetState,
    pageNumber,
    partMaskState,
    regionPreview,
  })
  const sourceImageSize = source?.imageSize ?? normalizedImageSize
  const originalImageSize = imageSizing === "original" ? sourceImageSize : null
  const originalThumbnailSize = originalImageSize
    ? scalePreviewImageSize(originalImageSize, thumbnailMaxPixels)
    : null
  const fitImageFrameStyle = !originalImageSize && sourceImageSize
    ? {
        aspectRatio: `${sourceImageSize.width} / ${sourceImageSize.height}`,
        ...(thumbnailMaxW ? { maxWidth: thumbnailMaxW } : {}),
      }
    : undefined

  if (!source) {
    const pendingFrameStyle = originalThumbnailSize
      ? {
          height: `${originalThumbnailSize.height}px`,
          width: `${originalThumbnailSize.width}px`,
        }
      : fitImageFrameStyle

    return (
      <Box
        alignItems="center"
        bg={previewBackground ?? "bagging.preview"}
        borderColor="bagging.border"
        borderRadius="panel"
        borderStyle="dashed"
        borderWidth="1px"
        color="bagging.muted"
        display="flex"
        fontSize="xs"
        justifyContent="center"
        minH={originalImageSize ? undefined : minH}
        maxW={originalImageSize ? undefined : thumbnailMaxW}
        px={2}
        style={pendingFrameStyle}
        textAlign="center"
        w={originalImageSize ? undefined : "full"}
        data-preview-background={previewBackground}
      >
        {pendingLabel}
      </Box>
    )
  }

  const thumbnailImageStyle = originalThumbnailSize
    ? {
        height: `${originalThumbnailSize.height}px`,
        width: `${originalThumbnailSize.width}px`,
      }
    : fitImageFrameStyle
  const zoomScale = normalizePreviewZoomScale(maxZoomScale)
  const zoomImageStyle = originalImageSize
    ? {
        aspectRatio: `${originalImageSize.width} / ${originalImageSize.height}`,
        width: `${Math.round(originalImageSize.width * zoomScale)}px`,
      }
    : createHoverPreviewStyle(source, zoomScale)

  return (
    <HoverCard.Root
      closeDelay={120}
      openDelay={120}
      positioning={{
        fitViewport: true,
        flip: true,
        gutter: 8,
        overflowPadding: 16,
        placement: "bottom-start",
        sameWidth: false,
        slide: true,
        strategy: "fixed",
      }}
    >
      <HoverCard.Trigger asChild>
        <Box
          className="preview-frame"
          bg={previewBackground ?? "bagging.preview"}
          borderColor="bagging.border"
          borderRadius="panel"
          borderWidth="1px"
          boxShadow="inset 0 1px 0 rgba(255, 255, 255, 0.65)"
          minH={originalImageSize ? undefined : minH}
          maxW={originalImageSize ? undefined : thumbnailMaxW}
          overflow="visible"
          p={originalImageSize ? 1 : 2}
          position="relative"
          style={originalImageSize ? { width: "fit-content" } : undefined}
          tabIndex={0}
          w={originalImageSize ? "fit-content" : undefined}
          zIndex={0}
          data-preview-background={previewBackground}
          _focusWithin={{ zIndex: 40 }}
          _hover={{ zIndex: 40 }}
        >
          <PreviewVisual
            alt={alt}
            fitImageFrameStyle={fitImageFrameStyle}
            background={previewBackground}
            imageSizing={imageSizing}
            minH={minH}
            source={source}
            style={thumbnailImageStyle}
          />
        </Box>
      </HoverCard.Trigger>
      <Portal>
        <HoverCard.Positioner zIndex={100}>
          <HoverCard.Content
            bg="bagging.surface"
            borderColor="bagging.border"
            borderRadius="panel"
            borderWidth="1px"
            boxShadow="0 18px 44px rgba(21, 26, 20, 0.18)"
            className="preview-zoom-panel"
            maxW={PREVIEW_ZOOM_PANEL_MAX_W}
            p={1}
            w="fit-content"
          >
            <PreviewVisual
              alt=""
              ariaHidden
              background={previewBackground}
              imageSizing="fit"
              minH={minH}
              source={source}
              style={zoomImageStyle}
            />
          </HoverCard.Content>
        </HoverCard.Positioner>
      </Portal>
    </HoverCard.Root>
  )
}

export function PreviewTextHandle({
  label,
  previewAlt,
  previewAssetStore,
  previewImageDataUrl,
  previewPageNumber,
  previewRegion,
}: {
  label: string
  previewAlt: string
  previewAssetStore: PreviewAssetStore
  previewImageDataUrl: string | undefined
  previewPageNumber?: number
  previewRegion?: RegionPreviewSource
}) {
  const pageAssetState = usePreviewAsset(
    previewAssetStore,
    previewRegion
      ? createPagePreviewKey(previewRegion.pageNumber)
      : previewPageNumber
        ? createPagePreviewKey(previewPageNumber)
        : null,
  )
  const source = resolvePreviewSource({
    fallbackImageDataUrl: previewImageDataUrl,
    imageSize: null,
    pageAssetState,
    pageNumber: previewPageNumber,
    partMaskState: EMPTY_PREVIEW_ASSET_STATE,
    regionPreview: previewRegion,
  })
  const hoverPreviewStyle = source ? createHoverPreviewStyle(source) : undefined

  return (
    <HoverCard.Root
      closeDelay={120}
      openDelay={120}
      positioning={{
        fitViewport: true,
        flip: true,
        gutter: 8,
        overflowPadding: 16,
        placement: "bottom-start",
        sameWidth: false,
        slide: true,
        strategy: "fixed",
      }}
    >
      <HoverCard.Trigger asChild>
        <Button
          borderBottomColor="bagging.action"
          borderBottomWidth="1px"
          color="bagging.action"
          fontSize="sm"
          fontWeight="medium"
          h="auto"
          minW="0"
          p={0}
          type="button"
          variant="plain"
        >
          {label}
        </Button>
      </HoverCard.Trigger>
      <Portal>
        <HoverCard.Positioner zIndex={100}>
          <HoverCard.Content
            bg="bagging.surface"
            borderColor="bagging.border"
            borderRadius="panel"
            borderWidth="1px"
            boxShadow="0 18px 44px rgba(21, 26, 20, 0.18)"
            maxW={PREVIEW_ZOOM_PANEL_MAX_W}
            p={1}
            w="fit-content"
          >
            {source ? (
              <PreviewVisual
                alt={previewAlt}
                imageSizing="fit"
                minH="120px"
                source={source}
                style={hoverPreviewStyle}
              />
            ) : (
              <Box
                alignItems="center"
                bg="bagging.preview"
                borderColor="bagging.border"
                borderRadius="panel"
                borderStyle="dashed"
                borderWidth="1px"
                color="bagging.muted"
                display="flex"
                fontSize="xs"
                h="120px"
                justifyContent="center"
                px={4}
                textAlign="center"
                w="220px"
              >
                Preview unavailable
              </Box>
            )}
          </HoverCard.Content>
        </HoverCard.Positioner>
      </Portal>
    </HoverCard.Root>
  )
}

type ResolvedPreviewSource =
  | {
      imageSize?: PreviewImageSize
      kind: "direct"
      url: string
    }
  | {
      imageSize?: PreviewImageSize
      kind: "region"
      pageAsset: PagePreviewAsset
      regionPreview: RegionPreviewSource
    }

function PreviewVisual({
  alt,
  ariaHidden = false,
  background,
  fitImageFrameStyle,
  imageSizing,
  maxH,
  minH,
  source,
  style,
}: {
  alt: string
  ariaHidden?: boolean
  background?: string
  fitImageFrameStyle?: { aspectRatio: string }
  imageSizing: PreviewImageSizing
  maxH?: string
  minH: string
  source: ResolvedPreviewSource
  style?: CSSProperties
}) {
  if (source.kind === "region") {
    return (
      <RegionPreview
        alt={alt}
        ariaHidden={ariaHidden}
        background={background}
        imageSizing={imageSizing}
        maxH={maxH}
        minH={minH}
        pageAsset={source.pageAsset}
        regionPreview={source.regionPreview}
        style={style}
      />
    )
  }

  return (
    <Image
      alt={alt}
      aria-hidden={ariaHidden}
      bg={background ?? "bagging.surface"}
      borderColor="bagging.border"
      borderRadius="0"
      borderWidth="1px"
      display="block"
      maxH={imageSizing === "original" ? undefined : maxH}
      maxW={imageSizing === "original" ? undefined : "100%"}
      objectFit="contain"
      src={source.url}
      style={style ?? fitImageFrameStyle}
      w={imageSizing === "original" ? "auto" : "full"}
    />
  )
}

function RegionPreview({
  alt,
  ariaHidden = false,
  background,
  imageSizing,
  maxH,
  minH,
  pageAsset,
  regionPreview,
  style,
}: {
  alt: string
  ariaHidden?: boolean
  background?: string
  imageSizing: PreviewImageSizing
  maxH?: string
  minH: string
  pageAsset: PagePreviewAsset
  regionPreview: RegionPreviewSource
  style?: CSSProperties
}) {
  const naturalRegion = scaleRegionToPagePreviewAsset(regionPreview, pageAsset)
  const normalizedRegion = normalizePreviewImageSize(regionPreview.region)
  const originalStyle = imageSizing === "original" && normalizedRegion
    ? {
        height: `${normalizedRegion.height}px`,
        width: `${normalizedRegion.width}px`,
      }
    : undefined
  const frameStyle = style ?? originalStyle ?? {
    aspectRatio: `${naturalRegion.width} / ${naturalRegion.height}`,
  }

  return (
    <Box
      aria-hidden={ariaHidden}
      aria-label={!ariaHidden && alt ? alt : undefined}
      bg={background ?? "bagging.surface"}
      borderColor="bagging.border"
      borderRadius="0"
      borderWidth="1px"
      display="block"
      maxH={imageSizing === "original" ? undefined : maxH}
      maxW={imageSizing === "original" ? undefined : "100%"}
      overflow="hidden"
      position="relative"
      role={!ariaHidden && alt ? "img" : undefined}
      style={frameStyle}
      w={imageSizing === "original" ? "auto" : "full"}
    >
      <Image
        alt=""
        aria-hidden="true"
        draggable={false}
        h={`${(pageAsset.naturalHeight / naturalRegion.height) * 100}%`}
        left={`-${(naturalRegion.x / naturalRegion.width) * 100}%`}
        maxW="none"
        objectFit="fill"
        position="absolute"
        src={pageAsset.url}
        top={`-${(naturalRegion.y / naturalRegion.height) * 100}%`}
        userSelect="none"
        w={`${(pageAsset.naturalWidth / naturalRegion.width) * 100}%`}
      />
    </Box>
  )
}

function resolvePreviewSource({
  fallbackImageDataUrl,
  imageSize,
  pageAssetState,
  pageNumber,
  partMaskState,
  regionPreview,
}: {
  fallbackImageDataUrl: string | undefined
  imageSize: PreviewImageSize | null
  pageAssetState: PreviewAssetState
  pageNumber?: number
  partMaskState: PreviewAssetState
  regionPreview?: RegionPreviewSource
}): ResolvedPreviewSource | null {
  if (partMaskState.status === "ready" && isPartMaskAsset(partMaskState.asset)) {
    return {
      imageSize: imageSize ?? {
        height: partMaskState.asset.height,
        width: partMaskState.asset.width,
      },
      kind: "direct",
      url: partMaskState.asset.url,
    }
  }

  if (regionPreview && pageAssetState.status === "ready" && isPagePreviewAsset(pageAssetState.asset)) {
    return {
      imageSize: {
        height: regionPreview.region.height,
        width: regionPreview.region.width,
      },
      kind: "region",
      pageAsset: pageAssetState.asset,
      regionPreview,
    }
  }

  if (pageNumber && pageAssetState.status === "ready" && isPagePreviewAsset(pageAssetState.asset)) {
    return {
      imageSize: imageSize ?? {
        height: pageAssetState.asset.baseHeight,
        width: pageAssetState.asset.baseWidth,
      },
      kind: "direct",
      url: pageAssetState.asset.url,
    }
  }

  return fallbackImageDataUrl
    ? {
        imageSize: imageSize ?? undefined,
        kind: "direct",
        url: fallbackImageDataUrl,
      }
    : null
}

function usePreviewAsset(
  store: PreviewAssetStore | undefined,
  key: PreviewAssetKey | null,
): PreviewAssetState {
  return useSyncExternalStore(
    (listener) => (store && key ? store.subscribe(key, listener) : () => undefined),
    () => (store && key ? store.getSnapshot(key) : EMPTY_PREVIEW_ASSET_STATE),
    () => EMPTY_PREVIEW_ASSET_STATE,
  )
}

function isPagePreviewAsset(asset: PreviewAsset): asset is PagePreviewAsset {
  return "pageNumber" in asset
}

function isPartMaskAsset(asset: PreviewAsset): asset is PartMaskPreviewAsset {
  return "partItemId" in asset
}

const EMPTY_PREVIEW_ASSET_STATE: PreviewAssetState = { status: "idle" }

function createHoverPreviewStyle(
  source: ResolvedPreviewSource,
  zoomScale = 2,
): CSSProperties {
  const imageSize = source.imageSize

  if (!imageSize) {
    return { width: `min(calc(100vw - 48px), ${PREVIEW_ZOOM_IMAGE_MAX_W}px)` }
  }

  const aspectRatio = imageSize.width / imageSize.height
  const heightBoundWidth = Math.max(1, aspectRatio * PREVIEW_ZOOM_IMAGE_MAX_HEIGHT_VH)
  const scaledWidth = imageSize.width * zoomScale
  const width = Math.min(
    PREVIEW_ZOOM_IMAGE_MAX_W,
    Math.max(PREVIEW_ZOOM_IMAGE_MIN_W, scaledWidth),
  )

  return {
    aspectRatio: `${imageSize.width} / ${imageSize.height}`,
    width: `min(calc(100vw - 48px), ${width}px, ${formatCssNumber(heightBoundWidth)}vh)`,
  }
}

function formatCssNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function scaleRegionToPagePreviewAsset(
  regionPreview: RegionPreviewSource,
  pageAsset: PagePreviewAsset,
): { height: number; width: number; x: number; y: number } {
  const baseLeft = clamp(regionPreview.region.x, 0, regionPreview.baseWidth)
  const baseTop = clamp(regionPreview.region.y, 0, regionPreview.baseHeight)
  const baseRight = clamp(
    regionPreview.region.x + regionPreview.region.width,
    0,
    regionPreview.baseWidth,
  )
  const baseBottom = clamp(
    regionPreview.region.y + regionPreview.region.height,
    0,
    regionPreview.baseHeight,
  )
  const scaleX = pageAsset.naturalWidth / regionPreview.baseWidth
  const scaleY = pageAsset.naturalHeight / regionPreview.baseHeight
  const x = Math.floor(baseLeft * scaleX)
  const y = Math.floor(baseTop * scaleY)
  const right = Math.ceil(baseRight * scaleX)
  const bottom = Math.ceil(baseBottom * scaleY)

  return {
    height: Math.max(1, bottom - y),
    width: Math.max(1, right - x),
    x,
    y,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalizePreviewImageSize(imageSize: PreviewImageSize | undefined) {
  if (!imageSize || !Number.isFinite(imageSize.width) || !Number.isFinite(imageSize.height)) {
    return null
  }

  return {
    height: Math.max(1, Math.round(imageSize.height)),
    width: Math.max(1, Math.round(imageSize.width)),
  }
}

function scalePreviewImageSize(
  imageSize: PreviewImageSize,
  maxPixels: number | undefined,
): PreviewImageSize {
  if (!maxPixels || !Number.isFinite(maxPixels) || maxPixels <= 0) {
    return imageSize
  }

  const scale = Math.min(1, maxPixels / Math.max(imageSize.width, imageSize.height))

  return {
    height: Math.max(1, Math.round(imageSize.height * scale)),
    width: Math.max(1, Math.round(imageSize.width * scale)),
  }
}

function normalizePreviewZoomScale(maxZoomScale: number | undefined) {
  if (!maxZoomScale || !Number.isFinite(maxZoomScale) || maxZoomScale <= 0) {
    return 2
  }

  return maxZoomScale
}
