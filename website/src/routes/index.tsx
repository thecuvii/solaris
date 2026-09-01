import * as stylex from '@stylexjs/stylex'
import { Moon } from '@thecuvii/solaris/moon'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: HomePage })

const moonTextures = {
  albedo: '/textures/v1/moon/moon-albedo.webp',
  normalHeight: '/textures/v1/moon/moon-normal-height.webp',
}

function HomePage() {
  return (
    <main {...stylex.props(styles.page)}>
      <nav {...stylex.props(styles.navigation)}>
        <span {...stylex.props(styles.wordmark)}>Solaris</span>
        <a href="https://github.com/thecuvii/solaris" {...stylex.props(styles.link)}>
          GitHub
        </a>
      </nav>

      <section {...stylex.props(styles.hero)}>
        <div {...stylex.props(styles.copy)}>
          <p {...stylex.props(styles.eyebrow)}>React · WebGL2</p>
          <h1 {...stylex.props(styles.title)}>The solar system, rendered.</h1>
          <p {...stylex.props(styles.description)}>
            Physically informed celestial shader effects with a small React interface. Bring your
            own textures and tune every atmosphere, surface, and light source.
          </p>
          <pre {...stylex.props(styles.code)}>
            <code>{`import { Moon } from '@thecuvii/solaris/moon'

<Moon textures={{ albedo, normalHeight }} />`}</code>
          </pre>
        </div>

        <div {...stylex.props(styles.preview)} aria-label="Interactive lunar shader preview">
          <Moon textures={moonTextures} style={{ height: '100%', width: '100%' }} />
        </div>
      </section>
    </main>
  )
}

const styles = stylex.create({
  code: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    borderStyle: 'solid',
    borderWidth: 1,
    color: '#d6d6d6',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 13,
    lineHeight: 1.7,
    margin: 0,
    overflowX: 'auto',
    paddingBlock: 18,
    paddingInline: 20,
  },
  copy: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    maxWidth: 660,
  },
  description: {
    color: '#a1a1a1',
    fontSize: 'clamp(1rem, 2vw, 1.25rem)',
    lineHeight: 1.65,
    margin: 0,
    maxWidth: 590,
  },
  eyebrow: {
    color: '#858585',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.16em',
    margin: 0,
    textTransform: 'uppercase',
  },
  hero: {
    alignItems: 'center',
    display: 'grid',
    gap: 'clamp(3rem, 8vw, 8rem)',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 0.82fr)',
    minHeight: 'calc(100dvh - 96px)',
    paddingBlock: 'clamp(3rem, 8vw, 7rem)',
    '@media (max-width: 880px)': {
      gridTemplateColumns: '1fr',
    },
  },
  link: {
    color: '#a1a1a1',
    fontSize: 14,
    textDecoration: 'none',
    transition: 'color 160ms ease',
    ':hover': {
      color: '#ffffff',
    },
  },
  navigation: {
    alignItems: 'center',
    display: 'flex',
    height: 96,
    justifyContent: 'space-between',
  },
  page: {
    marginInline: 'auto',
    maxWidth: 1440,
    paddingInline: 'clamp(1.25rem, 5vw, 5rem)',
  },
  preview: {
    aspectRatio: '1',
    backgroundColor: '#000000',
    borderRadius: '50%',
    boxShadow: '0 0 100px rgba(181, 201, 255, 0.08)',
    maxWidth: 620,
    overflow: 'hidden',
    width: '100%',
    '@media (max-width: 880px)': {
      justifySelf: 'center',
    },
  },
  title: {
    fontSize: 'clamp(3.5rem, 8vw, 7.5rem)',
    fontWeight: 520,
    letterSpacing: '-0.065em',
    lineHeight: 0.92,
    margin: 0,
    textWrap: 'balance',
  },
  wordmark: {
    fontSize: 17,
    fontWeight: 620,
    letterSpacing: '-0.02em',
  },
})
