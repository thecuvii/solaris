import { Button } from '@base-ui/react/button'
import { createHighlighterCoreSync } from '@shikijs/core'
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript'
import tsx from '@shikijs/langs/tsx'
import vesper from '@shikijs/themes/vesper'
import * as stylex from '@stylexjs/stylex'
import NumberFlow, { continuous } from '@number-flow/react'
import { useClipboard } from 'foxact/use-clipboard'
import { useAtomValue, useStore } from 'jotai'
import { motion, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'
import { TextMorph } from 'torph/react'

import { getPrecision, numberFlowFormat, numberFlowTimings } from './setting-format'
import { hasTextures, siteOrigin, textures } from './showcase-data'
import type { Planet, PlanetId } from './showcase-data'
import { initialSettings, parameterDefinitions } from '../planet-params/planet-params'
import type { ParameterDefinition, PlanetSettings } from '../planet-params/planet-params'
import { planetExampleDeclarations, planetExampleProps } from '../planets/example-declarations'
import { planetSettingsAtom, settingAtom } from './showcase-settings'
import { track } from './track'

const highlighter = createHighlighterCoreSync({
  engine: createJavaScriptRegexEngine(),
  langs: [tsx],
  themes: [vesper],
})

function formatSettingValue(definition: ParameterDefinition, value: boolean | number): string {
  if (typeof value === 'boolean' || definition.kind === 'boolean') return String(value)
  return Number(value).toFixed(getPrecision(definition.step))
}

function redactedPackageSpecifier(entry: string): string {
  return '█'.repeat(18 + entry.length)
}

function buildExampleCode(planet: Planet, settings: PlanetSettings): string {
  const componentName = planet.componentName ?? planet.name
  const planetTextures = hasTextures(planet.id) ? textures[planet.id] : undefined
  const textureDeclaration = planetTextures
    ? `const textures = {
${Object.entries(planetTextures)
  .map(([name, source]) => `  ${name}: '${siteOrigin}${source}',`)
  .join('\n')}
}

`
    : ''
  const modelDeclaration = planetExampleDeclarations[planet.id] ?? ''
  const propLines = [
    planetTextures && '  textures={textures}',
    planetExampleProps[planet.id],
    ...parameterDefinitions[planet.id].map((definition) => {
      return `  ${definition.name}={${formatSettingValue(definition, settings[definition.name])}}`
    }),
  ].filter(Boolean)
  return `import { ${componentName} } from '${redactedPackageSpecifier(planet.packageName)}'

${textureDeclaration}${modelDeclaration}<${componentName}
${propLines.join('\n')}
/>`
}

function AnimatedCodeValue({
  color,
  definition,
  planetId,
}: {
  color: string | undefined
  definition: ParameterDefinition
  planetId: PlanetId
}) {
  const setting = useAtomValue(settingAtom({ name: definition.name, planetId }))

  if (definition.kind === 'boolean') {
    return (
      <span style={{ color }}>
        <TextMorph as="span" duration={400} scale style={{ verticalAlign: 'baseline' }}>
          {String(setting)}
        </TextMorph>
      </span>
    )
  }

  const effectValue = Number(setting)
  const precision = getPrecision(definition.step)

  return (
    <NumberFlow
      format={numberFlowFormat(precision)}
      isolate
      plugins={[continuous]}
      style={{ color }}
      value={effectValue}
      willChange
      {...numberFlowTimings}
      {...stylex.props(styles.codeNumberFlow)}
    />
  )
}

export function CodeBlock({ planet }: { planet: Planet }) {
  const { copied, copy } = useClipboard({ timeout: 1500 })
  const reduceMotion = useReducedMotion()
  const store = useStore()
  const fileStem = planet.componentName ?? planet.name
  const highlightedCode = useMemo(() => {
    const staticCode = buildExampleCode(planet, initialSettings[planet.id])
    const ranges = parameterDefinitions[planet.id].map((definition) => {
      const propertyPrefix = `  ${definition.name}=`
      const value = formatSettingValue(definition, initialSettings[planet.id][definition.name])
      const start = staticCode.indexOf(propertyPrefix) + propertyPrefix.length + 1
      return { definition, end: start + value.length, start }
    })
    const lines = highlighter.codeToTokensBase(staticCode, {
      lang: 'tsx',
      theme: 'vesper',
    })

    return { lines, ranges }
  }, [planet])

  return (
    <section {...stylex.props(styles.codeSection, planet.id === 'sky' && styles.codeSectionFlat)}>
      <div data-chrome-probe="code" {...stylex.props(styles.codeHeader)}>
        <div {...stylex.props(styles.codeFile)}>
          <CodeFileIcon />
          <span>
            <TextMorph
              as="span"
              disabled={Boolean(reduceMotion)}
              duration={220}
              ease="cubic-bezier(0.22, 1, 0.36, 1)"
              scale={false}
            >
              {fileStem}
            </TextMorph>
            .tsx
          </span>
        </div>
        <Button
          aria-label={copied ? 'Code copied' : 'Copy code'}
          onClick={() => {
            track('clicked_copy', { kind: 'code', planet_id: planet.id })
            void copy(buildExampleCode(planet, store.get(planetSettingsAtom(planet.id))))
          }}
          type="button"
          {...stylex.props(styles.codeFile, styles.codeCopy, copied && styles.codeCopyCopied)}
        >
          <CopyIcon copied={copied} />
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre {...stylex.props(styles.code)}>
        <code>
          {highlightedCode.lines.map((line, lineIndex) => (
            <span key={line[0]?.offset ?? `blank-${lineIndex}`}>
              {line.map((token) => {
                const animatedValue = highlightedCode.ranges.find(
                  ({ end, start }) =>
                    token.offset < end && token.offset + token.content.length > start,
                )
                if (!animatedValue) {
                  if (token.content.includes('█')) {
                    return (
                      <span key={token.offset} style={{ color: token.color }}>
                        {"'"}
                        <span
                          aria-hidden="true"
                          {...stylex.props(styles.codeRedaction)}
                          style={{ width: `${token.content.replaceAll("'", '').length}ch` }}
                        />
                        {"'"}
                      </span>
                    )
                  }
                  return (
                    <span key={token.offset} style={{ color: token.color }}>
                      {token.content}
                    </span>
                  )
                }
                if (
                  token.offset > animatedValue.start ||
                  token.offset + token.content.length <= animatedValue.start
                ) {
                  return null
                }

                const before = token.content.slice(0, animatedValue.start - token.offset)
                const after = token.content.slice(animatedValue.end - token.offset)
                const valueToken = line.find(
                  ({ offset }) => offset >= animatedValue.start && offset < animatedValue.end,
                )
                return (
                  <span key={token.offset} style={{ color: token.color }}>
                    {before}
                    <AnimatedCodeValue
                      color={valueToken?.color ?? token.color}
                      definition={animatedValue.definition}
                      planetId={planet.id}
                    />
                    {after}
                  </span>
                )
              })}
              {'\n'}
            </span>
          ))}
        </code>
      </pre>
    </section>
  )
}

function CodeFileIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" {...stylex.props(styles.codeFileIcon)}>
      <path d="m5.5 5-3 3 3 3M10.5 5l3 3-3 3M9 3.5l-2 9" />
    </svg>
  )
}

