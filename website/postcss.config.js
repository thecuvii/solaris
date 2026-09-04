const babelConfig = require('./babel.config')

module.exports = {
  plugins: {
    '@stylexjs/postcss-plugin': {
      babelConfig: {
        babelrc: false,
        parserOpts: { plugins: ['typescript', 'jsx'] },
        plugins: babelConfig.plugins,
      },
      include: ['app/**/*.{js,jsx,ts,tsx}', 'modules/**/*.{js,jsx,ts,tsx}'],
      useCSSLayers: true,
    },
    autoprefixer: {},
  },
}
