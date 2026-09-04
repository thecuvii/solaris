const babelConfig = require('./babel.config')

module.exports = {
  plugins: {
    '@stylexjs/postcss-plugin': {
      babelConfig: {
        babelrc: false,
        parserOpts: { plugins: ['typescript', 'jsx'] },
        plugins: babelConfig.plugins,
      },
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      useCSSLayers: true,
    },
    autoprefixer: {},
  },
}