const copyIconSwapTransition = { duration: 0.25, ease: 'easeInOut' } as const

export function CopyIcon({ copied }: { copied: boolean }) {
  const reduceMotion = useReducedMotion()
  const transition = reduceMotion ? { duration: 0 } : copyIconSwapTransition

  return (
    <span aria-hidden="true" {...stylex.props(styles.copyIconSwap)}>
      <motion.span
        animate={{
          filter: copied ? 'blur(2px)' : 'blur(0px)',
          opacity: copied ? 0 : 1,
          scale: copied ? 0.25 : 1,
        }}
        initial={false}
        style={{ gridArea: '1 / 1' }}
        transition={transition}
      >
        <svg viewBox="0 0 16 16" {...stylex.props(styles.copyIcon)}>
          <rect height="9" rx="1.5" width="9" x="5" y="2" />
          <path d="M11 11v1.5A1.5 1.5 0 0 1 9.5 14h-6A1.5 1.5 0 0 1 2 12.5v-6A1.5 1.5 0 0 1 3.5 5H5" />
        </svg>
      </motion.span>
      <motion.span
        animate={{
          filter: copied ? 'blur(0px)' : 'blur(2px)',
          opacity: copied ? 1 : 0,
          scale: copied ? 1 : 0.25,
        }}
        initial={false}
        style={{ gridArea: '1 / 1' }}
        transition={transition}
      >
        <svg viewBox="0 0 16 16" {...stylex.props(styles.copyIcon)}>
          <path d="m3 8.5 3 3 7-7" />
        </svg>
      </motion.span>
    </span>
  )
}

