const path = require('node:path')

const dev = process.env.NODE_ENV !== 'production'

module.exports = {
  presets: ['next/babel'],
  plugins: [
    [
      '@stylexjs/babel-plugin',
      {
        aliases: {
          '#/*': [path.join(__dirname, 'src/*')],
        },
        dev,
        enableInlinedConditionalMerge: true,
        runtimeInjection: false,
        treeshakeCompensation: true,
        unstable_moduleResolution: { type: 'commonJS' },
      },
    ],
  ],
}
