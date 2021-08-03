const path = require('path');

module.exports = {
  target: 'web',
  mode: process.env.NODE_ENV,
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    clean: true,
    globalObject: 'this',
    library: {
      name: '@artisnull/gin',
      type: 'umd',
      umdNamedDefine: true,
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'babel-loader',
        exclude: /node_modules/,
        // options: {
        //   configFile: 'tsconfig.json'
        // },
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
};