const styles = stylex.create({
  code: {
    backgroundColor: '#090c14',
    borderRadius: 10,
    color: '#b9b9b9',
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    fontSize: 12,
    lineHeight: 1.7,
    margin: 0,
    overflowX: 'auto',
    paddingBlock: 22,
    paddingInline: 18,
  },
  codeCopy: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: {
      default: 'var(--showcase-code-ink)',
      ':hover': 'var(--showcase-code-ink-hover)',
      ':focus-visible': 'var(--showcase-code-ink-hover)',
    },
    cursor: 'pointer',
    marginLeft: 'auto',
    padding: 0,
    textDecoration: { ':focus-visible': 'underline' },
    textUnderlineOffset: 3,
    transition: 'color 140ms ease-out',
    ':focus-visible': { outline: 'none' },
  },
  codeCopyCopied: {
    color: 'var(--showcase-code-ink-strong)',
  },
  codeFile: {
    alignItems: 'center',
    color: 'var(--showcase-code-ink)',
    display: 'flex',
    fontFamily: 'var(--font-sans)',
    fontSize: 11,
    fontWeight: 550,
    gap: 6,
    height: 32,
    transition: 'color 140ms ease-out',
  },
  codeFileIcon: {
    fill: 'none',
    height: 13,
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: 1.25,
    width: 13,
  },
  codeHeader: {
    alignItems: 'center',
    display: 'flex',
    height: 46,
    paddingInline: 10,
  },
  codeNumberFlow: {
    display: 'inline-block',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 0.85,
    verticalAlign: 'baseline',
    '--number-flow-mask-height': '0.12em',
    '--number-flow-mask-width': '0.3em',
  },
  codeRedaction: {
    backgroundColor: 'oklch(38% 0.008 80)',
    borderRadius: 1.5,
    display: 'inline-block',
    height: '0.88em',
    marginInline: '0.04em',
    userSelect: 'none',
    verticalAlign: '-0.08em',
  },
  codeSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.028)',
    backgroundImage:
      'linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.012))',
    backdropFilter: 'blur(22px) saturate(0.72)',
    borderRadius: 16,
    boxShadow:
      'inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 16px 40px rgba(0, 0, 0, 0.16)',
    gridColumn: '1 / -1',
    marginTop: 18,
    minWidth: 0,
    overflow: 'hidden',
    paddingBottom: 6,
    paddingInline: 6,
    paddingTop: 0,
  },
  // The Sky canvas animates under this header every frame; a backdrop blur
  // there is a per-frame GPU pass. Use a plain fill on that page instead.
  codeSectionFlat: {
    backdropFilter: 'none',
    backgroundColor: 'rgba(7, 8, 13, 0.55)',
  },
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
  copyIconSwap: {
    display: 'inline-grid',
    height: 13,
    placeItems: 'center',
    width: 13,
  },
})
