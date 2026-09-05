import { Button } from '@base-ui/react/button'
import { PreviewCard } from '@base-ui/react/preview-card'
import * as stylex from '@stylexjs/stylex'
import { useClipboard } from 'foxact/use-clipboard'
import { useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { TextMorph } from 'torph/react'

import { CopyIcon } from './example-code'
import { getPlanetTextureAttribution, getPlanetTextureDocs, hasTextures } from './showcase-data'
import type { PlanetId, TextureDoc, TexturedPlanetId } from './showcase-data'

export function TextureDocs({ planetId }: { planetId: PlanetId }) {
  if (!hasTextures(planetId)) return null

  const docs = getPlanetTextureDocs(planetId)

  return (
    <section {...stylex.props(styles.textureSection)}>
      <div {...stylex.props(styles.textureHeadingRow)}>
        <h2 {...stylex.props(styles.textureHeading)}>Textures</h2>
        <TextureHeadingHelp />
      </div>
      <ul {...stylex.props(styles.textureList)}>
        {docs.map((doc) => (
          <TextureDocRow doc={doc} key={`${doc.key}:${doc.url}`} />
        ))}
      </ul>
      <TextureCreditCallout planetId={planetId} />
    </section>
  )
}

function TextureCreditCallout({ planetId }: { planetId: TexturedPlanetId }) {
  const credit = getPlanetTextureAttribution(planetId)

  return (
    <aside aria-label="Texture source and license" {...stylex.props(styles.textureCallout)}>
      <dl {...stylex.props(styles.textureCalloutList)}>
        <CreditField href={credit.sourceHref} label="Source" value={credit.source} />
        <CreditField href={credit.licenseHref} label="License" value={credit.license} />
      </dl>
    </aside>
  )
}

function CreditField({ href, label, value }: { href?: string; label: string; value: string }) {
  return (
    <div {...stylex.props(styles.textureCalloutRow)}>
      <dt {...stylex.props(styles.textureCalloutTerm)}>{label}</dt>
      <dd {...stylex.props(styles.textureCalloutValue)}>
        {href ? (
          <a
            href={href}
            rel="noreferrer"
            target="_blank"
            {...stylex.props(styles.textureCalloutLink)}
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}

function TextureHeadingHelp() {
  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger
        closeDelay={150}
        delay={200}
        render={<button type="button" />}
        {...stylex.props(styles.textureHelpTrigger)}
      >
        what's this?
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner
          align="center"
          side="top"
          sideOffset={8}
          {...stylex.props(styles.textureHelpPositioner)}
        >
          <PreviewCard.Popup {...stylex.props(styles.textureHelpPopup)}>
            <p {...stylex.props(styles.textureHelpCopy)}>
              The example already uses the hosted textures.
            </p>
            <p {...stylex.props(styles.textureHelpCopy)}>
              Download only if you want to host them yourself.
            </p>
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  )
}

function TextureDocRow({ doc }: { doc: TextureDoc }) {
  const { copied, copy } = useClipboard({ timeout: 1500 })
  const file = useTextureFileMeta(doc.url)
  const reduceMotion = useReducedMotion()
  const squarePreview = doc.key === 'observation' || doc.key === 'rings'

  return (
    <li {...stylex.props(styles.textureRow)}>
      <div {...stylex.props(styles.textureThumb)}>
        <img
          alt=""
          decoding="async"
          loading="lazy"
          src={doc.url}
          {...stylex.props(styles.textureThumbImage, squarePreview && styles.textureThumbContain)}
        />
        {doc.packed ? <span {...stylex.props(styles.textureThumbBadge)}>Packed</span> : null}
      </div>
      <div {...stylex.props(styles.textureCopy)}>
        <p {...stylex.props(styles.textureName)}>{doc.label}</p>
        <p {...stylex.props(styles.textureDescription)}>{doc.description}</p>
        <dl {...stylex.props(styles.textureStats)}>
          <div {...stylex.props(styles.textureStat)}>
            <dt {...stylex.props(styles.textureStatLabel)}>Format</dt>
            <dd {...stylex.props(styles.textureStatValue)}>{doc.format}</dd>
          </div>
          <div {...stylex.props(styles.textureStat)}>
            <dt {...stylex.props(styles.textureStatLabel)}>Size</dt>
            <dd {...stylex.props(styles.textureStatValue, styles.textureStatNumber)}>
              {file.bytes == null ? '—' : formatBytes(file.bytes)}
            </dd>
          </div>
          <div {...stylex.props(styles.textureStat)}>
            <dt {...stylex.props(styles.textureStatLabel)}>Resolution</dt>
            <dd {...stylex.props(styles.textureStatValue, styles.textureStatNumber)}>
              {file.width == null || file.height == null ? '—' : `${file.width}×${file.height}`}
            </dd>
          </div>
        </dl>
      </div>
      <div {...stylex.props(styles.textureActions)}>
        <Button
          aria-label={copied ? `${doc.label} URL copied` : `Copy ${doc.label} URL`}
          onClick={() => void copy(doc.url)}
          type="button"
          {...stylex.props(styles.textureAction, copied && styles.textureActionCopied)}
        >
          <CopyIcon copied={copied} />
          <span {...stylex.props(styles.textureActionLabel)}>
            <span aria-hidden="true" {...stylex.props(styles.textureActionLabelSizer)}>
              Copy URL
            </span>
            <span {...stylex.props(styles.textureActionLabelMorph)}>
              <TextMorph
                as="span"
                disabled={Boolean(reduceMotion)}
                duration={220}
                ease="cubic-bezier(0.22, 1, 0.36, 1)"
                scale={false}
              >
                {copied ? 'Copied' : 'Copy URL'}
              </TextMorph>
            </span>
          </span>
        </Button>
        <a
          aria-label={`Download ${doc.filename}`}
          download={doc.filename}
          href={doc.url}
          {...stylex.props(styles.textureAction)}
        >
          <DownloadIcon />
          Download
        </a>
      </div>
    </li>
  )
}

function useTextureFileMeta(url: string) {
  const [meta, setMeta] = useState<{
    bytes: number | null
    height: number | null
    width: number | null
  }>({
    bytes: null,
    height: null,
    width: null,
  })

  useEffect(() => {
    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (!cancelled) {
        setMeta((current) => ({
          ...current,
          height: image.naturalHeight,
          width: image.naturalWidth,
        }))
      }
    }
    image.src = url

    void fetch(url)
      .then(async (response) => {
        const length = Number(response.headers.get('content-length'))
        if (Number.isFinite(length) && length > 0) return length
        return (await response.blob()).size
      })
      .then((bytes) => {
        if (!cancelled) setMeta((current) => ({ ...current, bytes }))
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [url])

  return meta
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(bytes >= 10_485_760 ? 0 : 1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" {...stylex.props(styles.copyIcon)}>
      <path d="M8 2.5v8M5 8l3 3 3-3M3 13.5h10" />
    </svg>
  )
}

const styles = stylex.create({
  copyIcon: {
    display: 'block',
    fill: 'none',
    height: 13,
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.25,
    width: 13,
  },
  textureAction: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    color: {
      default: 'rgba(242, 232, 208, 0.5)',
      ':hover': '#f2e8d0',
      ':focus-visible': '#f2e8d0',
    },
    cursor: 'pointer',
    display: 'inline-flex',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 11,
    fontWeight: 550,
    gap: 6,
    height: 28,
    justifyContent: 'flex-start',
    padding: 0,
    textDecoration: {
      default: 'none',
      ':focus-visible': 'underline',
    },
    textUnderlineOffset: 3,
    transition: 'color 140ms ease-out',
    ':focus-visible': { outline: 'none' },
  },
  textureActionCopied: {
    color: '#f2e8d0',
  },
  textureActionLabel: {
    display: 'grid',
    justifyItems: 'start',
  },
  textureActionLabelMorph: {
    gridArea: '1 / 1',
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  },
  textureActionLabelSizer: {
    gridArea: '1 / 1',
    visibility: 'hidden',
    whiteSpace: 'nowrap',
  },
  textureActions: {
    display: 'flex',
    gap: 16,
    gridColumn: 1,
    gridRow: 2,
    minWidth: 0,
    '@media (max-width: 960px)': {
      gridRow: 3,
    },
  },
  textureCallout: {
    backgroundColor: 'rgba(7, 8, 13, 0.32)',
    borderRadius: 10,
    boxSizing: 'border-box',
    fontSize: 11,
    marginTop: 8,
    minWidth: 0,
    paddingBlock: 12,
    paddingInlineEnd: 14,
    paddingInlineStart: 0,
    width: '100%',
  },
  textureCalloutLink: {
    color: 'inherit',
    textDecoration: {
      default: 'none',
      ':hover': 'underline',
      ':focus-visible': 'underline',
    },
    textUnderlineOffset: 3,
    ':focus-visible': {
      outline: 'none',
    },
  },
  textureCalloutList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    margin: 0,
    minWidth: 0,
  },
  textureCalloutRow: {
    alignItems: 'baseline',
    display: 'flex',
    gap: 16,
    minWidth: 0,
  },
  textureCalloutTerm: {
    color: 'rgba(242, 232, 208, 0.38)',
    flexShrink: 0,
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 11,
    fontWeight: 550,
    letterSpacing: '-0.01em',
    lineHeight: 1.45,
    margin: 0,
    width: 56,
  },
  textureCalloutValue: {
    color: 'rgba(242, 232, 208, 0.72)',
    flex: 1,
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '-0.01em',
    lineHeight: 1.45,
    margin: 0,
    minWidth: 0,
    textWrap: 'pretty',
  },
  textureCopy: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    gap: 8,
    gridColumn: 2,
    gridRow: 1,
    minWidth: 0,
    paddingTop: 2,
    '@media (max-width: 960px)': {
      gridColumn: 1,
      gridRow: 2,
    },
  },
  textureDescription: {
    color: 'rgba(242, 232, 208, 0.58)',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 13,
    lineHeight: 1.5,
    margin: 0,
    textWrap: 'pretty',
  },
  textureHeading: {
    color: 'rgba(242, 232, 208, 0.82)',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
    margin: 0,
    width: 'fit-content',
  },
  textureHeadingRow: {
    alignItems: 'baseline',
    display: 'flex',
    gap: 8,
    minWidth: 0,
    paddingBottom: 12,
    paddingTop: 32,
    width: '100%',
  },
  textureHelpCopy: {
    margin: 0,
    whiteSpace: 'nowrap',
  },
  textureHelpPopup: {
    backgroundColor: '#12151c',
    borderRadius: 12,
    boxShadow:
      'inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.06), 0 16px 40px rgba(0, 0, 0, 0.32)',
    boxSizing: 'border-box',
    color: 'rgba(242, 232, 208, 0.72)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 13,
    gap: 8,
    lineHeight: 1.5,
    padding: 14,
    transformOrigin: 'var(--transform-origin)',
    transition: 'opacity 160ms ease-out, transform 160ms ease-out',
    width: 'max-content',
    ':is([data-starting-style], [data-ending-style])': {
      opacity: 0,
      transform: 'scale(0.96)',
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  textureHelpPositioner: {
    zIndex: 200,
  },
  textureHelpTrigger: {
    appearance: 'none',
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: {
      default: 'rgba(242, 232, 208, 0.42)',
      ':hover': 'rgba(242, 232, 208, 0.78)',
      ':focus-visible': 'rgba(242, 232, 208, 0.78)',
    },
    cursor: 'pointer',
    flexShrink: 0,
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: '-0.01em',
    lineHeight: 1.2,
    margin: 0,
    padding: 0,
    textDecoration: {
      default: 'none',
      ':focus-visible': 'underline',
    },
    textUnderlineOffset: 3,
    transition: 'color 140ms ease-out',
    ':focus-visible': {
      outline: 'none',
    },
  },
  textureList: {
    display: 'flex',
    flexDirection: 'column',
    listStyle: 'none',
    margin: 0,
    minWidth: 0,
    padding: 0,
  },
  textureName: {
    color: '#f2e8d0',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: '-0.01em',
    lineHeight: 1.2,
    margin: 0,
  },
  textureRow: {
    alignItems: 'stretch',
    columnGap: 30,
    display: 'grid',
    gridTemplateColumns: 'minmax(200px, 260px) minmax(0, 1fr)',
    gridTemplateRows: 'auto auto',
    listStyle: 'none',
    minWidth: 0,
    paddingBlock: 28,
    rowGap: 8,
    '@media (max-width: 960px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  textureSection: {
    gridColumn: '1 / -1',
    marginTop: 52,
    minWidth: 0,
  },
  textureStat: {
    alignItems: 'baseline',
    display: 'flex',
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  textureStatLabel: {
    color: 'rgba(242, 232, 208, 0.28)',
    fontSize: 10,
    fontWeight: 550,
    lineHeight: 1.2,
    margin: 0,
  },
  textureStatNumber: {
    fontVariantNumeric: 'tabular-nums',
  },
  textureStats: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 28,
    margin: 0,
    marginTop: 'auto',
    minWidth: 0,
    paddingTop: 12,
  },
  textureStatValue: {
    color: 'rgba(242, 232, 208, 0.52)',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 10,
    fontWeight: 550,
    letterSpacing: '-0.01em',
    lineHeight: 1.2,
    margin: 0,
  },
  textureThumb: {
    gridColumn: 1,
    gridRow: 1,
    aspectRatio: '2 / 1',
    backgroundColor: '#090c14',
    borderRadius: 10,
    boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  textureThumbBadge: {
    backgroundColor: 'rgba(7, 8, 13, 0.72)',
    borderRadius: 999,
    boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.1)',
    color: 'rgba(242, 232, 208, 0.78)',
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 9,
    fontWeight: 550,
    left: 6,
    letterSpacing: '0.02em',
    lineHeight: 1,
    paddingBlock: 4,
    paddingInline: 6,
    pointerEvents: 'none',
    position: 'absolute',
    top: 6,
  },
  textureThumbContain: {
    objectFit: 'contain',
  },
  textureThumbImage: {
    display: 'block',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center',
    width: '100%',
  },
})
