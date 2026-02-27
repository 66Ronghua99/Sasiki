const path = require('path');

module.exports = {
  entry: {
    background: './background.ts',
    content: './content.ts',
    sidebar: './sidebar.ts',
    axtree: './axtree.ts',
    visual_highlighter: './visual_highlighter.ts',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  optimization: {
    minimize: true,
  },
};
