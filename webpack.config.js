var CopyWebpackPlugin = require('copy-webpack-plugin');
var path = require('path');

module.exports = function (env) {
  env = env || {};

  var config = {
    entry: './main.js',
    output: {
      library: 'sculptgl',
      libraryTarget: 'umd',
      path: path.resolve(__dirname, 'app'),
      filename: 'sculptgl.js',
      chunkFilename: '[name].chunk.js',
      // Same-folder as index.html + sculptgl.js so async XR/Three chunks resolve on static hosts.
      publicPath: './'
    },
    resolve: {
      modules: [
        path.join(__dirname, 'src'),
        path.join(__dirname, 'lib'),
        path.join(__dirname, 'node_modules')
      ]
    },
    module: {
      rules: [{
        test: /\.glsl$/,
        loader: 'raw-loader'
      },       {
        // Three r16x+ uses private fields / static blocks. Transform those only —
        // do NOT run preset-env (it breaks three.core ↔ three.module circular ESM → TDZ).
        test: /\.js$/,
        include: path.resolve(__dirname, 'node_modules', 'three'),
        use: [{
          loader: 'babel-loader',
          options: {
            babelrc: false,
            configFile: false,
            plugins: [
              '@babel/plugin-transform-class-static-block',
              '@babel/plugin-transform-private-methods',
              '@babel/plugin-transform-private-property-in-object'
            ]
          }
        }]
      }]
    },
    plugins: [],
    optimization: {
      chunkIds: 'named',
      moduleIds: 'named'
    }
  };

  config.mode = (env.release || env.website) ? 'production' : 'development';

  var indexFile;
  if (env.release) {
    indexFile = 'tools/index.release.html';
  } else if (env.website) {
    indexFile = 'tools/index.website.html';
  } else {
    indexFile = 'tools/index.dev.html';
  }

  config.plugins.push(new CopyWebpackPlugin({
    patterns: [
      { from: 'tools/authSuccess.html', to: 'authSuccess.html' },
      { from: indexFile, to: 'index.html' },
      {
        from: 'node_modules/@webxr-input-profiles/assets/dist',
        to: 'webxr-profiles'
      }
    ],
  }));

  if (env.release) {
    config.module.rules.push({
      test: /\.js$/,
      include: [
        path.resolve(__dirname, 'src'),
        path.resolve(__dirname, 'main.js')
      ],
      use: [{
        loader: 'babel-loader',
        options: {
          presets: ['@babel/preset-env']
        }
      }]
    });
  }

  return config;
};
